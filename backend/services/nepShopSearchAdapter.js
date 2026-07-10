/**
 * ─────────────────────────────────────────────────────────────────────────────
 * NepShop Search Adapter  (backend/services/nepShopSearchAdapter.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Bridges NepShop's Mongoose models to the generic search engine.
 * All MongoDB queries live here; searchEngine.js stays model-agnostic.
 *
 * Exported functions (called by searchController.js):
 *   searchProducts(rawQuery, options)  → main search
 *   getZeroResultRescue(intent)        → fallback when zero results found
 * ─────────────────────────────────────────────────────────────────────────────
 */

const Product     = require('../models/Product');
const { runSearch, buildCatalogVocabulary, parseQuery } = require('./searchEngine');
const config        = require('./searchConfig');
const { getTrending } = require('./nepShopAdapter');  // reuse for zero-result rescue
const { computeSemanticScores } = require('./semanticSearchService'); // Phase 2
const { understandQuery } = require('./queryUnderstanding'); // Phase 3: LLM rescue
const { filterResults } = require('./resultFilter'); // Phase 4: anchor-less noise veto

// ── Shared product projection ─────────────────────────────────────────────────
// Include description for text matching; keep the rest lean.
const SEARCH_PRODUCT_SELECT =
  'name description price comparePrice discount category images rating numReviews seller stock isActive createdAt';

// ── Candidate cache (60s TTL) ──────────────────────────────────────────────
// Re-fetching the whole active catalog from Mongo is the single most
// expensive step in a search (900-1300ms measured on Atlas). The catalog
// doesn't change fast enough to justify hitting Mongo on every search, so we
// cache it for a short, fixed window — plain variable + Date.now(), no new
// dependency, no invalidation hooks (60s staleness is the accepted trade-off).
//
// MUTATION AUDIT (why a shallow array copy is enough, not a deep copy): traced
// every consumer of this array — runSearch, partitionMatches, wordMatch,
// scoreProduct (recommendationEngine.js), scoreSearchResult, buildSearchReason
// — and all of them build NEW arrays/objects via .filter(), .map(), or object
// spread ({ ...product, ... }). None call .sort() on the candidates array
// itself (only on separately-.map()'d arrays) and none assign a property onto
// a product object in place. So today, nothing mutates either the array or
// the product objects. We still return a fresh shallow array copy on every
// read anyway (negligible cost for a ~100-200 item catalog) so a future
// in-place .sort()/.push() added without re-reading this comment can't corrupt
// the shared cache — the PRODUCT OBJECTS remain shared references (not deep-
// copied), consistent with nothing today mutating them.
let candidateCache = null; // { data: Product[], fetchedAt: number } | null
const CANDIDATE_CACHE_TTL_MS = 60 * 1000;

// ── Helper: fetch all active, in-stock products (cached) ─────────────────────
const getAllSearchCandidates = async () => {
  const now = Date.now();
  if (candidateCache && (now - candidateCache.fetchedAt) < CANDIDATE_CACHE_TTL_MS) {
    return { data: [...candidateCache.data], cacheStatus: 'HIT' };
  }

  const data = await Product.find({ isActive: true, stock: { $gt: 0 } })
    .select(SEARCH_PRODUCT_SELECT)
    .lean();
  candidateCache = { data, fetchedAt: now };
  return { data: [...data], cacheStatus: 'MISS' };
};

