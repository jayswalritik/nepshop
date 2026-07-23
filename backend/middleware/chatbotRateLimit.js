// ─────────────────────────────────────────────────────────────────────────────
// chatbotRateLimit.js — per-user limiter for the chatbot route.
// ─────────────────────────────────────────────────────────────────────────────
// No external dependency: a plain in-memory Map keyed by user id, fixed 60s
// window. Must run AFTER `protect` (needs req.user._id). Applied ONLY to the
// chatbot route (see routes/chatbotRoutes.js), never globally.
//
// The Map is bounded by lazy eviction on every call (expired windows are
// dropped) — no setInterval, so nothing keeps the Node process alive.
// ─────────────────────────────────────────────────────────────────────────────

// Both trivially changeable — the limiter's only tunables.
const WINDOW_MS    = 60 * 1000; // 60 seconds
const MAX_REQUESTS = 20;        // requests per user per window

// userId -> { count, windowStart }
const hits = new Map();

// Lazy eviction: drop entries whose window has fully expired. Keeps the Map
// from growing past the set of users active within one window. Called on every
// request — no timer.
const evictExpired = (now) => {
  for (const [key, entry] of hits) {
    if (now - entry.windowStart >= WINDOW_MS) hits.delete(key);
  }
};

const chatbotRateLimit = (req, res, next) => {
  const userId = req.user && req.user._id ? req.user._id.toString() : null;
  // No user id (shouldn't happen behind `protect`) — don't rate-limit here;
  // the normal auth path already governs unauthenticated access.
  if (!userId) return next();

  const now = Date.now();
  evictExpired(now);

  const entry = hits.get(userId);

  // No live window for this user → start a fresh one.
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    hits.set(userId, { count: 1, windowStart: now });
    return next();
  }

  // Within the window and already at the cap → 429, matching the app's error
  // response shape ({ success, message }); no counts or internals leaked.
  if (entry.count >= MAX_REQUESTS) {
    return res.status(429).json({
      success: false,
      message: "You're sending messages a bit fast — give me a moment.",
    });
  }

  entry.count += 1;
  return next();
};

module.exports = chatbotRateLimit;
