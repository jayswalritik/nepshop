/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Chatbot Order Actions  (backend/services/chatbot/orderActions.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Layer 2 grounding for order intents. Reads the customer's REAL Order
 * documents — the same collection the OrdersPage and settlement engine use.
 * Nothing here is chatbot-specific data; the chatbot is just a new reader.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const Order = require('../../models/Order');

// Statuses that mean "this order is still in motion". Item-level returns
// never write 'return_assigned'/'return_in_transit' at the order level
// anymore (see returnController.js) — an in-progress return is tracked via
// Return.status per shipment, surfaced separately by returnActions.js.
const ACTIVE_STATUSES = ['pending', 'confirmed', 'packed', 'dispatched'];

const ORDER_SELECT =
  'items status total subtotal paymentMethod deliveryAgent settlement ' +
  'createdAt confirmedAt packedAt dispatchedAt deliveredAt cancelledAt';

const getActiveOrders = (userId) =>
  Order.find({ customer: userId, status: { $in: ACTIVE_STATUSES } })
    .select(ORDER_SELECT)
    .sort({ createdAt: -1 })
    .populate('deliveryAgent', 'firstName lastName phone')
    .lean();

const getRecentOrders = (userId, limit = 5) =>
  Order.find({ customer: userId })
    .select(ORDER_SELECT)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('deliveryAgent', 'firstName lastName phone')
    .lean();

// ── Lean order card for the chat UI + conversation memory ────────────────────
const toChatOrder = (o) => {
  const firstItem = o.items?.[0];
  const extra     = (o.items?.length || 0) - 1;

  return {
    _id:         o._id,
    shortId:     o._id.toString().slice(-6).toUpperCase(),
    status:      o.status,
    total:       o.total,
    itemCount:   o.items?.length || 0,
    itemSummary: firstItem
      ? `${firstItem.name}${extra > 0 ? ` + ${extra} more` : ''}`
      : 'Order',
    image:       firstItem?.image || null,
    placedAt:    o.createdAt,
    deliveredAt: o.deliveredAt,
    agentName:   o.deliveryAgent
      ? `${o.deliveryAgent.firstName} ${o.deliveryAgent.lastName}`
      : null,
    refund:      o.settlement?.refundToCustomer || 0,
  };
};

// ── Ordinal resolution against the shown order list ──────────────────────────
const ORDER_ORDINALS = {
  first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2,
  fourth: 3, '4th': 3, fifth: 4, '5th': 4,
};

const resolveOrderTarget = (msg, lastOrders) => {
  const lower = msg.toLowerCase();
  for (const [word, idx] of Object.entries(ORDER_ORDINALS)) {
    if (new RegExp(`\\b${word}\\b`).test(lower) && idx < lastOrders.length) {
      return lastOrders[idx];
    }
  }
  if (/\blast\b/.test(lower) && lastOrders.length) {
    return lastOrders[lastOrders.length - 1];
  }
  return null;
};

module.exports = { 
  getActiveOrders, 
  getRecentOrders, 
  toChatOrder, 
  ACTIVE_STATUSES, 
  resolveOrderTarget 
};