// ── LLM result filter — applied to a runSearch()-shaped result ───────────────
// Fires ONLY when the result pool has ZERO strong (name/category) literal
// matches — strongMatchCount is null for browse-style queries (no product
// term at all; there's nothing for the LLM to judge relevance against) and a
// real number otherwise, so `=== 0` alone already excludes both "has an
// anchor" and "not a product-term query" cases. Any query with a strong
// match: this function returns immediately, no LLM call, no added latency.
//
// `stage` is only used for the [search:filter] log line (main vs rescue
// rerun) — decided independently each time it's called, per this task's
// explicit rule that a rerun's exemption depends on ITS OWN strong matches,
// never inherited from the original query's run.
const applyResultFilter = async (stage, query, searchResult) => {
  if (searchResult.strongMatchCount !== 0 || searchResult.results.length === 0) {
    console.log(`[search:filter] ${stage} skipped(hasStrongMatch) kept=${searchResult.results.length} dropped=0`);
    return { result: searchResult, filterMs: null };
  }

  const tFilter0 = Date.now();
  const filterInfo = await filterResults(query, searchResult.results);
  const filterMs = Date.now() - tFilter0;

  if (!filterInfo.fired) {
    const label = filterInfo.failedOpen ? `failedOpen(${filterInfo.skipReason})` : `skipped(${filterInfo.skipReason})`;
    console.log(`[search:filter] ${stage} ${label} kept=${searchResult.results.length} dropped=0`);
    return { result: searchResult, filterMs };
  }

  const keptSet = new Set(filterInfo.keptIds);
  const filteredResults = searchResult.results.filter(p => keptSet.has(p._id?.toString()));
  const filtered = {
    ...searchResult,
    results: filteredResults,
    totalFound: Math.max(0, searchResult.totalFound - filterInfo.droppedCount),
    isZeroResult: filteredResults.length === 0,
  };
  console.log(`[search:filter] ${stage} fired kept=${filteredResults.length} dropped=${filterInfo.droppedCount}`);
  return { result: filtered, filterMs };
};

