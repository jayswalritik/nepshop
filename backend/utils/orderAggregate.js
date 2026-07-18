// Order-level fields are DERIVED from the order's shipments. This module is
// the only place that recomputes them, so every mutation path (seller status
// update, delivery markDelivered, customer cancel, admin override) stays
// consistent with the same rules.

const Order    = require('../models/Order');
const Shipment = require('../models/Shipment');
const { round2 } = require('./orderPricing');

const ACTIVE_STATUS_ORDER = ['pending', 'confirmed', 'packed', 'dispatched', 'delivered', 'cancelled'];
// Terminal, non-"active" shipment states — excluded from the least-advanced
// rule the same way 'cancelled' always was. 'returned' only happens on a
// shipment once a FULL-shipment return completes (see returnController);
// partial returns never touch shipment.status (it stays 'delivered').
const TERMINAL_STATUSES = ['cancelled', 'returned'];

// Least-advanced-active-shipment rule (terminal shipments excluded, unless ALL are terminal).
const deriveOrderStatus = (shipmentStatuses) => {
  if (shipmentStatuses.every(s => s === 'delivered')) return 'delivered';
  if (shipmentStatuses.every(s => s === 'cancelled')) return 'cancelled';
  if (shipmentStatuses.every(s => TERMINAL_STATUSES.includes(s))) return 'returned';

  const active = shipmentStatuses.filter(s => !TERMINAL_STATUSES.includes(s));
  if (active.length === 0) return 'cancelled'; // unreachable given the checks above; safety fallback

  active.sort((a, b) => ACTIVE_STATUS_ORDER.indexOf(a) - ACTIVE_STATUS_ORDER.indexOf(b));
  return active[0];
};

// Recomputes order.subtotal/deliveryCharge/commissionAmount/total/status (+ timestamps)
// from its shipments, and saves the order. Call after any shipment mutation.
const recomputeOrder = async (orderId) => {
  const order = await Order.findById(orderId);
  if (!order) return null;

  const shipments = await Shipment.find({ order: orderId });
  if (!shipments.length) return order;

  order.subtotal         = round2(shipments.reduce((s, x) => s + x.sellerSubtotal, 0));
  order.deliveryCharge   = round2(shipments.reduce((s, x) => s + x.deliveryCharge, 0));
  order.commissionAmount = round2(shipments.reduce((s, x) => s + x.commissionAmount, 0));
  order.total            = round2(order.subtotal + order.deliveryCharge - (order.couponDiscount || 0));

  // Item-level returns never write order.status directly (see returnController) —
  // shipment.status is the only thing a return ever mutates ('returned', and
  // only for a FULL-shipment return), so derivation always applies here.
  const newStatus = deriveOrderStatus(shipments.map(s => s.status));
  if (newStatus !== order.status) {
    order.status = newStatus;
    const now = new Date();
    if (newStatus === 'confirmed')  order.confirmedAt  = now;
    if (newStatus === 'packed')     order.packedAt     = now;
    if (newStatus === 'dispatched') order.dispatchedAt = now;
    if (newStatus === 'delivered') {
      order.deliveredAt = now;
      // COD has no gateway callback to flip paymentStatus — cash is
      // collected as part of delivery itself, so "every shipment delivered"
      // IS the payment event. Khalti/eSewa orders are already 'paid' well
      // before delivery (set at checkout — paymentController.js), so this
      // never fires for them. Without this, a fully-returned COD order's
      // paymentStatus would stay 'pending' forever instead of flipping to
      // 'refunded' (see the paymentStatus === 'paid' guard below and in
      // returnController.completeReturn) even though the shipment-level
      // refund is computed and paid out correctly regardless.
      if (order.paymentMethod === 'cash_on_delivery' && order.paymentStatus === 'pending') {
        order.paymentStatus = 'paid';
      }
    }
    if (newStatus === 'cancelled')  order.cancelledAt  = now;
  }

  // Single-seller orders (the overwhelming majority) mirror their one shipment's
  // agent/pickup address exactly, so order-level display stays byte-for-byte
  // identical to today. Multi-seller orders have no single agent/address to show
  // at the order level — that ambiguity is the bug this fix removes.
  if (shipments.length === 1) {
    order.deliveryAgent = shipments[0].deliveryAgent || null;
    if (shipments[0].pickupAddress?.street) {
      order.pickupAddress = shipments[0].pickupAddress;
    }
  }

  await order.save();
  return order;
};

// Voucher-aware amount the customer owes for ONE package (shipment) — the
// single source of truth for this formula. Reused by buildShipmentEmailView
// below and by deliveryController.getDeliveryOrders; shipmentCancellation.js
// computes the same formula inline for its refund math (verified to agree,
// not yet switched to call this — out of scope for this change).
const computeCustomerPayable = (shipment) =>
  round2(shipment.sellerSubtotal + shipment.deliveryCharge - (shipment.couponAllocation || 0));

// Builds an order-shaped view scoped to one shipment, for seller/agent-facing
// emails that expect order.items/subtotal/commissionAmount/total etc.
const buildShipmentEmailView = (order, shipment) => ({
  _id:              order._id,
  items:            shipment.items,
  subtotal:         shipment.sellerSubtotal,
  deliveryCharge:   shipment.deliveryCharge,
  commissionRate:   shipment.commissionRate,
  commissionAmount: shipment.commissionAmount,
  total:            round2(shipment.sellerSubtotal + shipment.deliveryCharge),
  // What the CUSTOMER actually owes for this one package (voucher-aware) —
  // distinct from `total` above, which is gross package value used by
  // seller-facing "Order Value"/"Your Earnings" lines. Only this field is
  // safe to show as a COD collection amount (see sendDeliveryAssignedEmail).
  customerPayable:  computeCustomerPayable(shipment),
  // What the SELLER actually earns on this shipment — sellerSubtotal minus
  // commission, NEVER including deliveryCharge (that pays the agent/margin,
  // matches settlement.sellerShare exactly — see deliveryController.markDelivered).
  sellerEarnings:   round2(shipment.sellerSubtotal - shipment.commissionAmount),
  deliveryEarning:  shipment.deliveryEarning,
  paymentMethod:    order.paymentMethod,
  paymentStatus:    order.paymentStatus,
  customer:         order.customer,
  deliveryAddress:  order.deliveryAddress,
  customerNote:     order.customerNote,
  createdAt:        order.createdAt,
  deliveryAgent:    shipment.deliveryAgent,
  pickupAddress:    shipment.pickupAddress,
  status:           shipment.status,
});

module.exports = {
  deriveOrderStatus,
  recomputeOrder,
  buildShipmentEmailView,
  computeCustomerPayable,
  ACTIVE_STATUS_ORDER,
  TERMINAL_STATUSES,
};
