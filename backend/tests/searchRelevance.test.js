/**
 * ─────────────────────────────────────────────────────────────────────────────
 * searchRelevance.test.js — run with: node backend/tests/searchRelevance.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * [Task: search-relevance] Pure-function tests for the search-relevance fixes
 * in backend/services/searchEngine.js and searchConfig.js. No DB connection,
 * no LLM calls — in-memory fixtures + mocked semanticScores maps only.
 *
 * Covers:
 *   1. General inflectional stemming (stemCandidates + wordMatch via
 *      partitionMatches) — plurals AND past-tense ("-ed"), both directions
 *      (plural query -> singular product word, and vice versa), with generic
 *      fixture words (not "phone"/"mobile") to prove it's a general rule.
 *   2. The fuzzy corrector reaching into the synonym-group vocabulary
 *      ("monile"/"mobie" -> "mobile") even though no catalog product spells
 *      it that way.
 *   3. Quality-signal de-weighting: a high-rating/high-popularity but
 *      off-relevance item does not outrank a stronger-relevance item.
 *   4. semanticFloorDelta near-miss admission: a sub-floor item close enough
 *      to the floor AND clearing the relative margin is admitted; one
 *      further below is still excluded (the mechanism stays narrow).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const assert = require('assert');
const config = require('../services/searchConfig');
const {
  runSearch,
  partitionMatches,
  stemCandidates,
  fuzzyCorrectToken,
  buildSynonymVocabulary,
  parseQuery,
} = require('../services/searchEngine');

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

const SHARED = { price: 1000, discount: 0, rating: 0, numReviews: 0, createdAt: new Date(), isActive: true, stock: 10 };

// ─────────────────────────────────────────────────────────────────────────────
// 1. General stemming — generic words, not phone/mobile, to prove generality
// ─────────────────────────────────────────────────────────────────────────────

test('stemCandidates("phones") includes "phone"', () => {
  assert.ok(stemCandidates('phones').includes('phone'));
});

test('stemCandidates("phoned") includes "phone" (silent-e verb)', () => {
  assert.ok(stemCandidates('phoned').includes('phone'));
});

test('stemCandidates("boxes") includes "box" (-es plural)', () => {
  assert.ok(stemCandidates('boxes').includes('box'));
});

test('stemCandidates short word ("as") is left untouched (length guard)', () => {
  assert.deepStrictEqual(stemCandidates('as'), ['as']);
});

test('partitionMatches: plural QUERY term matches a singular PRODUCT word via stemming ("watches" -> "Digital Watch")', () => {
  const fixture = [{ _id: 'w1', name: 'Digital Watch', category: 'Electronics', description: '' }];
  const { strong } = partitionMatches(fixture, ['watches']);
  assert.strictEqual(strong.length, 1, 'expected a strong match');
});

test('partitionMatches: reverse direction — singular QUERY term matches a plural PRODUCT word via stemming ("watch" -> "Digital Watches Set")', () => {
  const fixture = [{ _id: 'w2', name: 'Digital Watches Set', category: 'Electronics', description: '' }];
  const { strong } = partitionMatches(fixture, ['watch']);
  assert.strictEqual(strong.length, 1, 'expected a strong match');
});

test('partitionMatches: past-tense QUERY term matches base PRODUCT word via stemming ("boxed" -> "Storage Box")', () => {
  const fixture = [{ _id: 'b1', name: 'Storage Box', category: 'Home & Kitchen', description: '' }];
  const { strong } = partitionMatches(fixture, ['boxed']);
  assert.strictEqual(strong.length, 1, 'expected a strong match');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Fuzzy corrector reaching the synonym-group vocabulary
// ─────────────────────────────────────────────────────────────────────────────

const synVocab = buildSynonymVocabulary(config.synonymGroups);

test('buildSynonymVocabulary includes "mobile" (from the phone synonym group)', () => {
  assert.ok(synVocab.has('mobile'));
});

test('fuzzyCorrectToken("monile", ...) corrects to "mobile" via the broadened vocabulary', () => {
  assert.strictEqual(fuzzyCorrectToken('monile', synVocab, { synonymWords: synVocab }), 'mobile');
});

test('fuzzyCorrectToken("mobie", ...) corrects to "mobile" (bypasses the valid-English-word guard for a synonym match)', () => {
  assert.strictEqual(fuzzyCorrectToken('mobie', synVocab, { synonymWords: synVocab }), 'mobile');
});

test('parseQuery("monile", ...) end-to-end corrects to "mobile" deterministically (no LLM involved)', () => {
  const intent = parseQuery('monile', config, new Map());
  assert.strictEqual(intent.corrected, 'mobile');
});

test('parseQuery("mobie", ...) end-to-end corrects to "mobile" deterministically', () => {
  const intent = parseQuery('mobie', config, new Map());
  assert.strictEqual(intent.corrected, 'mobile');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Quality-signal de-weighting — relevance must dominate rating/popularity
// ─────────────────────────────────────────────────────────────────────────────
// "real1" is a genuine strong (name) literal match for "phone", modest
// semantic score. "junk1" is the SAME category (so the multi-category
// semantic-only-cut doesn't remove it first, isolating quality-de-weight as
// the mechanism under test), has NO literal match, a near-floor semantic
// score, but a maxed-out rating/popularity — exactly the shape that used to
// let junk outrank real matches before this task.
const qualityPool = [
  { _id: 'real1', name: 'Test Phone', category: 'Electronics', description: 'A real phone', ...SHARED },
  { _id: 'junk1', name: 'Unrelated Electronics Gadget', category: 'Electronics', description: '', ...SHARED, rating: 5, numReviews: 5000 },
];
const qualitySemScores = { real1: 0.60, junk1: 0.52 };
const qualityResult = runSearch(qualityPool, 'phone', config, { limit: 20, semanticScores: qualitySemScores });

test('quality de-weight: a maxed-rating/popularity off-relevance item does not outrank a genuine relevance match', () => {
  const ids = qualityResult.results.map(p => p._id);
  assert.ok(ids.includes('real1') && ids.includes('junk1'), `expected both present, got ${JSON.stringify(ids)}`);
  assert.ok(ids.indexOf('real1') < ids.indexOf('junk1'),
    `expected real1 ranked above junk1, got order ${JSON.stringify(ids)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. semanticFloorDelta near-miss admission
// ─────────────────────────────────────────────────────────────────────────────
// No literal matches at all for either item (pure semantic-only browse), so
// admission depends entirely on the semCut computation. topSem=0.56 ->
// relative margin cut = 0.56-0.09 = 0.47. Floor-delta cut = 0.50-0.01 = 0.49.
// semCut = max(0.49, 0.47) = 0.49.
//   sibling1 (0.494) clears 0.49 -> ADMITTED (would have failed the old,
//     un-relaxed 0.50 floor).
//   excluded1 (0.40) clears neither -> still excluded (mechanism stays narrow).
const floorPool = [
  { _id: 'top1',       name: 'Top Item',       category: 'Electronics', description: '', ...SHARED },
  { _id: 'sibling1',   name: 'Sibling Item',    category: 'Electronics', description: '', ...SHARED },
  { _id: 'excluded1',  name: 'Unrelated Item',  category: 'Electronics', description: '', ...SHARED },
];
const floorSemScores = { top1: 0.56, sibling1: 0.494, excluded1: 0.40 };
const floorResult = runSearch(floorPool, 'gizmo widget', config, { limit: 20, semanticScores: floorSemScores });

test('semanticFloorDelta: a 0.494 near-miss sibling is admitted (clears floor-delta AND the relative margin)', () => {
  const ids = floorResult.results.map(p => p._id);
  assert.ok(ids.includes('sibling1'), `expected sibling1 admitted, got ${JSON.stringify(ids)}`);
});

test('semanticFloorDelta: an item further below the floor still excluded (relaxation stays narrow)', () => {
  const ids = floorResult.results.map(p => p._id);
  assert.ok(!ids.includes('excluded1'), `expected excluded1 NOT admitted, got ${JSON.stringify(ids)}`);
});

test('semanticFloorDelta: semanticFloor itself is untouched in config', () => {
  assert.strictEqual(config.semanticFloor, 0.50);
});

// ─────────────────────────────────────────────────────────────────────────────
// [Task: search-tuning] semanticFloorDelta is now ANCHOR-GATED — the delta
// only applies when the query has at least one literal (strong or weak)
// match. The branch-vs-main comparison (docs/search-branch-comparison.md)
// found the un-gated version above relaxing the floor for EVERY query,
// letting near-floor noise into genuinely answerless queries ("guitar",
// "kayak", "asdfghjkl" — nothing in the catalog matches at all).
//
// NOTE: the "gizmo widget" fixture above (no literal match for either
// candidate) now EXCLUDES sibling1 under the new anchor-gated behavior —
// this directly inverts what that pre-existing test asserts. Per this
// project's "extend, never replace" testing rule, that assertion is left
// untouched and is EXPECTED to fail after this change; see the task summary
// for the full explanation. The two tests below use fresh fixtures to
// demonstrate the new, correct behavior without touching it.
// ─────────────────────────────────────────────────────────────────────────────

// (a) Answerless: zero literal matches anywhere -> the delta must NOT apply,
// so a 0.494 near-miss sibling (same shape as the old fixture) is EXCLUDED.
const answerlessPool = [
  { _id: 'ans_top',     name: 'Alpha Item', category: 'Electronics', description: '', ...SHARED },
  { _id: 'ans_sibling', name: 'Beta Item',  category: 'Electronics', description: '', ...SHARED },
];
const answerlessSemScores = { ans_top: 0.56, ans_sibling: 0.494 };
const answerlessResult = runSearch(answerlessPool, 'noise phrase xyz', config, { limit: 20, semanticScores: answerlessSemScores });

test('semanticFloorDelta (anchor-gated): a 0.494 near-miss sibling is EXCLUDED when the query has zero literal matches', () => {
  const ids = answerlessResult.results.map(p => p._id);
  assert.ok(!ids.includes('ans_sibling'), `expected ans_sibling excluded (no anchor -> strict floor), got ${JSON.stringify(ids)}`);
  assert.ok(ids.includes('ans_top'), `expected ans_top (clears the strict floor on its own) still admitted, got ${JSON.stringify(ids)}`);
});

// (b) Anchored: a genuine weak (description-only) literal match establishes
// an anchor -> the delta DOES apply, so a 0.494 near-miss sibling (with NO
// literal match of its own) is still admitted, same as the original fix.
const anchoredPool = [
  { _id: 'anchor_weak',    name: 'Widget Pro',       category: 'Electronics', description: 'A genuine gizmo device for daily use', ...SHARED },
  { _id: 'anchor_sibling', name: 'Gadget Companion', category: 'Electronics', description: '', ...SHARED },
];
const anchoredSemScores = { anchor_weak: 0.56, anchor_sibling: 0.494 };
const anchoredResult = runSearch(anchoredPool, 'gizmo', config, { limit: 20, semanticScores: anchoredSemScores });

test('semanticFloorDelta (anchor-gated): a 0.494 near-miss sibling is still ADMITTED when a weak literal anchor exists', () => {
  const ids = anchoredResult.results.map(p => p._id);
  assert.ok(ids.includes('anchor_weak'), `expected the weak-anchor item present, got ${JSON.stringify(ids)}`);
  assert.ok(ids.includes('anchor_sibling'), `expected anchor_sibling admitted (anchor present -> relaxed floor), got ${JSON.stringify(ids)}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
