/**
 * ─────────────────────────────────────────────────────────────────────────────
 * searchControllerFilters.test.js — run with:
 *     node backend/tests/searchControllerFilters.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * [Task: faceted-filtering] Pure-function tests for the SEARCH controller's
 * filter → sort → paginate layer (applyFacets in searchController.js). This is
 * the layer ON TOP OF the ranker — it must NEVER change ranking; these tests
 * only cover trimming / reordering / slicing an already-ranked list.
 *
 * No DB, no LLM, no HTTP: applyFacets is a pure function over a fixture list.
 * The ranking/relevance suites (searchRelevance, searchFilterGuard,
 * searchMultiCategory) are untouched.
 *
 * Covers the task's required cases:
 *   (a) no filter params → identical set/order/count as a plain slice (guard)
 *   (b) category filter trims correctly
 *   (c) price filter (min/max) trims correctly
 *   (d) sort=price_asc orders ascending
 *   (e) sort=relevance / absent preserves the ranked order
 *   + price_desc, top_rated, stable-tie order, combined filter+sort,
 *     pagination totals over the filtered set, and non-mutation of the input.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const assert = require('assert');
const { applyFacets } = require('../controllers/searchController');

let pass = 0, fail = 0;
const check = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}  ${detail}`); }
};
const ids = (arr) => arr.map(p => p._id);

// Fixture ranked list — order below IS the relevance order (deliberately NOT
// sorted by price or rating, so we can tell "relevance preserved" apart from
// an accidental price/rating ordering).
const RANKED = [
  { _id: '1', name: 'A', category: 'Electronics', price: 500, rating: 4.0 },
  { _id: '2', name: 'B', category: 'Clothing',    price: 100, rating: 3.0 },
  { _id: '3', name: 'C', category: 'Electronics', price: 900, rating: 5.0 },
  { _id: '4', name: 'D', category: 'Electronics', price: 300, rating: 2.0 },
  { _id: '5', name: 'E', category: 'Clothing',    price: 700, rating: 4.5 },
];

console.log('\n[applyFacets] filter → sort → paginate (on top of ranking)\n');

// (a) No params → identical to a plain relevance slice (regression guard).
{
  const r = applyFacets(RANKED, { page: 1, pageSize: 12 });
  check('(a) no params: total = full list', r.total === 5, `got ${r.total}`);
  check('(a) no params: order === ranked order (relevance preserved)',
    JSON.stringify(ids(r.pageItems)) === JSON.stringify(['1', '2', '3', '4', '5']),
    JSON.stringify(ids(r.pageItems)));
  check('(a) no params: matches plain ranked.slice(0, pageSize)',
    JSON.stringify(ids(r.pageItems)) === JSON.stringify(ids(RANKED.slice(0, 12))));

  // Same, with a real page size + clamping — the exact old inline slice math.
  const p1 = applyFacets(RANKED, { page: 1, pageSize: 2 });
  const p2 = applyFacets(RANKED, { page: 2, pageSize: 2 });
  const p3 = applyFacets(RANKED, { page: 3, pageSize: 2 });
  const pOver = applyFacets(RANKED, { page: 9, pageSize: 2 }); // clamps to last
  check('(a) paginate pageSize=2: totalPages=3', p1.totalPages === 3, `got ${p1.totalPages}`);
  check('(a) paginate page1 = [1,2]', JSON.stringify(ids(p1.pageItems)) === JSON.stringify(['1', '2']));
  check('(a) paginate page2 = [3,4]', JSON.stringify(ids(p2.pageItems)) === JSON.stringify(['3', '4']));
  check('(a) paginate page3 = [5]',   JSON.stringify(ids(p3.pageItems)) === JSON.stringify(['5']));
  check('(a) page over-max clamps to last page', pOver.page === 3 && JSON.stringify(ids(pOver.pageItems)) === JSON.stringify(['5']), `page=${pOver.page}`);
}

// (b) Category filter trims correctly.
{
  const r = applyFacets(RANKED, { category: 'Electronics', pageSize: 12 });
  check('(b) category=Electronics → [1,3,4]',
    JSON.stringify(ids(r.pageItems)) === JSON.stringify(['1', '3', '4']) && r.total === 3,
    JSON.stringify(ids(r.pageItems)));
  const none = applyFacets(RANKED, { category: 'Automotive', pageSize: 12 });
  check('(b) category with no matches → total 0, empty page', none.total === 0 && none.pageItems.length === 0);
}

// (c) Price filter (min/max) trims correctly, on the raw price field.
{
  const band = applyFacets(RANKED, { minPrice: 300, maxPrice: 700, pageSize: 12 });
  check('(c) 300..700 → [1,4,5] (ranked order kept)',
    JSON.stringify(ids(band.pageItems)) === JSON.stringify(['1', '4', '5']) && band.total === 3,
    JSON.stringify(ids(band.pageItems)));
  const minOnly = applyFacets(RANKED, { minPrice: 600, pageSize: 12 });
  check('(c) minPrice=600 → [3,5]', JSON.stringify(ids(minOnly.pageItems)) === JSON.stringify(['3', '5']));
  const maxOnly = applyFacets(RANKED, { maxPrice: 400, pageSize: 12 });
  check('(c) maxPrice=400 → [2,4]', JSON.stringify(ids(maxOnly.pageItems)) === JSON.stringify(['2', '4']));
  // Invalid / string price bounds are ignored (no filter), not treated as 0.
  const bad = applyFacets(RANKED, { minPrice: '', maxPrice: 'abc', pageSize: 12 });
  check('(c) empty/NaN price bounds are ignored → full list', bad.total === 5, `got ${bad.total}`);
  // Query-string values arrive as strings — must still work.
  const strBounds = applyFacets(RANKED, { minPrice: '300', maxPrice: '700', pageSize: 12 });
  check('(c) string price bounds "300".."700" → [1,4,5]',
    JSON.stringify(ids(strBounds.pageItems)) === JSON.stringify(['1', '4', '5']));
}

// (d) sort=price_asc orders ascending.
{
  const r = applyFacets(RANKED, { sort: 'price_asc', pageSize: 12 });
  check('(d) sort=price_asc → [2,4,1,5,3]',
    JSON.stringify(ids(r.pageItems)) === JSON.stringify(['2', '4', '1', '5', '3']),
    JSON.stringify(ids(r.pageItems)));
}

// (e) sort=relevance / absent preserves the ranked order.
{
  const rel = applyFacets(RANKED, { sort: 'relevance', pageSize: 12 });
  const abs = applyFacets(RANKED, { pageSize: 12 });
  check('(e) sort=relevance keeps ranked order [1,2,3,4,5]',
    JSON.stringify(ids(rel.pageItems)) === JSON.stringify(['1', '2', '3', '4', '5']));
  check('(e) sort absent keeps ranked order [1,2,3,4,5]',
    JSON.stringify(ids(abs.pageItems)) === JSON.stringify(['1', '2', '3', '4', '5']));
  check('(e) unknown sort value falls back to ranked order',
    JSON.stringify(ids(applyFacets(RANKED, { sort: 'bogus', pageSize: 12 }).pageItems)) === JSON.stringify(['1', '2', '3', '4', '5']));
}

// price_desc, top_rated, and stable-tie order.
{
  const desc = applyFacets(RANKED, { sort: 'price_desc', pageSize: 12 });
  check('sort=price_desc → [3,5,1,4,2]', JSON.stringify(ids(desc.pageItems)) === JSON.stringify(['3', '5', '1', '4', '2']));
  const rated = applyFacets(RANKED, { sort: 'top_rated', pageSize: 12 });
  check('sort=top_rated → [3,5,1,2,4]', JSON.stringify(ids(rated.pageItems)) === JSON.stringify(['3', '5', '1', '2', '4']));

  // Ties keep their RANKED order (stable sort) — critical so top_rated among
  // many equal (e.g. 0) ratings degrades to relevance order, not a reshuffle.
  const tied = [
    { _id: 'x', rating: 0, price: 9 },
    { _id: 'y', rating: 0, price: 8 },
    { _id: 'z', rating: 0, price: 7 },
  ];
  const tr = applyFacets(tied, { sort: 'top_rated', pageSize: 12 });
  check('top_rated with all-equal ratings preserves ranked order [x,y,z]',
    JSON.stringify(ids(tr.pageItems)) === JSON.stringify(['x', 'y', 'z']));
}

// Combined filter + sort: filter first, then reorder the survivors.
{
  const r = applyFacets(RANKED, { category: 'Electronics', sort: 'price_asc', pageSize: 12 });
  check('combined category=Electronics + price_asc → [4,1,3]',
    JSON.stringify(ids(r.pageItems)) === JSON.stringify(['4', '1', '3']) && r.total === 3,
    JSON.stringify(ids(r.pageItems)));
}

// Pagination totals reflect the FILTERED set (not the full ranked pool).
{
  const r = applyFacets(RANKED, { category: 'Electronics', page: 2, pageSize: 2 });
  check('filtered pagination: total=3, totalPages=2', r.total === 3 && r.totalPages === 2, `total=${r.total} totalPages=${r.totalPages}`);
  check('filtered pagination: page2 of Electronics = [4]', JSON.stringify(ids(r.pageItems)) === JSON.stringify(['4']));
}

// Non-mutation: applyFacets must never reorder/trim the caller's ranked array.
{
  const before = ids(RANKED).join(',');
  applyFacets(RANKED, { sort: 'price_asc', category: 'Electronics', pageSize: 2, page: 1 });
  const after = ids(RANKED).join(',');
  check('input `ranked` array is not mutated by filter/sort', before === after, `before=${before} after=${after}`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
