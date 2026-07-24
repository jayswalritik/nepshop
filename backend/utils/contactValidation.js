// ─────────────────────────────────────────────────────────────────────────────
// contactValidation.js — the SINGLE source of truth for email + phone rules.
// The regexes live ONLY here; every backend call site (register route + the
// profile-update controllers) imports these helpers. Do not re-write either
// regex anywhere else in the backend.
//
// Phone: a Nepali mobile number — exactly 10 digits, first two digits 98 or 97.
//        Nothing else is valid (no spaces, no +977 prefix, no landlines).
// Email: a standard email-format check.
// ─────────────────────────────────────────────────────────────────────────────

const PHONE_REGEX = /^(98|97)\d{8}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PHONE_ERROR_MESSAGE = 'Phone number must be exactly 10 digits and start with 98 or 97.';
const EMAIL_ERROR_MESSAGE = 'Please enter a valid email address.';
// Field-specific copies of the SAME rule (same regex), so the shop-contact and
// payout inputs get their own clear per-field messages without re-stating the digits everywhere.
const SHOP_PHONE_ERROR_MESSAGE = 'Shop contact number must be exactly 10 digits and start with 98 or 97.';
const KHALTI_ERROR_MESSAGE     = 'Khalti number must be exactly 10 digits and start with 98 or 97.';
const ESEWA_ERROR_MESSAGE      = 'eSewa number must be exactly 10 digits and start with 98 or 97.';

// Both tolerate surrounding whitespace (they trim first) and reject non-strings,
// so a missing/oddly-typed value is simply "invalid" rather than throwing.
const isValidNepaliPhone = (value) =>
  typeof value === 'string' && PHONE_REGEX.test(value.trim());

const isValidEmail = (value) =>
  typeof value === 'string' && EMAIL_REGEX.test(value.trim());

// For OPTIONAL phone fields (Khalti/eSewa payout numbers): a blank/absent value
// is allowed; any value actually provided must satisfy isValidNepaliPhone.
// Reuses the same regex — never re-implements it.
const isBlankOrValidNepaliPhone = (value) =>
  value == null || String(value).trim() === '' || isValidNepaliPhone(value);

module.exports = {
  PHONE_REGEX,
  EMAIL_REGEX,
  PHONE_ERROR_MESSAGE,
  EMAIL_ERROR_MESSAGE,
  SHOP_PHONE_ERROR_MESSAGE,
  KHALTI_ERROR_MESSAGE,
  ESEWA_ERROR_MESSAGE,
  isValidNepaliPhone,
  isValidEmail,
  isBlankOrValidNepaliPhone,
};
