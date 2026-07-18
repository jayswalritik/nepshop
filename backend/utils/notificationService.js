const mongoose = require('mongoose');
const Notification = require('../models/Notification');

// ── Expo push (plain HTTPS, Node's built-in fetch — no expo-server-sdk) ───
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// No retry, no token cleanup in v1 — log only, mirrors sendEmail's
// log-and-continue posture (emailService.js:265+).
const sendPush = async (token, title, body, data) => {
  try {
    const res  = await fetch(EXPO_PUSH_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body:    JSON.stringify({ to: token, title, body, data }),
    });
    const json   = await res.json().catch(() => null);
    const ticket = json?.data;
    if (ticket?.status === 'error' || ticket?.details?.error === 'DeviceNotRegistered') {
      console.warn(`⚠️ Push not delivered → ${token} | ${ticket?.message || 'unknown error'}`);
    } else {
      console.log(`✅ Push sent → ${token} | ${title}`);
    }
  } catch (err) {
    console.error(`❌ Push failed → ${token} | ${err.message}`);
  }
};

// NOT `u && typeof u === 'object' && u._id !== undefined` — a bare
// mongoose.Types.ObjectId is also `typeof === 'object'` AND has a legacy
// `._id` getter that returns itself, so that heuristic misclassifies a raw
// id as a loaded doc. `instanceof mongoose.Document` is the real test.
const isDoc = (u) => u instanceof mongoose.Document;

// ── Core chokepoint: writes the Notification doc, fires push if requested.
// Accepts a loaded user doc OR a bare id for `user` — if a doc is passed
// (has expoPushToken already on it, since User.findById() has no default
// projection excluding it), never re-queries. Only re-queries for a bare id
// when push is actually requested. Never throws — log-and-continue, same
// posture as sendEmail (emailService.js:265+); all callers fire-and-forget.
const notifyUser = async ({ user, type, title, body, data = {}, push = false }) => {
  try {
    const userId = isDoc(user) ? user._id : user;
    if (!userId) return;

    await Notification.create({ user: userId, type, title, body, data });

    if (push) {
      let token = isDoc(user) ? user.expoPushToken : null;
      if (!isDoc(user)) {
        const User = require('../models/User');
        const doc  = await User.findById(userId).select('expoPushToken');
        token = doc?.expoPushToken || null;
      }
      if (token) await sendPush(token, title, body, data);
    }
  } catch (err) {
    console.error(`❌ Notification failed → user ${isDoc(user) ? user._id : user} | ${err.message}`);
  }
};

// ── Helpers (presentation only — no money arithmetic) ─────────────────────
const shortId = (id) => id.toString().slice(-8).toUpperCase();
const fmt     = (amount) => Number(amount).toLocaleString('en-NP');

// ═════════════════════════════════════════════════════════
// CUSTOMER
// ═════════════════════════════════════════════════════════

// Mirrors sendOrderPlacedEmail(user, order)
const notifyOrderPlaced = (customer, order) => notifyUser({
  user: customer,
  type: 'ORDER_PLACED',
  push: false,
  title: 'Order placed',
  body:  `Your order #${shortId(order._id)} (Rs ${fmt(order.total)}) has been placed.`,
  data:  { orderId: order._id },
});

const ORDER_STATUS_COPY = {
  confirmed:  { title: 'Order confirmed',  body: (id) => `Your order #${id} has been confirmed by the seller.` },
  packed:     { title: 'Order packed',     body: (id) => `Your order #${id} has been packed and is ready for dispatch.` },
  dispatched: { title: 'Order on the way', body: (id) => `Your order #${id} is out for delivery.` },
  delivered:  { title: 'Order delivered',  body: (id) => `Your order #${id} has been delivered. Enjoy your purchase!` },
  cancelled:  { title: 'Order cancelled',  body: (id) => `Your order #${id} has been cancelled.` },
};

