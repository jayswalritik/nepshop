// ─────────────────────────────────────────────────────────────────────────────
// settlementConfig.js — the ONE place all money-TIMING values live.
// ─────────────────────────────────────────────────────────────────────────────
// This controls WHEN money moves (escrow lock, return window, release
// schedule) — never HOW MUCH. sellerShare/commission/agent-fee formulas are
// untouched by this file and must stay that way.
//
// Every value below can be overridden via an environment variable without
// any code change; .env does not need new entries — these defaults already
// cover the current (testing) timings.
// ─────────────────────────────────────────────────────────────────────────────

// Reads an env var as a number; falls back to `fallback` if unset, empty, or
// not a valid number (so an explicit "0" override is respected, unlike `||`).
const envNumber = (key, fallback) => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const num = Number(raw);
  return Number.isNaN(num) ? fallback : num;
};

// Minutes a shipment's seller funds stay locked (escrow) after delivery
// before they're eligible for release. Production would use 7 * 24 * 60 (7 days).
const ESCROW_LOCK_MINUTES = envNumber('ESCROW_LOCK_MINUTES', 5);

// Minutes after delivery a customer may still request a return for an order.
// Production would use 7 * 24 * 60 (7 days).
const RETURN_WINDOW_MINUTES = envNumber('RETURN_WINDOW_MINUTES', 5);

// Cron schedule for the settlement-release job (server.js). Production would
// use a once-daily schedule, e.g. '0 1 * * *'.
const RELEASE_CRON = process.env.RELEASE_CRON || '* * * * *';

module.exports = {
  ESCROW_LOCK_MINUTES,
  RETURN_WINDOW_MINUTES,
  RELEASE_CRON,
};
