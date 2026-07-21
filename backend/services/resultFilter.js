/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Result Filter  (backend/services/resultFilter.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Last-line relevance judge for a result pool that has NO strong (name/
 * category) literal anchor — pure semantic and/or LLM-rescue-only matches,
 * where the relative semantic cutoff has nothing real to calibrate against
 * and near-floor noise leaks through (a laundry basket for "shampoo", a
 * wireless charger for "ac", a laptop mixed in with monitors for "tv").
 * Thresholds can't fix this — a real weak-category match and pure noise both
 * score in the same band without a strong match to anchor the gap. This asks
 * an LLM to make the judgment call a number can't.
 *
 * STRICT RULES (by design, not just validation):
 *   - The LLM may only VETO candidates already in the grounded pool. It can
 *     never add, reorder, or rewrite anything — this file returns IDs to
 *     keep, nothing else, so the caller's own order/content is untouched.
 *   - Any validation failure (unavailable LLM, bad JSON, wrong shape, an
 *     out-of-range index) fails OPEN: every candidate is kept, exactly as if
 *     the filter had never run. A broken judge must never make results worse.
 *
 * [Task: search-relevance] GUARDS added on top of the above (nondeterminism
 * observed live: Groq vetoed the top-2 semantic scorers — the only two real
 * phones in the catalog — on different runs of "phone"/"mobile"/"phones"/
 * "mobiles"):
 *   - TINY POOL SKIP: pools of <= TINY_POOL_MAX items never reach the LLM at
 *     all. Below this size there's essentially nothing to lose a comparison
 *     against, and the downside of a bad veto (a scarce result gone) is far
 *     worse than the upside (catching a rare single-item noise leak) — this
 *     supersedes the older single-item-pool rationale below step 1.
 *   - TOP-SCORER PROTECTION: items within `filterProtectMargin` (searchConfig.js)
 *     of the pool's top `_searchSemantic` score are excluded from the prompt
 *     entirely — the LLM never sees them as an option, so it structurally
 *     cannot veto them, regardless of what it returns.
 *
 * [Task: search-tuning] The tiny-pool skip is DENIED to rescue-derived pools
 * (options.isRescuePool, set by the caller — nepShopSearchAdapter.js is the
 * only place that knows a pool's origin, so this file never infers it). The
 * branch-vs-main comparison found a real case: the LLM rescue reinterpreted
 * "ring" as "accessory", which then weak-matched a product literally named
 * "...with Accessories" (a doll set, not a ring) — a wrong 1-item pool that
 * the tiny-pool skip let straight through with no sanity check. A rescue
 * pool's relevance is inherently less trustworthy than an organic one (it's
 * the LLM's OWN reinterpretation of the query being judged against the
 * LLM's OWN candidate selection), so it always gets the LLM's judgment
 * regardless of size. Organic pools keep the ≤3 skip unchanged — that's
 * still where the real "only 2 phones in the catalog" scarcity lives.
 * Top-scorer protection is unaffected either way: it still applies to any
 * pool — rescue-derived or organic — that reaches the LLM.
 *
 * EXPORTS
 *   filterResults(query, products, options) -> Promise<{
 *     keptIds: string[], fired: boolean, droppedCount: number,
 *     failedOpen: boolean, skipReason: string|null,
 *   }>
 *   options.isRescuePool: boolean — caller-supplied, see above.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { generate } = require('./chatbot/ollamaService');
const config = require('./searchConfig');

const MAX_CANDIDATES  = 15; // sane cap on what we ever send the LLM
const DESC_WORD_LIMIT = 15; // "first ~15 words of description"
const TINY_POOL_MAX   = 3;  // [Task: search-relevance] pools this size or smaller skip the LLM entirely

const SYSTEM_PROMPT =
  `You are a strict relevance judge for an e-commerce shop search. You will ` +
  `be given a customer's search query and a numbered list of candidate ` +
  `products (name, category, and a short description excerpt). Reply with ` +
  `ONLY a JSON object of the form {"relevant": [1, 3, 4]} listing the ` +
  `NUMBERS of candidates that are genuinely relevant to the query. Rules:\n` +
  `- You may only choose from the numbered candidates given — never invent, ` +
  `reorder, or add anything.\n` +
  `- A candidate is relevant if a shopper who typed this query would ` +
  `reasonably expect to see it. An item that merely mentions a related word ` +
  `in passing (e.g. an accessory that is "compatible with" the searched ` +
  `product, not an instance of it) is NOT relevant.\n` +
  `- If NONE of the candidates are genuinely relevant, reply {"relevant": []}.\n` +
  `- Reply with ONLY the JSON object. No prose, no markdown, no code fences.`;

const buildUserPrompt = (query, candidates) => {
  const lines = candidates.map((p, i) => {
    const desc = (p.description || '').trim().split(/\s+/).slice(0, DESC_WORD_LIMIT).join(' ');
    return `${i + 1}. ${p.name} | ${p.category}${desc ? ` | ${desc}` : ''}`;
  });
  return `SEARCH QUERY: ${query}\n\nCANDIDATES:\n${lines.join('\n')}`;
};

// Extract the first {...} block — the LLM occasionally wraps JSON in prose
// or a code fence despite instructions (same defense as queryUnderstanding.js).
const extractJsonObject = (text) => {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
};

const isValidIndex = (n, max) => Number.isInteger(n) && n >= 1 && n <= max;

const idOf = (p) => p._id?.toString();

const failOpen = (products, skipReason) => ({
  keptIds: products.map(idOf),
  fired: false,
  droppedCount: 0,
  failedOpen: skipReason === 'llmUnavailable' || skipReason === 'invalidResponse',
  skipReason,
});

const filterResults = async (query, products, options = {}) => {
  const pool = Array.isArray(products) ? products : [];
  const isRescuePool = options.isRescuePool === true;

  // Nothing to judge — a truly empty pool, never worth an LLM call.
  if (pool.length === 0) return failOpen(pool, 'trivialPool');

  // [Task: search-relevance] Tiny-pool skip. Below TINY_POOL_MAX there's too
  // little to meaningfully compare, and a bad veto here is disastrous — e.g.
  // "phone"/"mobile" queries hit exactly this shape (only 2 real phones in
  // the whole catalog, so the pool IS the 2-item answer), and Groq
  // nondeterministically vetoed one of the two on different runs. This
  // supersedes the older per-item judging this filter used to do down to a
  // single item — the risk/reward no longer favors it at this scale.
  //
  // [Task: search-tuning] ...UNLESS this pool came from the LLM rescue path
  // (isRescuePool) — see the file header for the "ring" case this fixes.
  // Rescue pools always get judged, regardless of size.
  if (pool.length <= TINY_POOL_MAX && !isRescuePool) return failOpen(pool, 'tinyPool');

  const q = (query || '').trim();
  if (!q) return failOpen(pool, 'emptyQuery');

  // [Task: search-relevance] Top-scorer protection. Items within
  // filterProtectMargin (searchConfig.js) of the pool's top _searchSemantic
  // score are excluded from the candidate list sent to the LLM entirely —
  // preferred over "ask the LLM, then ignore a veto against them" because it
  // structurally guarantees they can never be dropped (the LLM literally has
  // no index to vote against). Items with no _searchSemantic (runSearch
  // called without semanticScores) are unprotected — there's no score to
  // compare, so they fall through to the normal judged/untouched split below.
  const semScores = pool.map((p) => p._searchSemantic).filter((s) => typeof s === 'number');
  const topSem = semScores.length ? Math.max(...semScores) : null;
  const margin = config.filterProtectMargin != null ? config.filterProtectMargin : 4;
  const protectedItems = topSem == null
    ? []
    : pool.filter((p) => typeof p._searchSemantic === 'number' && p._searchSemantic >= topSem - margin);
  const protectedIds = new Set(protectedItems.map(idOf));
  const unprotectedPool = pool.filter((p) => !protectedIds.has(idOf(p)));

  // Judge only the TOP N (of the unprotected remainder) by current ranking;
  // anything beyond that is kept untouched (never dropped, never even shown
  // to the LLM) — a sane cost/latency cap that still covers what a user will
  // actually see first.
  const judged    = unprotectedPool.slice(0, MAX_CANDIDATES);
  const untouched = unprotectedPool.slice(MAX_CANDIDATES);

  // Nothing left to judge once protection removes everything worth asking
  // about — skip the LLM call rather than send it an empty candidate list.
  if (judged.length === 0) return failOpen(pool, 'allProtected');

  let raw;
  try {
    raw = await generate(SYSTEM_PROMPT, buildUserPrompt(q, judged));
  } catch (e) {
    return failOpen(pool, 'llmUnavailable');
  }
  if (!raw) return failOpen(pool, 'llmUnavailable');

  const jsonText = extractJsonObject(raw);
  if (!jsonText) return failOpen(pool, 'invalidResponse');

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return failOpen(pool, 'invalidResponse');
  }

  if (!parsed || !Array.isArray(parsed.relevant)) return failOpen(pool, 'invalidResponse');
  if (!parsed.relevant.every((n) => isValidIndex(n, judged.length))) return failOpen(pool, 'invalidResponse');

  const keptFromJudged = [...new Set(parsed.relevant)].map((n) => judged[n - 1]);
  const droppedCount   = judged.length - keptFromJudged.length;
  const keptIds        = [...protectedItems, ...keptFromJudged, ...untouched].map(idOf);

  return { keptIds, fired: true, droppedCount, failedOpen: false, skipReason: null };
};

module.exports = { filterResults };
