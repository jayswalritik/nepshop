/**
 * Chatbot Cart Actions  (backend/services/chatbot/cartActions.js)
 * Grounding for the view-cart intent. Delegates ALL cart shaping + money to the
 * shared buildCartSummary (backend/utils/cartSummary.js) — the SAME builder the
 * /cart/summary endpoint uses — asking for the excluded groups too so the reply
 * can show ticked / not-ticked / stale items. No money arithmetic lives here.
 */

const { buildCartSummary } = require('../../utils/cartSummary');

// Returns the full cart summary INCLUDING the chatbot-only excluded groups
// (notSelectedItems, staleItems). Every money figure comes from buildCartSummary;
// nothing is summed or multiplied here. No coupon is previewed in a plain
// "what's in my cart" view — coupons are applied at checkout.
const getCartContents = (userId) =>
  buildCartSummary({ userId, includeExcluded: true });

module.exports = { getCartContents };
