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

// ── Shared product projection ─────────────────────────────────────────────────
// Include description for text matching; keep the rest lean.
const SEARCH_PRODUCT_SELECT =
  'name description price comparePrice discount category images rating numReviews seller stock isActive createdAt';

// ── Helper: fetch all active, in-stock products ───────────────────────────────
const getAllSearchCandidates = async () =>
  Product.find({ isActive: true, stock: { $gt: 0 } })
    .select(SEARCH_PRODUCT_SELECT)
    .lean();

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

  // Fetch all candidates from MongoDB — this is the live, current inventory.
  const tFetch0 = Date.now();
  const candidates = await getAllSearchCandidates();
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
  const searchResult = runSearch(candidates, rawQuery, config, {
    limit,
    semanticScores: effectiveSemanticScores,
    intentOverride,
    catalogVocabulary,
  });
  const runMs = Date.now() - tRun0;

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
  let rescueLLMMs = null, rescueEmbedMs = null, rescueRunMs = null;

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
      const rerunResult = runSearch(candidates, rewrittenQuery, config, {
        limit,
        semanticScores: rewrittenSemanticScores,
        intentOverride,
        catalogVocabulary,
      });
      rescueRunMs = Date.now() - tRescueRun0;

      // Only adopt the LLM-assisted re-run if it actually found something —
      // an LLM query that finds nothing can never make the response worse
      // than the honest zero/browse result the engine already had.
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
  let zeroResultRescue = [];
  if (finalResult.isZeroResult) {
    const tTrend0 = Date.now();
    zeroResultRescue = await getZeroResultRescue(finalResult.intent);
    trendingMs = Date.now() - tTrend0;
  }

  const totalMs = Date.now() - tTotal0;
  const timingParts = [
    `q="${rawQuery}"`,
    `fetch=${fetchMs}ms`,
    `embed=${mainTiming.embedMs || 0}ms`,
    `vector=${mainTiming.vectorMs || 0}ms`,
    `run=${runMs}ms`,
  ];
  if (rescueLLMMs   != null) timingParts.push(`rescueLLM=${rescueLLMMs}ms`);
  if (rescueEmbedMs != null) timingParts.push(`rescueEmbed=${rescueEmbedMs}ms`);
  if (rescueRunMs   != null) timingParts.push(`rescueRun=${rescueRunMs}ms`);
  if (trendingMs    != null) timingParts.push(`trending=${trendingMs}ms`);
  timingParts.push(`total=${totalMs}ms`);
  console.log(`[search:timing] ${timingParts.join(' ')}`);

  return {
    ...finalResult,
    zeroResultRescue,
    interpretedAs,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// getZeroResultRescue
// ─────────────────────────────────────────────────────────────────────────────
// When a search returns nothing, show helpful alternatives:
//   1. If we extracted a category → trending in that category
//   2. Otherwise → overall trending
// Reuses the recommendation engine's getTrending — no duplication.
// ─────────────────────────────────────────────────────────────────────────────
const getZeroResultRescue = async (intent) => {
  try {
    const limit = config.zeroResultLimit || 8;

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
        return products.map(p => ({
          ...p,
          _reason: `Popular in ${intent.category}`,
        }));
      }
    }

    // Fallback: overall trending
    const trending = await getTrending({ limit, windowDays: 30 });
    return trending.map(p => ({ ...p, _reason: 'Trending now' }));
  } catch (err) {
    console.error('Zero-result rescue failed:', err.message);
    return [];
  }
};

module.exports = {
  searchProducts,
  getZeroResultRescue,
};