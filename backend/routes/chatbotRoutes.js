/**
 * Chatbot Routes  (backend/routes/chatbotRoutes.js)
 * Registered in server.js as: app.use('/api/chatbot', require('./routes/chatbotRoutes'));
 */

const express          = require('express');
const { sendMessage }  = require('../controllers/chatbotController');
const { protect }      = require('../middleware/authMiddleware');
const chatbotRateLimit = require('../middleware/chatbotRateLimit');

const router = express.Router();

// Any logged-in role — the service is role-aware (feature 8 builds on this).
router.use(protect);

// Per-user rate limit — runs AFTER protect (needs req.user._id), scoped to
// this route only.
router.post('/message', chatbotRateLimit, sendMessage);

module.exports = router;