// Mirrors sendOrderStatusEmail(user, order, status) — silently no-ops for a
// status outside the known set, same as sendOrderStatusEmail's own
// `if (!c) return;` guard (emailService.js:504-505).
const notifyOrderStatus = (customer, order, status) => {
  const copy = ORDER_STATUS_COPY[status];
  if (!copy) return;
  const id = shortId(order._id);
  return notifyUser({
    user: customer,
    type: 'ORDER_STATUS',
    push: status === 'delivered' || status === 'confirmed',
    title: copy.title,
    body:  copy.body(id),
    data:  { orderId: order._id, status },
  });
};

// Mirrors sendReturnApprovedEmail / sendReturnRejectedEmail(user, returnRequest, order)
// decision: 'approved' | 'rejected'
const notifyReturnDecision = (customer, returnRequest, order, decision) => {
  const id = shortId(order._id);
  return notifyUser({
    user: customer,
    type: 'RETURN_DECISION',
    push: true,
    title: decision === 'approved' ? 'Return approved' : 'Return declined',
    body:  decision === 'approved'
      ? `Your return for order #${id} was approved. Refund of Rs ${fmt(returnRequest.refundAmount)} is on the way.`
      : `Your return for order #${id} was declined.`,
    data: { returnId: returnRequest._id, orderId: order._id, decision },
  });
};

// Mirrors sendCancelRefundToCustomer(customer, order) and
// sendRefundProcessedToCustomer(customer, order, refundAmount, fault) —
// `amount` is always the same value the adjacent email call already used
// (order.total for a cancellation refund, reversal.refundToCustomer for a
// return refund), never computed here.
const notifyRefundIssued = (customer, order, amount) => notifyUser({
  user: customer,
  type: 'REFUND_ISSUED',
  push: true,
  title: 'Refund processed',
  body:  `Rs ${fmt(amount)} has been refunded for order #${shortId(order._id)}.`,
  data:  { orderId: order._id, amount },
});

// ═════════════════════════════════════════════════════════
// SELLER
// ═════════════════════════════════════════════════════════

// Mirrors sendNewOrderToSeller(seller, order) — `order` here is always a
// buildShipmentEmailView(...) result, which already carries sellerEarnings.
const notifyNewOrderForSeller = (seller, order) => notifyUser({
  user: seller,
  type: 'SELLER_NEW_ORDER',
  push: false,
  title: 'New order received',
  body:  `New order #${shortId(order._id)} — your earnings: Rs ${fmt(order.sellerEarnings)}.`,
  data:  { orderId: order._id },
});

// Mirrors sendReturnRequestToSeller(seller, returnRequest, order)
const notifyReturnRequestForSeller = (seller, returnRequest, order) => notifyUser({
  user: seller,
  type: 'SELLER_RETURN_REQUEST',
  push: false,
  title: 'Return request filed',
  body:  `A customer requested a return for order #${shortId(order._id)}: ${returnRequest.reason}.`,
  data:  { returnId: returnRequest._id, orderId: order._id },
});

// Mirrors sendSettlementReleasedEmail(seller, order) — `order` here is
// always a buildShipmentEmailView(...) result (sellerEarnings included).
const notifyEarningsReleased = (seller, order) => notifyUser({
  user: seller,
  type: 'EARNINGS_RELEASED',
  push: false,
  title: 'Earnings released',
  body:  `Rs ${fmt(order.sellerEarnings)} from order #${shortId(order._id)} is now available for payout.`,
  data:  { orderId: order._id, amount: order.sellerEarnings },
});

// Mirrors sendPayoutProcessedEmail(recipient, amount, method) — seller or agent.
const notifyPayoutProcessed = (recipient, amount, method) => notifyUser({
  user: recipient,
  type: 'PAYOUT_PROCESSED',
  push: false,
  title: 'Payout processed',
  body:  `Rs ${fmt(amount)} has been paid out via ${method}.`,
  data:  { amount },
});

// Mirrors sendOrderDeliveredToSeller(seller, order) — order is a
// buildShipmentEmailView(...) result (sellerEarnings included). Seller
// didn't cause this state change (the agent/customer did) and it's
// money-relevant (earnings just entered escrow) — unlike the agent's own
// return-pickup completion, this isn't a self-action, so it's notified.
const notifyOrderDeliveredForSeller = (seller, order) => notifyUser({
  user: seller,
  type: 'SELLER_ORDER_DELIVERED',
  push: false,
  title: 'Order delivered',
  body:  `Order #${shortId(order._id)} delivered — Rs ${fmt(order.sellerEarnings)} pending release.`,
  data:  { orderId: order._id, amount: order.sellerEarnings },
});

