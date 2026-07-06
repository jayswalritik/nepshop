/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Chatbot Return Actions  (backend/services/chatbot/returnActions.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Layer 2 grounding for return/refund assistance. Checks THIS customer's real
 * orders against the REAL rules from returnController:
 *   • only delivered orders  • within RETURN_WINDOW_MINUTES of deliveredAt
 *   • one return per order   • refund depends on fault (admin decides)
 *
 * The window constant is imported from returnController — single source of
 * truth, so testing/production mode changes propagate here automatically.
 *
 * The chatbot EXPLAINS eligibility and hands off to the returns UI to submit
 * (option a) — it does not create Return documents itself.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const Order  = require('../../models/Order');
const Return = require('../../models/Return');
// Single source of truth for the window (exported by returnController).
// If the export is missing, fall back to production 7 days — LOUDLY, so a
// broken import can never silently produce NaN eligibility again.
let { RETURN_WINDOW_MINUTES } = require('../../controllers/returnController');
if (typeof RETURN_WINDOW_MINUTES !== 'number') {
  console.warn('⚠️ RETURN_WINDOW_MINUTES not exported from returnController — falling back to 7 days');
  RETURN_WINDOW_MINUTES = 7 * 24 * 60;
}

const IN_PROGRESS_RETURN_STATUSES = ['return_assigned', 'return_in_transit', 'returned'];

// Words in a return message that are never product keywords
const RETURN_STOPWORDS = new Set([
  'i', 'want', 'to', 'return', 'refund', 'my', 'the', 'a', 'an', 'can',
  'how', 'do', 'get', 'money', 'back', 'exchange', 'please', 'order',
  'item', 'product', 'bought', 'purchased', 'this', 'that', 'it', 'for',
]);

// ─────────────────────────────────────────────────────────────────────────────
// getReturnFacts(userId, query)
// Returns everything the templates need — pure facts, no phrasing.
// ─────────────────────────────────────────────────────────────────────────────
const getReturnFacts = async (userId, query = '') => {
  const [delivered, inProgress, existingReturns] = await Promise.all([
    Order.find({ customer: userId, status: 'delivered' })
      .select('items status total subtotal deliveredAt createdAt settlement')
      .sort({ deliveredAt: -1 })
      .lean(),
    Order.find({ customer: userId, status: { $in: IN_PROGRESS_RETURN_STATUSES } })
      .select('items status total subtotal deliveredAt createdAt settlement')
      .sort({ updatedAt: -1 })
      .lean(),
    Return.find({ customer: userId }).select('order status').lean(),
  ]);

  const returnedOrderIds = new Set(existingReturns.map((r) => r.order.toString()));
  const now = Date.now();

  // Annotate each delivered order with real eligibility
  const annotated = delivered.map((o) => {
    const expiry     = new Date(o.deliveredAt).getTime() + RETURN_WINDOW_MINUTES * 60 * 1000;
    const hasReturn  = returnedOrderIds.has(o._id.toString());
    const expired    = now > expiry;
    return {
      order:       o,
      hasReturn,                                  // already requested (pending review)
      expired,
      eligible:    !hasReturn && !expired,
      daysLeft:    Math.max(0, Math.ceil((expiry - now) / (24 * 60 * 60 * 1000))),
      expiredOn:   new Date(expiry),
      // Real refund math (mirrors admin preview): admin decides fault later
      sellerFaultRefund:   o.total,
      customerFaultRefund: Math.max(0, (o.subtotal || 0) - 100), // minus both Rs 50 legs
    };
  });

  // Keyword match: "return my airpods" → orders containing "airpods"
  const keywords = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w && !RETURN_STOPWORDS.has(w));

  const matched = keywords.length
    ? annotated.filter((a) => {
        // Match by item name…
        const nameHit = a.order.items?.some((item) =>
          keywords.some((k) => item.name.toLowerCase().includes(k))
        );
        // …or by order ID: OrdersPage shows the last 8 chars, chat shows the
        // last 6 — endsWith handles both. Min 4 chars so short words like
        // "2024" can't accidentally match an ID.
        const idStr = a.order._id.toString().toLowerCase();
        const idHit = keywords.some((k) => k.length >= 4 && idStr.endsWith(k));
        return nameHit || idHit;
      })
    : [];

  return {
    annotated,                                    // all delivered orders, annotated
    matched,                                      // subset matching the query keywords
    eligible:   annotated.filter((a) => a.eligible),
    inProgress,                                   // returns currently in the pipeline
    everDelivered: delivered.length > 0,
  };
};

module.exports = { getReturnFacts };