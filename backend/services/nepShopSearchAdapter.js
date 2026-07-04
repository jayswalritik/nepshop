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
const { runSearch, buildCatalogVocabulary } = require('./searchEngine');
const config        = require('./searchConfig');
const { getTrending } = require('./nepShopAdapter');  // reuse for zero-result rescue
const { computeSemanticScores } = require('./semanticSearchService'); // Phase 2

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
  const {
    limit          = config.defaultLimit,
    semanticScores = null,
    intentOverride = null,
  } = options;

  if (!rawQuery || !rawQuery.trim()) {
    return {
      results:          [],
      understanding:    null,
      intent:           null,
      totalFound:       0,
      isZeroResult:     true,
      zeroResultRescue: [],
    };
  }

  // Fetch all candidates from MongoDB — this is the live, current inventory.
  const candidates = await getAllSearchCandidates();

  // Build the spell-correction / relevance vocabulary directly from this
  // same live candidate set. Whatever products exist right now — including
  // ones added moments ago — are immediately part of the vocabulary, with
  // no config file to update. This is what makes a newly-added product
  // (e.g. one a teacher adds live during a demo) searchable and
  // typo-correctable instantly.
  const catalogVocabulary = buildCatalogVocabulary(candidates);

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
  const effectiveSemanticScores =
    semanticScores || (await computeSemanticScores(rawQuery, config));

  // Run the generic search pipeline
  const searchResult = runSearch(candidates, rawQuery, config, {
    limit,
    semanticScores: effectiveSemanticScores,
    intentOverride,
    catalogVocabulary,
  });

  // If zero results, attach a rescue list from the recommendation system
  let zeroResultRescue = [];
  if (searchResult.isZeroResult) {
    zeroResultRescue = await getZeroResultRescue(searchResult.intent);
  }

  return {
    ...searchResult,
    zeroResultRescue,
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