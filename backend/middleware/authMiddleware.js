const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');

// Single source of truth for the suspended-account message — shared with
// authController's login block (same user.status field, same wording) and
// matched verbatim by the frontend's axios response interceptor
// (frontend/src/utils/api.js) to tell "you got suspended mid-session" apart
// from any other 403 (e.g. authorizeRoles' "Access denied").
const SUSPENDED_MESSAGE = 'Your account has been suspended. Please contact support.';

// ── Protect: verify JWT and attach user to request ───────
const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorized — no token provided');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach full user to request (excluding password)
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      res.status(401);
      throw new Error('User no longer exists');
    }

    // Per-request suspension check — protect() already fetches the full
    // user document above (near-zero added cost: one extra field read on a
    // query already being made), so this closes the gap where a suspended
    // user's still-valid JWT kept working on every route until it expired.
    // Applied here (not just via the separately-opted-in requireActive
    // middleware) so EVERY protect()-gated route is covered uniformly,
    // rather than relying on each route file to remember to add it — that
    // per-route opt-in is exactly how chatbotRoutes/recommendationRoutes/
    // authRoutes ended up without it. Scoped to 'suspended' only (not
    // 'pending') — requireActive still owns the pending-approval message on
    // the routes that use it.
    if (req.user.status === 'suspended') {
      res.status(403);
      throw new Error(SUSPENDED_MESSAGE);
    }

    next();
  } catch (error) {
    if (res.statusCode === 403) throw error; // already-classified suspension — don't relabel as a token error
    res.status(401);
    throw new Error('Not authorized — token invalid or expired');
  }
});

// ── Role guard factory — restrict to specific roles ───────
// Usage: authorizeRoles('admin'), authorizeRoles('seller', 'admin')
// Multi-role aware: passes if the user HAS any of the allowed roles.
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    const userRoles = req.user.roles && req.user.roles.length
      ? req.user.roles
      : [req.user.role];

    const allowed = roles.some((r) => userRoles.includes(r));

    if (!allowed) {
      res.status(403);
      throw new Error(
        `Access denied — you don't have permission for this route`
      );
    }
    next();
  };
};

// ── Status guard — reject pending/suspended accounts ─────
// Note: on any route that also uses protect() (all of them today), the
// 'suspended' branch here is now unreachable — protect() itself rejects a
// suspended user before requireActive ever runs. Left as-is (harmless,
// still correct in isolation) rather than trimmed, to keep this change
// scoped to closing the gap, not refactoring working code.
const requireActive = (req, res, next) => {
  if (req.user.status !== 'active') {
    res.status(403);
    throw new Error(
      req.user.status === 'pending'
        ? 'Your account is pending admin approval. You will be notified by email once approved.'
        : SUSPENDED_MESSAGE
    );
  }
  next();
};

module.exports = { protect, authorizeRoles, requireActive, SUSPENDED_MESSAGE };
