/**
 * inputValidation.test.js — run with: node backend/tests/inputValidation.test.js
 *
 * Pure-function tests for the single contact-validation helper
 * (backend/utils/contactValidation.js). No DB, no jest — a plain node script
 * matching the other suites' pattern (local `test`, node assert, exit code).
 *
 * Rules under test:
 *   Phone — exactly 10 digits, first two 98 or 97; nothing else.
 *   Email — standard email-format check.
 */

const assert = require('assert');
const { isValidNepaliPhone, isValidEmail, isBlankOrValidNepaliPhone } = require('../utils/contactValidation');

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

// ── Phone: valid ─────────────────────────────────────────────
test('phone: a 98xxxxxxxx number passes', () => {
  assert.strictEqual(isValidNepaliPhone('9812345678'), true);
});

test('phone: a 97xxxxxxxx number passes', () => {
  assert.strictEqual(isValidNepaliPhone('9712345678'), true);
});

test('phone: surrounding whitespace is tolerated (trimmed) then passes', () => {
  assert.strictEqual(isValidNepaliPhone('  9812345678  '), true);
});

// ── Phone: invalid ───────────────────────────────────────────
test('phone: a 96 prefix is rejected', () => {
  assert.strictEqual(isValidNepaliPhone('9612345678'), false);
});

test('phone: 9 digits is rejected', () => {
  assert.strictEqual(isValidNepaliPhone('981234567'), false);
});

test('phone: 11 digits is rejected', () => {
  assert.strictEqual(isValidNepaliPhone('98123456789'), false);
});

test('phone: non-numeric is rejected', () => {
  assert.strictEqual(isValidNepaliPhone('98abcd5678'), false);
});

test('phone: a leading-zero landline is rejected', () => {
  assert.strictEqual(isValidNepaliPhone('0141234567'), false);
});

test('phone: a +977 prefixed number is rejected (no country code allowed)', () => {
  assert.strictEqual(isValidNepaliPhone('+9779812345678'), false);
});

test('phone: internal spaces are rejected', () => {
  assert.strictEqual(isValidNepaliPhone('98 1234 5678'), false);
});

test('phone: a non-string value is rejected, not thrown', () => {
  assert.strictEqual(isValidNepaliPhone(9812345678), false);
  assert.strictEqual(isValidNepaliPhone(null), false);
  assert.strictEqual(isValidNepaliPhone(undefined), false);
});

// ── Email ────────────────────────────────────────────────────
test('email: a standard address passes', () => {
  assert.strictEqual(isValidEmail('user@example.com'), true);
  assert.strictEqual(isValidEmail('a.b-c@sub.domain.co'), true);
});

test('email: missing @ is rejected', () => {
  assert.strictEqual(isValidEmail('userexample.com'), false);
});

test('email: missing domain dot is rejected', () => {
  assert.strictEqual(isValidEmail('user@example'), false);
});

test('email: whitespace inside is rejected', () => {
  assert.strictEqual(isValidEmail('user name@example.com'), false);
});

test('email: empty / non-string is rejected, not thrown', () => {
  assert.strictEqual(isValidEmail(''), false);
  assert.strictEqual(isValidEmail(null), false);
  assert.strictEqual(isValidEmail(42), false);
});

// ── Shop contact phone (REQUIRED — uses isValidNepaliPhone directly) ─────────
test('shop phone: a valid 98/97 number passes', () => {
  assert.strictEqual(isValidNepaliPhone('9841234567'), true);
  assert.strictEqual(isValidNepaliPhone('9741234567'), true);
});

test('shop phone: an invalid number is rejected', () => {
  assert.strictEqual(isValidNepaliPhone('9612345678'), false); // wrong prefix
  assert.strictEqual(isValidNepaliPhone('98123'), false);      // too short
});

test('shop phone: empty/absent is rejected (shop phone is required)', () => {
  assert.strictEqual(isValidNepaliPhone(''), false);
  assert.strictEqual(isValidNepaliPhone(undefined), false);
});

// ── Payout numbers (OPTIONAL — uses isBlankOrValidNepaliPhone) ───────────────
test('payout: an empty / absent number is ACCEPTED (payout stays optional)', () => {
  assert.strictEqual(isBlankOrValidNepaliPhone(''), true);
  assert.strictEqual(isBlankOrValidNepaliPhone('   '), true);
  assert.strictEqual(isBlankOrValidNepaliPhone(null), true);
  assert.strictEqual(isBlankOrValidNepaliPhone(undefined), true);
});

test('payout: a non-empty INVALID number is rejected', () => {
  assert.strictEqual(isBlankOrValidNepaliPhone('9612345678'), false); // wrong prefix
  assert.strictEqual(isBlankOrValidNepaliPhone('12345'), false);      // too short
  assert.strictEqual(isBlankOrValidNepaliPhone('98abcd5678'), false); // non-numeric
});

test('payout: a non-empty VALID number passes', () => {
  assert.strictEqual(isBlankOrValidNepaliPhone('9812345678'), true);
  assert.strictEqual(isBlankOrValidNepaliPhone('  9712345678  '), true); // trimmed
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
