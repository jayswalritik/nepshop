// ─────────────────────────────────────────────────────────────────────────────
// orderFetch.js — the order→shipment fetch-and-attach, extracted VERBATIM from
// orderController.getMyOrders / getOrderById so both handlers (and any service)
// share ONE implementation and the SAME populate selects.
// ─────────────────────────────────────────────────────────────────────────────
// No req / res / Express. Logic moved, not rewritten.
// ─────────────────────────────────────────────────────────────────────────────

const Shipment = require('../models/Shipment');

// The exact populate selects both handlers already used.
const SELLER_SELECT = 'firstName lastName shopName';
const AGENT_SELECT  = 'firstName lastName phone';

// attachShipments(orders): array of order docs OR lean/plain objects ->
// the same array, each element a PLAIN object with a `shipments` array
// attached (per-package status/tracking). Tolerant of both Mongoose documents
// (calls .toObject(), as getMyOrders did) and plain objects. Never mutates its
// input — every element is a fresh spread object.
const attachShipments = async (orders) => {
  const list = orders || [];
  const orderIds = list.map((o) => o._id);

  const shipments = await Shipment.find({ order: { $in: orderIds } })
    .populate('seller', SELLER_SELECT)
    .populate('deliveryAgent', AGENT_SELECT);

  const byOrder = {};
  for (const s of shipments) {
    const key = s.order.toString();
    if (!byOrder[key]) byOrder[key] = [];
    byOrder[key].push(s);
  }

  return list.map((o) => {
    const base = o && typeof o.toObject === 'function' ? o.toObject() : o;
    return { ...base, shipments: byOrder[o._id.toString()] || [] };
  });
};

// fetchShipmentsForOrder(orderId): the single-order case (getOrderById) —
// returns the shipments query (await it) with the SAME selects. Left as a
// query, not awaited, so callers keep the identical `await ...` shape.
const fetchShipmentsForOrder = (orderId) =>
  Shipment.find({ order: orderId })
    .populate('seller', SELLER_SELECT)
    .populate('deliveryAgent', AGENT_SELECT);

module.exports = { attachShipments, fetchShipmentsForOrder };
