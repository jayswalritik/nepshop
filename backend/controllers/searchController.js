/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Search Controller  (backend/controllers/searchController.js)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Routes (all under /api/search):
 *
 *   GET /          → main search: ?q=query&page=1&limit=12
 * ─────────────────────────────────────────────────────────────────────────────
 */

const asyncHandler      = require('express-async-handler');
const { searchProducts } = require('../services/nepShopSearchAdapter');
const config             = require('../services/searchConfig');

// Default page size for the web search-results grid. Kept equal to the Shop/
// browse page's page size (getAllProducts uses 12) so both surfaces feel the
// same. Callers can override via ?limit=, capped at config.maxLimit.
const DEFAULT_SEARCH_PAGE_SIZE = 12;

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Smart product search (numbered pagination)
// @route   GET /api/search?q=...&page=...&limit=...
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const search = asyncHandler(async (req, res) => {
  const rawQuery = (req.query.q || '').trim();
  const page     = Math.max(1, parseInt(req.query.page) || 1);
  // `limit` now means PAGE SIZE (results per page), not total results — an old
  // caller passing ?limit=20 with no page still gets the top 20 as page 1, so
  // this stays backward-compatible with the mobile client (which does exactly
  // that and never paginates).
  const pageSize = Math.min(parseInt(req.query.limit) || DEFAULT_SEARCH_PAGE_SIZE, config.maxLimit);

  // Rank the FULL servable set ONCE (up to maxLimit), THEN slice the requested
  // page out of that already-ranked list — so page 2 is the next-most-relevant
  // results, never a re-ranked set. searchProducts' own ranking/filter/rescue
  // pipeline is untouched: we simply ask it for the whole pool (maxLimit)
  // instead of a single display page, and do the page slicing here. This keeps
  // searchProducts' per-limit contract identical for its direct callers (the
  // chatbot and the test suites), which is why pagination lives in the
  // controller rather than inside the adapter.
  const result = await searchProducts(rawQuery, { limit: config.maxLimit });

  const ranked     = result.results || [];
  const total      = ranked.length;                        // servable, paginated count (<= maxLimit)
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage   = Math.min(page, totalPages);           // clamp a too-high page to the last one
  const start      = (safePage - 1) * pageSize;
  const pageItems  = ranked.slice(start, start + pageSize);

  res.json({
    success: true,
    query:         rawQuery,
    totalFound:    result.totalFound,   // full relevance-scored match count (may exceed `total`)
    total,                              // number of results actually paginated (matches products endpoint)
    page:          safePage,
    totalPages,
    count:         pageItems.length,
    understanding: result.understanding,
    interpretedAs: result.interpretedAs || null,
    intent:        {
      corrected:    result.intent?.corrected    || rawQuery,
      spellingFixes: result.intent?.spellingFixes || [],
      budget:       result.intent?.budget       || null,
      color:        result.intent?.color        || null,
      category:     result.intent?.category     || null,
      purpose:      result.intent?.purpose      || null,
      isBudgetQuery: result.intent?.isBudgetQuery || false,
      isPremiumQuery: result.intent?.isPremiumQuery || false,
    },
    products:      pageItems,
    isZeroResult:  result.isZeroResult,
    rescue:        result.zeroResultRescue || [],
  });
});

module.exports = { search };