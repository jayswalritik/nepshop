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

// Non-default sort comparators for the faceted-sort override. `relevance`
// (and an absent sort) is deliberately NOT here: it means "keep the ranker's
// order untouched". Sorts on the raw `price`/`rating` fields — the SAME fields
// the Shop endpoint (getAllProducts) sorts on, so both surfaces behave alike.
const FACET_SORTERS = {
  price_asc:  (a, b) => (a.price  || 0) - (b.price  || 0),
  price_desc: (a, b) => (b.price  || 0) - (a.price  || 0),
  top_rated:  (a, b) => (b.rating || 0) - (a.rating || 0),
};

// ─────────────────────────────────────────────────────────────────────────────
// applyFacets — PURE filter → sort → paginate layer ON TOP OF the ranked pool.
// Exported for unit tests. Does NOT touch searchProducts / the ranker: it only
// trims and (optionally) reorders an already-ranked list, then slices a page.
//
// Contract (must hold): with no category / price / sort supplied, the output is
// byte-for-byte what the old inline slice produced — same total, same page
// clamp, same slice — so chatbot/mobile callers that pass none are unaffected.
//   (a) category — exact match, skipped when falsy
//   (b) price     — numeric minPrice/maxPrice on the raw `price` field (same
//                   field Shop filters on); each bound skipped if absent/NaN
//   (c) sort      — absent or 'relevance' keeps the ranked order; else reorder
//                   by FACET_SORTERS (stable: ties keep their ranked order)
//   (d) totals    — computed from the filtered+sorted list (so totalPages is
//                   correct for the trimmed set)
//   (e) slice     — the requested page out of that list
// ─────────────────────────────────────────────────────────────────────────────
const applyFacets = (ranked, opts = {}) => {
  const { category, minPrice, maxPrice, sort } = opts;
  const pageSize = opts.pageSize || DEFAULT_SEARCH_PAGE_SIZE;
  const page     = Math.max(1, opts.page || 1);

  let list = Array.isArray(ranked) ? ranked : [];

  // (a) category — exact match
  if (category) list = list.filter(p => p.category === category);

  // (b) price — numeric bounds on the raw price field; skip absent/invalid
  const min = Number(minPrice);
  const max = Number(maxPrice);
  const hasMin = minPrice != null && minPrice !== '' && !Number.isNaN(min);
  const hasMax = maxPrice != null && maxPrice !== '' && !Number.isNaN(max);
  if (hasMin) list = list.filter(p => (p.price || 0) >= min);
  if (hasMax) list = list.filter(p => (p.price || 0) <= max);

  // (c) sort — 'relevance'/absent leaves the ranked order alone; copy before
  // sorting so the caller's ranked array is never mutated in place.
  const sorter = FACET_SORTERS[sort];
  if (sorter) list = [...list].sort(sorter);

  // (d) totals from the filtered+sorted list
  const total      = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage   = Math.min(page, totalPages);

  // (e) slice the requested page
  const start     = (safePage - 1) * pageSize;
  const pageItems = list.slice(start, start + pageSize);

  return { total, totalPages, page: safePage, pageItems };
};

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

  // Optional FACET params — filtering/sorting is a layer ON TOP OF the ranker.
  // All optional: when every one is absent, applyFacets reproduces the old
  // inline slice exactly, so the chatbot and mobile callers (which pass none)
  // see byte-for-byte the same response as before. The ranker is untouched.
  const category = (req.query.category || '').trim();
  const { minPrice, maxPrice, sort } = req.query;

  // Rank the FULL servable set ONCE (up to maxLimit), THEN filter/sort/slice
  // that already-ranked list — so default (relevance) order is preserved and a
  // non-default sort reorders the SAME filtered set. searchProducts' own
  // ranking/filter/rescue pipeline is untouched: we ask it for the whole pool
  // (maxLimit) and do all faceting here, keeping searchProducts' per-limit
  // contract identical for its direct callers (chatbot, test suites).
  //
  // NOTE (capped-pool interaction): `ranked` is the top-`maxLimit` (40) by
  // relevance, not the whole catalog. Category/price filters therefore trim
  // WITHIN those 40 — a category whose matches all ranked below #40 can't be
  // surfaced by the filter. Intentional per the task spec (maxLimit unchanged).
  const result = await searchProducts(rawQuery, { limit: config.maxLimit });
  const ranked = result.results || [];

  const { total, totalPages, page: safePage, pageItems } =
    applyFacets(ranked, { category, minPrice, maxPrice, sort, page, pageSize });

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

module.exports = { search, applyFacets };