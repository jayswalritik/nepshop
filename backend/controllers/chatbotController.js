/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Chatbot Controller  (backend/controllers/chatbotController.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Routes (all under /api/chatbot):
 *   POST /message  → { message, context, mode } → { intent, reply, products,
 *                                                   suggestions, context }
 *   mode: 'fast' (rule routing, default) | 'conversational' (LLM routing)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const asyncHandler      = require('express-async-handler');
const { handleMessage } = require('../services/chatbot/chatbotService');

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Handle one chat message
// @route   POST /api/chatbot/message
// @access  Logged-in users (any role)
// ─────────────────────────────────────────────────────────────────────────────
const sendMessage = asyncHandler(async (req, res) => {
  const { message, context, mode } = req.body;

  if (!message || !message.trim()) {
    res.status(400);
    throw new Error('Message is required');
  }

  // Cap message length — chat input, not an essay.
  const trimmed = message.trim().slice(0, 500);

  const result = await handleMessage(
    req.user,
    trimmed,
    context || {},
    mode === 'conversational' ? 'conversational' : 'fast'
  );

  res.json({ success: true, ...result });
});

module.exports = { sendMessage };