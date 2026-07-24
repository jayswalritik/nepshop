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
const Return = require('../../models/Return');
// Per-package (Shipment) data is attached via the shared fetch helper — the
// SAME one getMyOrders/getOrderById use — so the chatbot reads shipments
// through one implementation, never its own Shipment.find/populate.
const { attachShipments } = require('../../utils/orderFetch');
// Return-window TIME helpers (shared, round-DOWN) + the window length. The
// per-package "Returnable — N min left" label is built HERE on the backend so
// the widget never formats or computes time.
const { computeWindow, formatRemaining } = require('../../utils/returnWindow');
const { RETURN_WINDOW_MINUTES } = require('../../config/settlementConfig');

// Statuses that mean "this order is still in motion". Item-level returns
// never write 'return_assigned'/'return_in_transit' at the order level
// anymore (see returnController.js) — an in-progress return is tracked via
// Return.status per shipment, surfaced separately by returnActions.js.
const ACTIVE_STATUSES = ['pending', 'confirmed', 'packed', 'dispatched'];

// Return.status buckets, mirrored EXACTLY from OrdersPage.jsx / returnActions.js
// so the chatbot never invents its own set:
//   OPEN      → return in progress (units reserved, not yet resolved)
//   SUCCEEDED → 'refunded': the only terminal success (units left the customer,
//               refund processed — Return.js "refunded → …, money reversed, complete")
// 'rejected' is terminal FAILURE (admin declined; units never left / came back)
// and belongs to NEITHER bucket.
const OPEN_RETURN_STATUSES      = ['pending', 'approved', 'picked_up'];
const SUCCEEDED_RETURN_STATUSES = ['refunded'];

// One Return query for a whole batch of orders, grouped in memory onto each
// shipment as `s.returns` (NOT per package — no N+1). Shipments are converted to
// plain objects so a non-schema `returns` field actually sticks (Mongoose docs
// drop unknown paths in strict mode). Pure counting then happens in toChatPackage.
const attachReturns = async (orders) => {
  const list = orders || [];
  const shipmentIds = [];
  for (const o of list) for (const s of (o.shipments || [])) if (s?._id) shipmentIds.push(s._id);
  if (!shipmentIds.length) return list;

  const returns = await Return.find({ shipment: { $in: shipmentIds } })
    .select('shipment status items')
    .lean();

  const byShipment = new Map();
  for (const r of returns) {
    const key = r.shipment.toString();
    if (!byShipment.has(key)) byShipment.set(key, []);
    byShipment.get(key).push(r);
  }

  for (const o of list) {
    o.shipments = (o.shipments || []).map((s) => {
      const plain = s && typeof s.toObject === 'function' ? s.toObject() : s;
      plain.returns = byShipment.get(String(plain._id)) || [];
      return plain;
    });
  }
  return list;
};

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
  return attachReturns(await attachShipments(orders));
};

const getRecentOrders = async (userId, limit = 5) => {
  const orders = await Order.find({ customer: userId })
    .select(ORDER_SELECT)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('deliveryAgent', 'firstName lastName phone')
    .lean();
  return attachReturns(await attachShipments(orders));
};

// ── Lean PACKAGE (shipment) card — one per seller-package ─────────────────────
// Every field is read STRAIGHT off the shipment document — no money arithmetic.
// sellerName fallback mirrors OrdersPage.jsx (shopName -> "first last"), with a
// final 'Seller' guard so a nameless seller never renders blank.
const toChatPackage = (s, i) => {
  const firstItem = s.items?.[0];
  const extra     = (s.items?.length || 0) - 1;

  // Returnability tag — only a DELIVERED package with a real deliveredAt whose
  // window hasn't closed is returnable. Time is computed + formatted here (never
  // in the widget); returnWindowLabel is null whenever the tag shouldn't show.
  const { expired, minutesLeft } = computeWindow(s.deliveredAt, RETURN_WINDOW_MINUTES);
  const returnable = s.status === 'delivered' && !!s.deliveredAt && !expired;

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
    // Ready-to-print returnability tag (backend-built, no widget-side time math).
    returnMinutesLeft: returnable ? minutesLeft : 0,
    returnWindowLabel: returnable ? `Returnable — ${formatRemaining(minutesLeft)} left` : null,
    // Return unit counts, split by lifecycle so an in-progress return can be
    // told apart from a finished one (Shipment.status can't — a partial return
    // stays 'delivered' throughout). Both sum `quantity` over this shipment's
    // Return docs (attached as s.returns); a stored COUNT, never money.
    //   itemsInReturn — units still IN PROGRESS (OPEN_RETURN_STATUSES)
    //   itemsReturned — units whose return COMPLETED successfully ('refunded')
    // Rejected returns match neither set, so they fall out of both.
    itemsInReturn: returnUnits(s, OPEN_RETURN_STATUSES),
    itemsReturned: returnUnits(s, SUCCEEDED_RETURN_STATUSES),
  };
};

// Sum of returned `quantity` across a shipment's Return docs whose status is in
// `statusSet`. Absent items/quantity count as 0; returns 0 when s.returns is
// missing. Pure — the query/attach happens in attachReturns.
const returnUnits = (s, statusSet) =>
  (Array.isArray(s.returns) ? s.returns : [])
    .filter((r) => statusSet.includes(r.status))
    .reduce((n, r) => n + (r.items || []).reduce((m, it) => m + (it.quantity || 0), 0), 0);

// ── Lean order card for the chat UI + conversation memory ────────────────────
// Keeps every top-level field it always had (nothing reading them breaks) and
// ADDS per-package truth: `packages` (one entry per shipment) and a
// `returnMinutesLeft` slot the service fills from returnActions (never here).
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
    returnMinutesLeft: null, // filled by the service (min across packages) when one is still returnable
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
  // Short-id reference ("#1C5159" / "1c5159"). Ordinals above keep priority.
  // Matched ONLY against the shortIds already in lastOrders — NO db lookup, since
  // shortId is a non-unique 6-hex slice of the ObjectId. If two shown orders
  // share the id we CANNOT disambiguate → return null (caller's not-found path
  // handles it), never a silent first-match pick.
  const idMatch = lower.match(/#?\b([0-9a-f]{6})\b/i);
  if (idMatch) {
    const id   = idMatch[1].toUpperCase();
    const hits = lastOrders.filter((o) => (o.shortId || '').toUpperCase() === id);
    if (hits.length === 1) return hits[0];
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