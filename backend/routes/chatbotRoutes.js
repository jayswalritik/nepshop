/**
 * Chatbot Routes  (backend/routes/chatbotRoutes.js)
 * Registered in server.js as: app.use('/api/chatbot', require('./routes/chatbotRoutes'));
 */

const express         = require('express');
const { sendMessage } = require('../controllers/chatbotController');
const { protect }     = require('../middleware/authMiddleware');

const router = express.Router();

// Any logged-in role — the service is role-aware (feature 8 builds on this).
router.use(protect);

router.post('/message', sendMessage);

module.exports = router;