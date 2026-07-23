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
// Per-package (Shipment) data is attached via the shared fetch helper — the
// SAME one getMyOrders/getOrderById use — so the chatbot reads shipments
// through one implementation, never its own Shipment.find/populate.
const { attachShipments } = require('../../utils/orderFetch');

// Statuses that mean "this order is still in motion". Item-level returns
// never write 'return_assigned'/'return_in_transit' at the order level
// anymore (see returnController.js) — an in-progress return is tracked via
// Return.status per shipment, surfaced separately by returnActions.js.
const ACTIVE_STATUSES = ['pending', 'confirmed', 'packed', 'dispatched'];

const ORDER_SELECT =
  'items status total subtotal paymentMethod deliveryAgent settlement ' +
  'createdAt confirmedAt packedAt dispatchedAt deliveredAt cancelledAt';

// ACTIVE_STATUSES is still correct after the shipment migration: order.status
// is DERIVED by orderAggregate.deriveOrderStatus as the LEAST-ADVANCED active
// package, and it only lands on 'delivered'/'cancelled'/'returned' when NO
// package is still moving (every package delivered / all terminal). So an order
// with any moving package keeps a status in this set — see the analysis in the
// task report. Each order gains its shipments via attachShipments so toChatOrder
// can expose per-package truth.
const getActiveOrders = async (userId) => {
  const orders = await Order.find({ customer: userId, status: { $in: ACTIVE_STATUSES } })
    .select(ORDER_SELECT)
    .sort({ createdAt: -1 })
    .populate('deliveryAgent', 'firstName lastName phone')
    .lean();
  return attachShipments(orders);
};

const getRecentOrders = async (userId, limit = 5) => {
  const orders = await Order.find({ customer: userId })
    .select(ORDER_SELECT)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('deliveryAgent', 'firstName lastName phone')
    .lean();
  return attachShipments(orders);
};

// ── Lean PACKAGE (shipment) card — one per seller-package ─────────────────────
// Every field is read STRAIGHT off the shipment document — no money arithmetic.
// sellerName fallback mirrors OrdersPage.jsx (shopName -> "first last"), with a
// final 'Seller' guard so a nameless seller never renders blank.
const toChatPackage = (s, i) => {
  const firstItem = s.items?.[0];
  const extra     = (s.items?.length || 0) - 1;

  return {
    index:       i + 1,
    sellerName:  s.seller?.shopName
      || `${s.seller?.firstName || ''} ${s.seller?.lastName || ''}`.trim()
      || 'Seller',
    status:      s.status,
    itemCount:   s.items?.length || 0,
    itemSummary: firstItem
      ? `${firstItem.name}${extra > 0 ? ` + ${extra} more` : ''}`
      : 'Package',
    deliveredAt: s.deliveredAt,
    agentName:   s.deliveryAgent
      ? `${s.deliveryAgent.firstName} ${s.deliveryAgent.lastName}`
      : null,
    // Money — read directly off the shipment, never computed here.
    sellerSubtotal:   s.sellerSubtotal,
    deliveryCharge:   s.deliveryCharge,
    couponAllocation: s.couponAllocation || 0,
    // Refund — cumulative per-shipment figure written by BOTH cancel
    // (shipmentCancellation.js) and return (returnController.js) flows.
    refund:      s.settlement?.refundToCustomer || 0,
  };
};

// ── Lean order card for the chat UI + conversation memory ────────────────────
// Keeps every top-level field it always had (nothing reading them breaks) and
// ADDS per-package truth: `packages` (one entry per shipment) and a
// `returnDaysLeft` slot the service fills from returnActions (never here).
const toChatOrder = (o) => {
  const firstItem = o.items?.[0];
  const extra     = (o.items?.length || 0) - 1;
  const shipments = Array.isArray(o.shipments) ? o.shipments : [];
  const packages  = shipments.map(toChatPackage);

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
    // Refund is shipment-level. Single-package → read that sole shipment's
    // cumulative refund directly. Multi-package → the per-package figures live
    // on packages[].refund (each sourced from its shipment); a SINGLE order-
    // level number would require SUMMING them, which the money guard forbids —
    // so it is `null` here (there is no correct order-level figure). Consumers
    // guard on `refund > 0`, and `null > 0` is false, so this is display-safe;
    // multi-package replies render per-package refunds instead. Genuine
    // no-shipments (degraded) → the old order-level field, which stays 0.
    refund: packages.length === 1
      ? (shipments[0].settlement?.refundToCustomer || 0)
      : packages.length > 1
        ? null
        : (o.settlement?.refundToCustomer || 0),
    packages,
    returnDaysLeft: null, // filled by the service (TASK 4) when a package is still returnable
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