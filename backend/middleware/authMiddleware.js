const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');

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

    next();
  } catch (error) {
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
const requireActive = (req, res, next) => {
  if (req.user.status !== 'active') {
    res.status(403);
    throw new Error(
      req.user.status === 'pending'
        ? 'Your account is pending admin approval. You will be notified by email once approved.'
        : 'Your account has been suspended. Please contact support.'
    );
  }
  next();
};

module.exports = { protect, authorizeRoles, requireActive };