// Mirrors sendReturnCompletedToSeller(seller, order, fault) — the email
// itself shows no Rs figure (order ID / date / fault / stock-restored only),
// so this doesn't either. Seller didn't cause the return completion — an
// admin/agent did — so unlike the agent's own pickup completion, it's notified.
const notifyReturnCompletedForSeller = (seller, order, fault) => notifyUser({
  user: seller,
  type: 'SELLER_RETURN_COMPLETED',
  push: false,
  title: 'Return completed',
  body:  `Return completed for order #${shortId(order._id)} — settlement adjusted${fault === 'seller' ? ' (product issue)' : ''}.`,
  data:  { orderId: order._id, fault },
});

// ═════════════════════════════════════════════════════════
// DELIVERY AGENT
// ═════════════════════════════════════════════════════════

// Mirrors sendDeliveryAssignedEmail(agent, order) — order is a
// buildShipmentEmailView(...) result.
const notifyDeliveryAssigned = (agent, order) => notifyUser({
  user: agent,
  type: 'DELIVERY_ASSIGNED',
  push: true,
  title: 'New delivery assignment',
  body:  `You've been assigned to deliver order #${shortId(order._id)}.`,
  data:  { orderId: order._id },
});

// Mirrors sendReturnPickupAssignedEmail(agent, returnRequest, order)
const notifyReturnPickupAssigned = (agent, returnRequest, order) => notifyUser({
  user: agent,
  type: 'RETURN_PICKUP_ASSIGNED',
  push: true,
  title: 'New return pickup',
  body:  `You've been assigned a return pickup for order #${shortId(order._id)}.`,
  data:  { returnId: returnRequest._id, orderId: order._id },
});

// ═════════════════════════════════════════════════════════
// BROADCAST
// ═════════════════════════════════════════════════════════

// No email touchpoint exists for this event — the diagnosis found none.
// Loads every user, normalizes roles with the exact roles[]-with-legacy-
// fallback pattern authMiddleware.js:68-70 uses, then inserts one doc per
// customer-role user. No push for broadcast.
const notifyCouponPublished = async (coupon) => {
  try {
    const User  = require('../models/User');
    const users = await User.find({}).select('role roles');
    const customerIds = users
      .filter((u) => {
        const userRoles = u.roles && u.roles.length ? u.roles : [u.role];
        return userRoles.includes('customer');
      })
      .map((u) => u._id);

    if (customerIds.length === 0) return;

    const docs = customerIds.map((userId) => ({
      user:  userId,
      type:  'COUPON_PUBLISHED',
      title: 'New coupon available',
      body:  `Use code ${coupon.code} on your next order.`,
      data:  { couponCode: coupon.code },
    }));

    await Notification.insertMany(docs);
  } catch (err) {
    console.error(`❌ Coupon broadcast notification failed | ${err.message}`);
  }
};

// ═════════════════════════════════════════════════════════
// REVIEWS
// ═════════════════════════════════════════════════════════

// No email touchpoint exists for this event. { productName, rating, orderId, productId }
const notifyNewReviewForSeller = (seller, { productName, rating, orderId, productId }) => notifyUser({
  user: seller,
  type: 'SELLER_NEW_REVIEW',
  push: false,
  title: 'New review',
  body:  `New ${rating}★ review on ${productName}`,
  data:  { productId, orderId },
});

module.exports = {
  // Customer
  notifyOrderPlaced,
  notifyOrderStatus,
  notifyReturnDecision,
  notifyRefundIssued,

  // Seller
  notifyNewOrderForSeller,
  notifyReturnRequestForSeller,
  notifyEarningsReleased,
  notifyPayoutProcessed,
  notifyOrderDeliveredForSeller,
  notifyReturnCompletedForSeller,

  // Delivery agent
  notifyDeliveryAssigned,
  notifyReturnPickupAssigned,

  // Broadcast
  notifyCouponPublished,

  // Reviews
  notifyNewReviewForSeller,
};
