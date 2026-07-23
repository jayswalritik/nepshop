/**
 * ─────────────────────────────────────────────────────────────────────────────
 * returnWindow.test.js — run with: node backend/tests/returnWindow.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure unit tests for the three time helpers. No DB, no config, no Atlas —
 * every input is passed in (including `now`), so the tests are deterministic.
 *
 * The load-bearing property: remaining time ALWAYS rounds DOWN. The old code
 * used Math.ceil, which turned a 3-minute remainder into "1 day"; these tests
 * pin the floor behaviour so that can never come back.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const assert = require('assert');
const { computeWindow, formatRemaining, formatLength } = require('../utils/returnWindow');

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

const MIN = 60 * 1000;

// ── computeWindow ────────────────────────────────────────────────────────────
test('computeWindow: missing deliveredAt → expired, null expiry, 0 minutes', () => {
  assert.deepStrictEqual(computeWindow(null, 5, 1_000), { expiry: null, expired: true, minutesLeft: 0 });
});

test('computeWindow: invalid deliveredAt → expired, null expiry, 0 minutes', () => {
  assert.deepStrictEqual(computeWindow('not-a-date', 5, 1_000), { expiry: null, expired: true, minutesLeft: 0 });
});

test('computeWindow: 30 seconds remaining → minutesLeft 0, not expired', () => {
  const now = 10_000_000;
  const delivered = now - (5 * MIN - 30 * 1000); // 30s left in a 5-min window
  const w = computeWindow(delivered, 5, now);
  assert.strictEqual(w.expired, false);
  assert.strictEqual(w.minutesLeft, 0);
});

test('computeWindow: NEVER rounds up — 3 min 59 s remaining → 3, not 4', () => {
  const now = 10_000_000;
  const delivered = now - (5 * MIN - (3 * MIN + 59 * 1000)); // 3m59s left
  const w = computeWindow(delivered, 5, now);
  assert.strictEqual(w.minutesLeft, 3);
});

test('computeWindow: past the window → expired, minutesLeft 0', () => {
  const now = 10_000_000;
  const delivered = now - 6 * MIN; // 5-min window closed a minute ago
  const w = computeWindow(delivered, 5, now);
  assert.strictEqual(w.expired, true);
  assert.strictEqual(w.minutesLeft, 0);
});

test('computeWindow: exactly 200 min left in a long window → 200', () => {
  const now = 10_000_000;
  const delivered = now - (1440 - 200) * MIN; // 200 min left in a 1-day window
  const w = computeWindow(delivered, 1440, now);
  assert.strictEqual(w.expired, false);
  assert.strictEqual(w.minutesLeft, 200);
});

// ── formatRemaining ──────────────────────────────────────────────────────────
test('formatRemaining: 0 (30 s) → "less than a minute"', () => {
  assert.strictEqual(formatRemaining(0), 'less than a minute');
});
test('formatRemaining: 4 → "4 min"', () => {
  assert.strictEqual(formatRemaining(4), '4 min');
});
test('formatRemaining: 59 → "59 min"', () => {
  assert.strictEqual(formatRemaining(59), '59 min');
});
test('formatRemaining: 60 → "1 hr"', () => {
  assert.strictEqual(formatRemaining(60), '1 hr');
});
test('formatRemaining: 200 → "3 hr 20 min"', () => {
  assert.strictEqual(formatRemaining(200), '3 hr 20 min');
});
test('formatRemaining: 1440 → "1 day"', () => {
  assert.strictEqual(formatRemaining(1440), '1 day');
});
test('formatRemaining: 4320 → "3 days"', () => {
  assert.strictEqual(formatRemaining(4320), '3 days');
});
test('formatRemaining: never rounds up — 119 min → "1 hr 59 min", not "2 hr"', () => {
  assert.strictEqual(formatRemaining(119), '1 hr 59 min');
});

// ── formatLength ─────────────────────────────────────────────────────────────
test('formatLength: 5 → "5 minutes"', () => {
  assert.strictEqual(formatLength(5), '5 minutes');
});
test('formatLength: 1 → "1 minute"', () => {
  assert.strictEqual(formatLength(1), '1 minute');
});
test('formatLength: 60 → "1 hour"', () => {
  assert.strictEqual(formatLength(60), '1 hour');
});
test('formatLength: 90 → "1 hour 30 minutes"', () => {
  assert.strictEqual(formatLength(90), '1 hour 30 minutes');
});
test('formatLength: 1440 → "1 day"', () => {
  assert.strictEqual(formatLength(1440), '1 day');
});
test('formatLength: 10080 → "7 days"', () => {
  assert.strictEqual(formatLength(10080), '7 days');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
