/**
 * ─────────────────────────────────────────────────────────────────────────────
 * searchFilterGuard.test.js — run with: node backend/tests/searchFilterGuard.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * [Task: search-relevance] Pure-function tests for the two guards on the LLM
 * result filter (backend/services/resultFilter.js). No DB connection, no real
 * LLM call — ollamaService.generate is replaced with an in-process mock
 * BEFORE resultFilter.js is first required, so its own top-level
 * `const { generate } = require('./chatbot/ollamaService')` destructures our
 * mock instead of the real implementation.
 *
 * Background: live logs showed Groq nondeterministically vetoing the top-2
 * semantic scorers (the only 2 real phones in the catalog) on different runs
 * of "phone"/"mobile"/"phones"/"mobiles". Two guards fix this:
 *   1. Tiny-pool skip: pools of <= 3 items never reach the LLM.
 *   2. Top-scorer protection: items within filterProtectMargin (searchConfig.js)
 *      of the pool's top _searchSemantic score are excluded from the prompt
 *      entirely, so the LLM structurally cannot veto them.
 *
 * Covers:
 *   (a) pool of 2 -> filter skipped, LLM never invoked.
 *   (b) top-2 near-equal semantic scorers protected -> excluded from the
 *       prompt, survive even when the mock vetoes everything it WAS shown.
 *   (c) weak-tail item vetoed by the mocked LLM is still removed.
 *   (d) items without semantic scores remain vetoable (not auto-protected).
 *
 * [Task: search-tuning] Also covers the rescue-pool / rescue-term-cache
 * guards added on top of the above:
 *   (e) a rescue-derived tiny pool (options.isRescuePool=true) is judged by
 *       the LLM instead of being tiny-pool-skipped.
 *   (f) an organic tiny pool (isRescuePool false/default) still skips —
 *       regression guard for (a).
 *   (g) the rescue-term cache returns identical terms on a repeat call
 *       without a second understandQuery() call.
 *   (h) a different query still triggers its own fresh call (cache is
 *       actually keyed, not a blanket "never call again").
 * ─────────────────────────────────────────────────────────────────────────────
 */

const assert = require('assert');

// Install the mocks BEFORE resultFilter.js / nepShopSearchAdapter.js are
// ever required in this process — both destructure their LLM dependency
// (`const { generate } = require(...)`, `const { understandQuery } =
// require(...)`) at their own top level, so the mutation must land first.
const ollamaService = require('../services/chatbot/ollamaService');
let generateCalls = 0;
let capturedUserPrompt = null;
let mockRelevant = null; // array of 1-based indices the mock "keeps", or null to simulate no response
ollamaService.generate = async (systemPrompt, userPrompt) => {
  generateCalls++;
  capturedUserPrompt = userPrompt;
  if (mockRelevant === null) return null;
  return JSON.stringify({ relevant: mockRelevant });
};

const queryUnderstanding = require('../services/queryUnderstanding');
let understandQueryCalls = 0;
let mockUnderstoodTerms = ['gizmo', 'widget'];
queryUnderstanding.understandQuery = async (queryText) => {
  understandQueryCalls++;
  return { terms: mockUnderstoodTerms };
};

const { filterResults } = require('../services/resultFilter');
// nepShopSearchAdapter.js requires ../models/Product at its own top level,
// but merely requiring it (as opposed to calling searchProducts/
// getAllSearchCandidates/getZeroResultRescue) never touches the DB — schema
// registration only. understandQueryCached is the only function exercised
// here, and it never touches Product/Mongo at all.
const { understandQueryCached } = require('../services/nepShopSearchAdapter');

let passed = 0;
let failed = 0;

const test = async (name, fn) => {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(`   ${err.message}`);
    failed++;
  }
};

const product = (id, name, category, description, searchSemantic) => {
  const p = { _id: id, name, category, description };
  if (typeof searchSemantic === 'number') p._searchSemantic = searchSemantic;
  return p;
};

