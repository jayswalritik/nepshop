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
 * EXPORTS
 *   filterResults(query, products) -> Promise<{
 *     keptIds: string[], fired: boolean, droppedCount: number,
 *     failedOpen: boolean, skipReason: string|null,
 *   }>
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { generate } = require('./chatbot/ollamaService');

const MAX_CANDIDATES  = 15; // sane cap on what we ever send the LLM
const DESC_WORD_LIMIT = 15; // "first ~15 words of description"

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

const filterResults = async (query, products) => {
  const pool = Array.isArray(products) ? products : [];

  // Nothing to judge — a truly empty pool, never worth an LLM call. A
  // SINGLE-item pool is still judged: "is this one item relevant?" is a
  // meaningful yes/no question with no comparison needed, and it's exactly
  // the shape of the flagship bug this filter exists to catch (a lone
  // semantic-only noise item with nothing to be measured against, e.g. "ac"
  // -> one wireless charger).
  if (pool.length === 0) return failOpen(pool, 'trivialPool');

  const q = (query || '').trim();
  if (!q) return failOpen(pool, 'emptyQuery');

  // Judge only the TOP N by current ranking; anything beyond that is kept
  // untouched (never dropped, never even shown to the LLM) — a sane
  // cost/latency cap that still covers what a user will actually see first.
  const judged    = pool.slice(0, MAX_CANDIDATES);
  const untouched = pool.slice(MAX_CANDIDATES);

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
  const keptIds        = [...keptFromJudged, ...untouched].map(idOf);

  return { keptIds, fired: true, droppedCount, failedOpen: false, skipReason: null };
};

module.exports = { filterResults };