// ─────────────────────────────────────────────────────────────────────────────
// searchProducts
// ─────────────────────────────────────────────────────────────────────────────
// Main entry point for a search query.
//
// options:
//   limit          number   — max results (default from config)
//   semanticScores object   — Phase 2: { productId: cosineSimilarity }
//                             If omitted, they're computed here automatically.
//   intentOverride object   — Phase 3: Gemini-parsed intent fields
//
// Returns the same shape as runSearch() plus a zeroResultRescue array if needed.
// ─────────────────────────────────────────────────────────────────────────────
const searchProducts = async (rawQuery, options = {}) => {
  const tTotal0 = Date.now();
  const {
    limit          = config.defaultLimit,
    semanticScores = null,
    intentOverride = null,
  } = options;

  if (!rawQuery || !rawQuery.trim()) {
    console.log(`[search:timing] q="${rawQuery || ''}" total=${Date.now() - tTotal0}ms`);
    return {
      results:          [],
      understanding:    null,
      intent:           null,
      totalFound:       0,
      isZeroResult:     true,
      zeroResultRescue: [],
      interpretedAs:    null,
    };
  }

  // Fetch all candidates from MongoDB — this is the live, current inventory
  // (or a <=60s-old cached copy — see getAllSearchCandidates above).
  const tFetch0 = Date.now();
  const { data: candidates, cacheStatus: fetchCacheStatus } = await getAllSearchCandidates();
  const fetchMs = Date.now() - tFetch0;

  // Build the spell-correction / relevance vocabulary directly from this
  // same live candidate set. Whatever products exist right now — including
  // ones added moments ago — are immediately part of the vocabulary, with
  // no config file to update. This is what makes a newly-added product
  // (e.g. one a teacher adds live during a demo) searchable and
  // typo-correctable instantly.
  const catalogVocabulary = buildCatalogVocabulary(candidates);

  // ── Phase 3: abbreviation expansion ("ac" -> "air conditioner") ───────────
  // Parsed once, early, purely to get the query text to embed/rescue with —
  // runSearch() below re-parses internally (same deterministic inputs, so
  // identical result) to build the full intent. When no abbreviation fires,
  // expandedQuery is the untouched original text, so every other query's
  // embedding input is byte-for-byte what it was before this existed.
  const earlyIntent = parseQuery(rawQuery, config, catalogVocabulary);
  const embedQuery   = earlyIntent.expandedQuery;

  // ── Phase 2: semantic scores ──────────────────────────────────────────────
  // Meaning-based similarity between the query and each product's stored
  // embedding. This is what lets a product whose TEXT never contains the search
  // word (e.g. an "HP / Electronics" item for the query "laptop") still surface,
  // because the whole active catalog is already in `candidates` above and the
  // engine blends this score in via config.searchWeights.semantic.
  //
  // If a caller supplied semanticScores (e.g. a test, or a future Phase 3 path),
  // we use those; otherwise we compute them here. The query is embedded via the
  // HF Space if HF_SPACE_URL is set, else in-Node — so this works right now.
  const mainTiming = {};
  const effectiveSemanticScores =
    semanticScores || (await computeSemanticScores(embedQuery, config, mainTiming));

  // Run the generic search pipeline
  const tRun0 = Date.now();
  const rawSearchResult = runSearch(candidates, rawQuery, config, {
    limit,
    semanticScores: effectiveSemanticScores,
    intentOverride,
    catalogVocabulary,
  });
  const runMs = Date.now() - tRun0;

  // ── Phase 4: LLM result filter — main path ────────────────────────────────
  // Only ever consulted when this response has NO strong (name/category)
  // anchor to trust; a query with any strong match costs nothing here (see
  // applyResultFilter). Applied BEFORE the rescue-trigger check below, so a
  // pool the filter empties out correctly cascades into the SAME rescue path
  // an honest zero-literal-match would have — no separate handling needed.
  const { result: searchResult, filterMs: mainFilterMs } =
    await applyResultFilter('main', embedQuery, rawSearchResult);

  // ── Phase 3: LLM query understanding — ONLY when the engine would
  // otherwise be guessing: it extracted no product terms at all (query is
  // too short/unfamiliar for literal+semantic matching to even attempt), or
  // the attempt came back empty. Never fires on well-understood queries
  // ("laptop", "gaming laptop under 200000") — those keep today's speed and
  // never touch the LLM.
  //
  // The re-run below calls runSearch() directly (not searchProducts()), so
  // there is no recursive path back into this block — a structural loop
  // guard, not a flag to remember to check.
  let finalResult = searchResult;
  let interpretedAs = null;
  let rescueLLMMs = null, rescueEmbedMs = null, rescueRunMs = null, rescueFilterMs = null;

  const noProductTerms = !(searchResult.intent && searchResult.intent.productTerms &&
    searchResult.intent.productTerms.length);
  const shouldAskLLM = noProductTerms || searchResult.isZeroResult;

  if (shouldAskLLM) {
    const reason = noProductTerms ? 'noProductTerms' : 'isZeroResult';
    console.log(`[search:rescue] fired reason=${reason} query="${rawQuery}"${embedQuery !== rawQuery ? ` expandedQuery="${embedQuery}"` : ''}`);

    const tLLM0 = Date.now();
    const understood = await understandQuery(embedQuery); // CRITICAL: expanded, not raw — see Task 3
    rescueLLMMs = Date.now() - tLLM0;

    if (understood && understood.terms.length) {
      console.log(`[search:rescue] understandQuery -> terms=${JSON.stringify(understood.terms)}`);

      const rewrittenQuery = understood.terms.join(' ');
      const tRescueEmbed0 = Date.now();
      const rewrittenSemanticScores = await computeSemanticScores(rewrittenQuery, config);
      rescueEmbedMs = Date.now() - tRescueEmbed0;

      const tRescueRun0 = Date.now();
      const rawRerunResult = runSearch(candidates, rewrittenQuery, config, {
        limit,
        semanticScores: rewrittenSemanticScores,
        intentOverride,
        catalogVocabulary,
      });
      rescueRunMs = Date.now() - tRescueRun0;

      // ── Phase 4: LLM result filter — rescue rerun path ────────────────────
      // Decided independently of the main path's outcome: whether THIS rerun
      // is exempt depends on ITS OWN strong-match count, never inherited (a
      // rerun that resolves to a strong literal anchor — e.g. "tv" rewritten
      // to "television monitor screen" landing squarely in Electronics with a
      // name match — costs nothing here; one that stays semantic-only, like
      // the "tv" rerun mixing in a bare laptop, gets judged).
      const { result: rerunResult, filterMs: rerunFilterMs } =
        await applyResultFilter('rescueRerun', rewrittenQuery, rawRerunResult);
      rescueFilterMs = rerunFilterMs;

      // Only adopt the LLM-assisted re-run if it actually found something
      // AFTER filtering — an LLM query (or filter) that finds nothing can
      // never make the response worse than the honest zero/browse result the
      // engine already had.
      if (rerunResult.results.length > 0) {
        finalResult = rerunResult;
        interpretedAs = { original: rawQuery, terms: understood.terms };
        console.log(`[search:rescue] rerun found ${rerunResult.results.length} result(s) -> ADOPTED`);
      } else {
        console.log(`[search:rescue] rerun found 0 results -> kept original result`);
      }
    } else {
      console.log(`[search:rescue] understandQuery -> ${understood === null ? 'null (unavailable/rejected)' : 'empty terms'}`);
    }
  }

  // If zero results, attach a rescue list from the recommendation system
  let trendingMs = null;
  let trendingCacheStatus = null;
  let zeroResultRescue = [];
  if (finalResult.isZeroResult) {
    const tTrend0 = Date.now();
    const rescueResult = await getZeroResultRescue(finalResult.intent);
    zeroResultRescue = rescueResult.data;
    trendingCacheStatus = rescueResult.cacheStatus;
    trendingMs = Date.now() - tTrend0;
  }

  const totalMs = Date.now() - tTotal0;
  const timingParts = [
    `q="${rawQuery}"`,
    `fetch=${fetchMs}ms`,
    `cache=${fetchCacheStatus}`,
    `embed=${mainTiming.embedMs || 0}ms`,
    `vector=${mainTiming.vectorMs || 0}ms`,
    `run=${runMs}ms`,
  ];
  if (mainFilterMs  != null) timingParts.push(`filterLLM=${mainFilterMs}ms`);
  if (rescueLLMMs   != null) timingParts.push(`rescueLLM=${rescueLLMMs}ms`);
  if (rescueEmbedMs != null) timingParts.push(`rescueEmbed=${rescueEmbedMs}ms`);
  if (rescueRunMs   != null) timingParts.push(`rescueRun=${rescueRunMs}ms`);
  if (rescueFilterMs != null) timingParts.push(`rescueFilterLLM=${rescueFilterMs}ms`);
  if (trendingMs    != null) timingParts.push(`trending=${trendingMs}ms trendingCache=${trendingCacheStatus}`);
  timingParts.push(`total=${totalMs}ms`);
  console.log(`[search:timing] ${timingParts.join(' ')}`);

  return {
    ...finalResult,
    zeroResultRescue,
    interpretedAs,
  };
};