(async () => {
  // ── (a) Tiny pool (<= 3 items) -> skipped, LLM never invoked ─────────────
  generateCalls = 0;
  const tinyPool = [
    product('t1', 'Phone A', 'Electronics', 'Smartphone', 32),
    product('t2', 'Phone B', 'Electronics', 'Smartphone', 30),
  ];
  const tinyResult = await filterResults('phone', tinyPool);

  await test('(a) pool of 2: filter skipped, LLM never invoked', async () => {
    assert.strictEqual(generateCalls, 0, `expected generate() never called, got ${generateCalls} call(s)`);
    assert.strictEqual(tinyResult.fired, false);
    assert.strictEqual(tinyResult.skipReason, 'tinyPool');
    assert.deepStrictEqual([...tinyResult.keptIds].sort(), ['t1', 't2']);
  });

  // ── (b)/(c)/(d): pool of 5 (above the tiny-pool threshold) ────────────────
  // ph1/ph2: near-equal top semantic scorers (32, 30) -> protected (default
  // filterProtectMargin=4, so the cut is 32-4=28; both clear it).
  // acc1/acc2: weak-tail items (20, 18) -> below the cut, judged normally.
  // noScore: no _searchSemantic at all -> unprotected by definition, judged.
  const pool = [
    product('ph1',     'Phone A',           'Electronics', 'Smartphone', 32),
    product('ph2',     'Phone B',           'Electronics', 'Smartphone', 30),
    product('acc1',    'Phone Case',        'Accessories', 'Protective case', 20),
    product('acc2',    'Screen Protector',  'Accessories', 'Tempered glass', 18),
    product('noScore', 'Mystery Accessory', 'Accessories', 'No semantic score at all'),
  ];
  // Mock: even when asked to judge, keep ONLY the first judged candidate —
  // an intentionally aggressive veto that drops everything else IT WAS SHOWN.
  // judged = unprotected pool in order = [acc1, acc2, noScore] -> keeps acc1.
  mockRelevant = [1];
  generateCalls = 0;
  capturedUserPrompt = null;
  const guardResult = await filterResults('phone', pool);

  await test('(b) top-2 near-equal semantic scorers (ph1, ph2) excluded from the prompt and survive despite an aggressive veto', async () => {
    assert.strictEqual(generateCalls, 1, `expected exactly 1 generate() call, got ${generateCalls}`);
    assert.ok(!capturedUserPrompt.includes('Phone A'), `expected protected "Phone A" excluded from the prompt, got: ${capturedUserPrompt}`);
    assert.ok(!capturedUserPrompt.includes('Phone B'), `expected protected "Phone B" excluded from the prompt, got: ${capturedUserPrompt}`);
    assert.ok(guardResult.keptIds.includes('ph1'), `expected ph1 to survive, got ${JSON.stringify(guardResult.keptIds)}`);
    assert.ok(guardResult.keptIds.includes('ph2'), `expected ph2 to survive, got ${JSON.stringify(guardResult.keptIds)}`);
  });

  await test('(c) weak-tail item (acc2) vetoed by the mocked LLM is still removed', async () => {
    assert.ok(!guardResult.keptIds.includes('acc2'), `expected acc2 dropped, got ${JSON.stringify(guardResult.keptIds)}`);
  });

  await test('(d) item with no semantic score (noScore) is vetoable, not auto-protected', async () => {
    assert.ok(capturedUserPrompt.includes('Mystery Accessory'), `expected noScore to have been shown to the LLM, got: ${capturedUserPrompt}`);
    assert.ok(!guardResult.keptIds.includes('noScore'), `expected noScore dropped, got ${JSON.stringify(guardResult.keptIds)}`);
  });

  // ── (e) Rescue-derived tiny pool -> judged by the LLM, not skipped ────────
  // r2's semantic score is deliberately far below r1's (well outside
  // filterProtectMargin) so top-scorer protection doesn't ALSO sweep it in —
  // this test targets the tiny-pool-skip denial specifically, isolated from
  // the separate protection mechanism covered by tests (b)-(d).
  mockRelevant = [1]; // keep the only judged candidate (r2)
  generateCalls = 0;
  const rescueTinyPool = [
    product('r1', 'Rescue Item A', 'Electronics', 'From LLM rescue', 32),
    product('r2', 'Rescue Item B', 'Electronics', 'From LLM rescue', 5),
  ];
  const rescueTinyResult = await filterResults('phone', rescueTinyPool, { isRescuePool: true });

  await test('(e) rescue-derived tiny pool (isRescuePool=true) is judged by the LLM, not tiny-pool-skipped', async () => {
    assert.strictEqual(generateCalls, 1, `expected exactly 1 generate() call for a rescue-derived tiny pool, got ${generateCalls}`);
    assert.notStrictEqual(rescueTinyResult.skipReason, 'tinyPool', `expected NOT tinyPool-skipped, got skipReason=${rescueTinyResult.skipReason}`);
    assert.notStrictEqual(rescueTinyResult.skipReason, 'allProtected', `expected NOT allProtected, got skipReason=${rescueTinyResult.skipReason}`);
  });

  // ── (f) Organic tiny pool -> still skips (regression guard for (a)) ──────
  generateCalls = 0;
  const organicTinyPool = [
    product('o1', 'Organic Item A', 'Electronics', '', 10),
    product('o2', 'Organic Item B', 'Electronics', '', 9),
  ];
  const organicTinyResult = await filterResults('phone', organicTinyPool, { isRescuePool: false });

  await test('(f) organic tiny pool (isRescuePool=false) still skips the LLM', async () => {
    assert.strictEqual(generateCalls, 0, `expected generate() never called for an organic tiny pool, got ${generateCalls}`);
    assert.strictEqual(organicTinyResult.skipReason, 'tinyPool');
  });

  // ── (g)/(h) Rescue-term cache ──────────────────────────────────────────────
  understandQueryCalls = 0;
  mockUnderstoodTerms = ['alpha', 'beta'];
  const cacheKey = 'cache test query unique 20260721a';
  const cacheFirst  = await understandQueryCached(cacheKey);
  const cacheSecond = await understandQueryCached(cacheKey);

  await test('(g) rescue-term cache: identical repeat query returns identical terms without a second LLM call', async () => {
    assert.strictEqual(understandQueryCalls, 1, `expected exactly 1 understandQuery() call across 2 identical requests, got ${understandQueryCalls}`);
    assert.deepStrictEqual(cacheSecond, cacheFirst, 'expected identical cached terms on the second call');
  });

  understandQueryCalls = 0;
  mockUnderstoodTerms = ['gamma', 'delta'];
  await understandQueryCached('cache test query unique 20260721b');
  await understandQueryCached('cache test query unique 20260721c');

  await test('(h) rescue-term cache: a different query still triggers its own fresh LLM call', async () => {
    assert.strictEqual(understandQueryCalls, 2, `expected 2 separate calls for 2 different queries, got ${understandQueryCalls}`);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
