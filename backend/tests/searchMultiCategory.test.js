/**
 * ─────────────────────────────────────────────────────────────────────────────
 * searchMultiCategory.test.js — run with: node backend/tests/searchMultiCategory.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * [Task: search-multicategory] Pure-function tests for runSearch's category
 * handling (backend/services/searchEngine.js). No DB connection required —
 * calls runSearch directly against in-memory product fixtures, no
 * semanticScores (isolates the literal-match + category-boost path).
 *
 * Background: runSearch used to hard-filter the whole result pool down to
 * ONE dominant category once deriveCategoryFromMatches found one category
 * held >=60% of the strong (name/category) literal matches — deleting
 * genuine minority-category matches outright instead of ranking them lower.
 * That hard filter is now removed; derivedCategory still feeds a score boost
 * (recSignals.category -> config.weights.categoryMatch in
 * recommendationConfig.js) but no longer deletes anything from the pool.
 *
 * Covers:
 *   1. A mixed-category pool ("apple": Electronics-majority, Groceries-
 *      minority, both via genuine strong/literal matches) keeps products
 *      from BOTH categories in the results.
 *   2. The category boost still ranks the dominant category's items above
 *      the minority category's items for that same query.
 *   3. A cross-category item that only matches via a description mention
 *      (weak match, the classic "stray word" straggler the removed comment
 *      described) also survives instead of being silently dropped, and
 *      ranks below both on-topic categories.
 *
 * [Task: search-multicategory refinement] Additional coverage — a narrower
 * cut layered back on top of the above: once a dominant category exists, an
 * off-category item survives ONLY if it has a real literal match (strong or
 * weak); a purely semantic-only off-category item (zero literal match) is
 * cut. Covers:
 *   4. "iphone" (Electronics-dominant): a Groceries "Apple" fruit item with
 *      zero literal "iphone" match anywhere, present only via a mocked high
 *      semantic score, is CUT.
 *   5. Same query: a Groceries item that DOES literally mention "iphone" in
 *      its description (a weak match) SURVIVES, ranked low — proves the cut
 *      targets semantic-only entries specifically, not "any off-category".
 *   6. "gizmo" (no literal match anywhere -> no dominant category):
 *      semantic-only off-category items all survive — nothing to cut
 *      against without a derivedCategory.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const assert = require('assert');
const { runSearch } = require('../services/searchEngine');
const config = require('../services/searchConfig');

let passed = 0;
let failed = 0;

const test = (name, fn) => {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(`   ${err.message}`);
    failed++;
  }
};

// Identical price/rating/numReviews/createdAt across every fixture so the
// ONLY thing that can separate an Electronics item's score from a Groceries
// item's score is the categoryMatch boost (or textMatch, for the weak
// description-only straggler) — isolates the behavior under test.
const SHARED = { price: 1000, discount: 0, rating: 4.5, numReviews: 100, createdAt: new Date(), isActive: true, stock: 10 };

const candidates = [
  { _id: 'e1', name: 'Apple iPhone 15', category: 'Electronics', description: 'Smartphone', ...SHARED },
  { _id: 'e2', name: 'Apple Watch Series 9', category: 'Electronics', description: 'Smartwatch', ...SHARED },
  { _id: 'e3', name: 'Apple MacBook Air', category: 'Electronics', description: 'Laptop', ...SHARED },
  { _id: 'g1', name: 'Apple', category: 'Groceries', description: 'Fresh fruit', ...SHARED },
  { _id: 'g2', name: 'Green Apple', category: 'Groceries', description: 'Fresh fruit', ...SHARED },
  { _id: 'o1', name: 'Laundry Basket', category: 'Home & Kitchen', description: 'Great for storing apple crates and other produce', ...SHARED },
];

const result = runSearch(candidates, 'apple', config, { limit: 20 });
const resultIds = result.results.map(p => p._id);
const categoryOf = (id) => candidates.find(p => p._id === id).category;

test('"apple" (mixed-category pool): derivedCategory resolves to the majority (Electronics)', () => {
  assert.strictEqual(result.intent.category, 'Electronics');
});

test('"apple": genuine minority-category strong matches (Groceries) are NOT dropped from results', () => {
  assert.ok(resultIds.includes('g1'), `expected g1 in results, got ${JSON.stringify(resultIds)}`);
  assert.ok(resultIds.includes('g2'), `expected g2 in results, got ${JSON.stringify(resultIds)}`);
});

test('"apple": dominant-category (Electronics) matches also present', () => {
  ['e1', 'e2', 'e3'].forEach(id => assert.ok(resultIds.includes(id), `expected ${id} in results, got ${JSON.stringify(resultIds)}`));
});

test('"apple": category boost ranks ALL dominant-category (Electronics) results above the minority (Groceries) results', () => {
  const lastElectronicsIndex = Math.max(...resultIds.filter(id => categoryOf(id) === 'Electronics').map(id => resultIds.indexOf(id)));
  const firstGroceriesIndex = Math.min(...resultIds.filter(id => categoryOf(id) === 'Groceries').map(id => resultIds.indexOf(id)));
  assert.ok(lastElectronicsIndex < firstGroceriesIndex,
    `expected all Electronics ranked above Groceries, got order ${JSON.stringify(resultIds.map(id => `${id}:${categoryOf(id)}`))}`);
});

test('"apple": weak (description-only) cross-category straggler ("Laundry Basket") survives instead of being silently dropped', () => {
  assert.ok(resultIds.includes('o1'), `expected o1 in results, got ${JSON.stringify(resultIds)}`);
});

test('"apple": the description-only straggler ranks below every genuine name-match (both categories)', () => {
  const stragglerIndex = resultIds.indexOf('o1');
  ['e1', 'e2', 'e3', 'g1', 'g2'].forEach(id => {
    assert.ok(resultIds.indexOf(id) < stragglerIndex,
      `expected ${id} ranked above the straggler, got order ${JSON.stringify(resultIds)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// [Task: search-multicategory refinement] Semantic-only off-category cut
// ─────────────────────────────────────────────────────────────────────────────
// "iphone": Electronics-dominant via strong literal matches (both "Apple
// iPhone..." products literally contain "iphone"). A Groceries "Apple" fruit
// item scores a deceptively high MOCKED semantic similarity (the shared
// brand word "apple" pulls it close in embedding space) but has ZERO literal
// "iphone" match anywhere (name/category/description) -> must be CUT. A
// second Groceries item mentions "iphone" in its description (a genuine weak
// literal match) -> must SURVIVE, just ranked low, proving the cut targets
// semantic-only entries specifically, not every off-category item.
const iphoneCandidates = [
  { _id: 'ip1', name: 'Apple iPhone 15', category: 'Electronics', description: 'Smartphone', ...SHARED },
  { _id: 'ip2', name: 'Apple iPhone 15 Pro', category: 'Electronics', description: 'Smartphone Pro', ...SHARED },
  { _id: 'fruit1', name: 'Apple', category: 'Groceries', description: 'Fresh fruit', ...SHARED },
  { _id: 'fruit2', name: 'Fruit Combo Pack', category: 'Groceries', description: 'Includes banana, orange, and an iphone-shaped fruit sticker', ...SHARED },
];
// semanticFloor=0.50, semanticTopMargin=0.09 (searchConfig.js) -> with
// topSem=0.70 (ip1), semCut = max(0.50, 0.70-0.09) = 0.61. fruit1 (0.62) and
// fruit2 (0.65) both clear the cut, so both enter the pool via the semantic
// stage — fruit1 with no literal match (semantic-only), fruit2 already
// carrying a literal (weak) match via its description.
const iphoneSemanticScores = { ip1: 0.70, ip2: 0.68, fruit1: 0.62, fruit2: 0.65 };
const iphoneResult = runSearch(iphoneCandidates, 'iphone', config, { limit: 20, semanticScores: iphoneSemanticScores });
const iphoneResultIds = iphoneResult.results.map(p => p._id);

test('"iphone": derivedCategory resolves to Electronics', () => {
  assert.strictEqual(iphoneResult.intent.category, 'Electronics');
});

test('"iphone": dominant-category (Electronics) matches present', () => {
  ['ip1', 'ip2'].forEach(id => assert.ok(iphoneResultIds.includes(id), `expected ${id} in results, got ${JSON.stringify(iphoneResultIds)}`));
});

test('"iphone": semantic-only off-category item ("Apple" fruit, zero literal match) is CUT', () => {
  assert.ok(!iphoneResultIds.includes('fruit1'), `expected fruit1 cut, got ${JSON.stringify(iphoneResultIds)}`);
});

test('"iphone": off-category item with a weak (description-only) literal match SURVIVES, ranked low', () => {
  assert.ok(iphoneResultIds.includes('fruit2'), `expected fruit2 to survive, got ${JSON.stringify(iphoneResultIds)}`);
  const fruit2Index = iphoneResultIds.indexOf('fruit2');
  ['ip1', 'ip2'].forEach(id => {
    assert.ok(iphoneResultIds.indexOf(id) < fruit2Index, `expected ${id} ranked above fruit2, got ${JSON.stringify(iphoneResultIds)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// derivedCategory null -> nothing is cut, even semantic-only off-category items
// ─────────────────────────────────────────────────────────────────────────────
// "gizmo": no product literally matches the term anywhere -> strong=[] ->
// deriveCategoryFromMatches([]) returns category:null (searchEngine.js:604)
// -> there's no dominant category to judge "off-category" against, so the
// cut must not touch anything, regardless of semantic score or category.
const gizmoCandidates = [
  { _id: 'gz1', name: 'Random Widget', category: 'Electronics', description: '', ...SHARED },
  { _id: 'gz2', name: 'Mystery Box', category: 'Toys', description: '', ...SHARED },
];
const gizmoSemanticScores = { gz1: 0.60, gz2: 0.58 };
const gizmoResult = runSearch(gizmoCandidates, 'gizmo', config, { limit: 20, semanticScores: gizmoSemanticScores });
const gizmoResultIds = gizmoResult.results.map(p => p._id);

test('"gizmo": no literal match anywhere -> derivedCategory is null', () => {
  assert.strictEqual(gizmoResult.intent.category, null);
});

test('"gizmo": derivedCategory null -> semantic-only off-category items all survive (no cut without a dominant category)', () => {
  assert.ok(gizmoResultIds.includes('gz1') && gizmoResultIds.includes('gz2'),
    `expected both gz1 and gz2 to survive, got ${JSON.stringify(gizmoResultIds)}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