// ── Zero-result rescue cache (60s TTL, keyed by category) ────────────────────
// The rescue's own DB round trips (category-filtered find, or getTrending's
// order aggregation) measured ~1500ms — the same "same query hits again and
// again" cost as the candidate fetch, so it gets the same TTL treatment.
// Keyed by category (or a sentinel for "no category / overall trending")
// since that's the only input that varies the result — `limit` is always
// config.zeroResultLimit internally, never caller-supplied. A FAILED fetch is
// deliberately NOT cached — a transient DB hiccup shouldn't keep returning an
// empty rescue for 60s after the DB recovers.
const rescueCache = new Map(); // categoryKey -> { data, fetchedAt }
const RESCUE_CACHE_TTL_MS = 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// getZeroResultRescue
// ─────────────────────────────────────────────────────────────────────────────
// When a search returns nothing, show helpful alternatives:
//   1. If we extracted a category → trending in that category
//   2. Otherwise → overall trending
// Reuses the recommendation engine's getTrending — no duplication.
// Returns { data, cacheStatus: 'HIT'|'MISS' }.
// ─────────────────────────────────────────────────────────────────────────────
const getZeroResultRescue = async (intent) => {
  const categoryKey = (intent && intent.category) || '__overall__';
  const now = Date.now();

  const cached = rescueCache.get(categoryKey);
  if (cached && (now - cached.fetchedAt) < RESCUE_CACHE_TTL_MS) {
    return { data: [...cached.data], cacheStatus: 'HIT' };
  }

  try {
    const limit = config.zeroResultLimit || 8;
    let data = null;

    if (intent && intent.category) {
      // Category-filtered trending
      const products = await Product.find({
        isActive: true,
        stock: { $gt: 0 },
        category: intent.category,
      })
        .select(SEARCH_PRODUCT_SELECT)
        .sort({ rating: -1, numReviews: -1 })
        .limit(limit)
        .lean();

      if (products.length > 0) {
        data = products.map(p => ({
          ...p,
          _reason: `Popular in ${intent.category}`,
        }));
      }
    }

    if (!data) {
      // Fallback: overall trending
      const trending = await getTrending({ limit, windowDays: 30 });
      data = trending.map(p => ({ ...p, _reason: 'Trending now' }));
    }

    rescueCache.set(categoryKey, { data, fetchedAt: now });
    return { data: [...data], cacheStatus: 'MISS' };
  } catch (err) {
    console.error('Zero-result rescue failed:', err.message);
    return { data: [], cacheStatus: 'MISS' }; // not cached — see comment above
  }
};

module.exports = {
  searchProducts,
  getZeroResultRescue,
};