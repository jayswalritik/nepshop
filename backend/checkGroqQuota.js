/**
 * ─────────────────────────────────────────────────────────────────────────────
 * checkGroqQuota.js — standalone diagnostic. Run with: node checkGroqQuota.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Sends ONE minimal chat completion to the same Groq endpoint/model the app
 * uses (see backend/services/chatbot/ollamaService.js — read-only reference,
 * not modified) purely to read back the x-ratelimit-* response headers and
 * report remaining quota. Does not touch any existing file or dependency.
 *
 * Exit code: 0 on a successful quota read, 1 on any failure (missing key,
 * rate limited, auth error, network error).
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const axios = require('axios');

// Same endpoint/model/header convention as ollamaService.js's groqGenerate.
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_KEY   = process.env.GROQ_API_KEY || null;

// ── Go-style duration parser ("4h12m0s", "7m30s", "59.56s", "185ms") ────────
// Groq's x-ratelimit-reset-* headers use this format. Sub-second resets are
// rendered by Go purely in "ms" (no combined "h"/"m"/"s" for those), so that's
// handled as its own case. Returns total seconds, or null if the string
// doesn't match either shape (caller falls back to printing raw).
const parseGoDuration = (str) => {
  if (!str) return null;
  const s = String(str);

  const msOnly = s.match(/^(\d+(?:\.\d+)?)ms$/);
  if (msOnly) return parseFloat(msOnly[1]) / 1000;

  const hms = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/);
  if (!hms || (!hms[1] && !hms[2] && !hms[3])) return null;
  const hours   = parseInt(hms[1] || '0', 10);
  const minutes = parseInt(hms[2] || '0', 10);
  const seconds = parseFloat(hms[3] || '0');
  return hours * 3600 + minutes * 60 + seconds;
};

// Total seconds -> friendly "4h 12m" / "7m 30s" / "45s" / "185ms" form.
const formatFriendly = (totalSeconds) => {
  if (totalSeconds == null) return null;
  if (totalSeconds < 1) return `${Math.round(totalSeconds * 1000)}ms`;

  // Round to the nearest whole second FIRST, then split — avoids a rounded
  // seconds value of 60 displaying as "60s" instead of carrying into minutes.
  const rounded = Math.round(totalSeconds);
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = rounded % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
};

const fmtNum = (n) => (n == null ? '?' : Number(n).toLocaleString());

// Pull every header matching x-ratelimit-* (case-insensitive; axios already
// lowercases header names) so anything Groq adds beyond the 6 documented
// ones still gets surfaced.
const collectRateLimitHeaders = (headers) => {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase().startsWith('x-ratelimit-')) out[key.toLowerCase()] = value;
  }
  return out;
};

const printQuotaBlock = (headers) => {
  const h = collectRateLimitHeaders(headers);

  console.log(`GROQ QUOTA (${GROQ_MODEL})`);

  const reqLimit     = h['x-ratelimit-limit-requests'];
  const reqRemaining = h['x-ratelimit-remaining-requests'];
  const reqReset     = h['x-ratelimit-reset-requests'];
  if (reqLimit != null || reqRemaining != null) {
    const resetSec = parseGoDuration(reqReset);
    const resetStr = resetSec != null ? ` (resets in ${formatFriendly(resetSec)})` : (reqReset ? ` (resets in ${reqReset})` : '');
    console.log(`Requests: ${fmtNum(reqRemaining)} / ${fmtNum(reqLimit)} remaining${resetStr}`);
  } else {
    console.log('Requests: (no x-ratelimit-*-requests headers in response)');
  }

  const tokLimit     = h['x-ratelimit-limit-tokens'];
  const tokRemaining = h['x-ratelimit-remaining-tokens'];
  const tokReset     = h['x-ratelimit-reset-tokens'];
  if (tokLimit != null || tokRemaining != null) {
    const resetSec = parseGoDuration(tokReset);
    const resetStr = resetSec != null ? ` (resets in ${formatFriendly(resetSec)})` : (tokReset ? ` (resets in ${tokReset})` : '');
    console.log(`Tokens:   ${fmtNum(tokRemaining)} / ${fmtNum(tokLimit)} remaining${resetStr}`);
  } else {
    console.log('Tokens:   (no x-ratelimit-*-tokens headers in response)');
  }

  console.log();
  console.log('Raw x-ratelimit-* headers:');
  const keys = Object.keys(h);
  if (keys.length === 0) {
    console.log('  (none present in response)');
  } else {
    keys.sort().forEach(k => console.log(`  ${k}: ${h[k]}`));
  }
};

const main = async () => {
  if (!GROQ_KEY) {
    console.error('GROQ_API_KEY is missing from the environment (.env). Cannot check quota.');
    process.exit(1);
  }

  let response;
  try {
    response = await axios.post(
      GROQ_URL,
      {
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      },
      {
        headers: { Authorization: `Bearer ${GROQ_KEY}` },
        timeout: 8000,
      }
    );
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      if (status === 429) {
        console.error('RATE LIMITED (429) — Groq rejected the request due to quota exhaustion.');
        console.error();
        printQuotaBlock(err.response.headers);
        process.exit(1);
      }
      if (status === 401 || status === 403) {
        console.error(`Auth error (${status}) — GROQ_API_KEY appears to be invalid or unauthorized.`);
        process.exit(1);
      }
      console.error(`Groq returned an unexpected error: HTTP ${status}`);
      console.error(err.response.data ? JSON.stringify(err.response.data) : err.message);
      process.exit(1);
    }
    // No response at all: DNS failure, connection refused, timeout, etc.
    console.error('Groq unreachable — network error:', err.code || err.message);
    process.exit(1);
  }

  printQuotaBlock(response.headers);
  process.exit(0);
};

main();
