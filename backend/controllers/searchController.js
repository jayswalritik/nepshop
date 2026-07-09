/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Search Controller  (backend/controllers/searchController.js)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Routes (all under /api/search):
 *
 *   GET /          → main search: ?q=query&limit=20
 * ─────────────────────────────────────────────────────────────────────────────
 */

const asyncHandler      = require('express-async-handler');
const { searchProducts } = require('../services/nepShopSearchAdapter');
const config             = require('../services/searchConfig');

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Smart product search
// @route   GET /api/search?q=...&limit=...
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const search = asyncHandler(async (req, res) => {
  const rawQuery = (req.query.q || '').trim();
  const limit    = Math.min(parseInt(req.query.limit) || config.defaultLimit, config.maxLimit);

  const result = await searchProducts(rawQuery, { limit });

  res.json({
    success: true,
    query:         rawQuery,
    totalFound:    result.totalFound,
    count:         result.results.length,
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
    products:      result.results,
    isZeroResult:  result.isZeroResult,
    rescue:        result.zeroResultRescue || [],
  });
});

module.exports = { search };