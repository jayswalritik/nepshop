/**
 * ─────────────────────────────────────────────────────────────────────────────
 * returnWindow.js — pure TIME helpers for the post-delivery return window.
 * ─────────────────────────────────────────────────────────────────────────────
 * The ONE place remaining-time and window-length phrasing is computed, so the
 * chatbot (and any future caller) never hand-rolls Math.ceil/day math again.
 *
 * Rules that are non-negotiable here:
 *   • NO money arithmetic. The only numbers computed are elapsed/remaining time.
 *   • Remaining time ALWAYS rounds DOWN (Math.floor). Rounding up is the bug
 *     this file exists to kill — it once turned a 3-minute window into "1 day".
 *
 * No DB access, no config import, no imports from controllers/services — the
 * caller passes the window length in (in minutes) so this stays trivially
 * testable and reusable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const MS_PER_MIN  = 60 * 1000;
const MIN_PER_HR   = 60;
const MIN_PER_DAY  = 24 * 60;

// computeWindow(deliveredAt, windowMinutes, now) → { expiry, expired, minutesLeft }
//   expiry      — timestamp (ms) the window closes, or null when there's no
//                 valid deliveredAt
//   expired     — true once `now` is past expiry (and always true when there is
//                 no valid deliveredAt)
//   minutesLeft — whole minutes remaining, ROUNDED DOWN, never below 0
const computeWindow = (deliveredAt, windowMinutes, now = Date.now()) => {
  const ts = deliveredAt ? new Date(deliveredAt).getTime() : NaN;
  if (!deliveredAt || Number.isNaN(ts)) {
    return { expiry: null, expired: true, minutesLeft: 0 };
  }
  const expiry      = ts + windowMinutes * MS_PER_MIN;
  const expired     = now > expiry;
  const minutesLeft = expired ? 0 : Math.max(0, Math.floor((expiry - now) / MS_PER_MIN));
  return { expiry, expired, minutesLeft };
};

// formatRemaining(minutesLeft) → bare duration phrase (NO trailing "left").
//   < 1     → "less than a minute"
//   < 60    → "4 min"        (no pluralisation of "min")
//   < 1440  → "3 hr" / "3 hr 20 min"
//   >= 1440 → "1 day" / "6 days"   (whole days, hours dropped)
const formatRemaining = (minutesLeft) => {
  const m = Math.max(0, Math.floor(minutesLeft));
  if (m < 1)          return 'less than a minute';
  if (m < MIN_PER_HR) return `${m} min`;
  if (m < MIN_PER_DAY) {
    const hr  = Math.floor(m / MIN_PER_HR);
    const rem = m % MIN_PER_HR;
    return rem === 0 ? `${hr} hr` : `${hr} hr ${rem} min`;
  }
  const days = Math.floor(m / MIN_PER_DAY);
  return `${days} day${days === 1 ? '' : 's'}`;
};

// formatLength(windowMinutes) → how LONG the window is, for "returns are only
// possible within X of delivery" copy.
//   < 60    → "5 minutes" / "1 minute"
//   < 1440  → "3 hours" / "1 hour", plus " 30 minutes" only on a remainder
//   >= 1440 → "7 days" / "1 day"
const formatLength = (windowMinutes) => {
  const m = Math.max(0, Math.floor(windowMinutes));
  if (m < MIN_PER_HR) return `${m} minute${m === 1 ? '' : 's'}`;
  if (m < MIN_PER_DAY) {
    const hr  = Math.floor(m / MIN_PER_HR);
    const rem = m % MIN_PER_HR;
    return rem === 0
      ? `${hr} hour${hr === 1 ? '' : 's'}`
      : `${hr} hour${hr === 1 ? '' : 's'} ${rem} minute${rem === 1 ? '' : 's'}`;
  }
  const days = Math.floor(m / MIN_PER_DAY);
  return `${days} day${days === 1 ? '' : 's'}`;
};

module.exports = { computeWindow, formatRemaining, formatLength };
