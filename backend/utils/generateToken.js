const jwt = require('jsonwebtoken');

/**
 * Generate a signed JWT for a user
 * Payload includes id and role so middleware can check both
 */
const generateToken = (userId, role) => {
  return jwt.sign(
    { id: userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

module.exports = { generateToken };
