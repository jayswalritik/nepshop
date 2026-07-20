const mongoose = require('mongoose');
const Notification = require('../models/Notification');

// ── Expo push (plain HTTPS, Node's built-in fetch — no expo-server-sdk) ───
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// No retry, no token cleanup in v1 — log only, mirrors sendEmail's
// log-and-continue posture (emailService.js:265+).
//
// priority: 'high' + channelId: 'nepshop-high' together are what make this
// show as a heads-up banner (like Facebook) instead of landing silently in
// the tray — 'high' asks FCM to wake the device promptly, and channelId
// must match mobile/src/utils/push.js's ANDROID_CHANNEL_ID exactly (that's
// the channel the device actually created with importance: MAX; a mismatched
// id here would silently fall back to Android's default channel/importance).
const sendPush = async (token, title, body, data) => {
  try {
    const res  = await fetch(EXPO_PUSH_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body:    JSON.stringify({
        to: token, title, body, data,
        priority: 'high',
        channelId: 'nepshop-high',
      }),
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

// Expo's push endpoint also accepts an ARRAY of messages per call (instead
// of the single-object body sendPush above posts), capped at 100 messages
// per request — used only by the broadcast path below, where one HTTP call
// per recipient would be wasteful. Chunks are independent: a failed chunk
// logs and continues to the next rather than aborting the whole broadcast,
// same never-throws posture as sendPush.
const EXPO_PUSH_BATCH_LIMIT = 100;

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const sendPushBatch = async (messages) => {
  if (messages.length === 0) return;
  const chunks = chunk(messages, EXPO_PUSH_BATCH_LIMIT);
  for (const batch of chunks) {
    try {
      const res  = await fetch(EXPO_PUSH_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body:    JSON.stringify(batch),
      });
      const json    = await res.json().catch(() => null);
      const tickets = Array.isArray(json?.data) ? json.data : [];
      const errored = tickets.filter((t) => t?.status === 'error').length;
      console.log(`✅ Push batch sent → ${batch.length - errored}/${batch.length} ok`);
    } catch (err) {
      console.error(`❌ Push batch failed (${batch.length} messages) | ${err.message}`);
    }
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

    // Created before the push send below (not after) specifically so its
    // _id is available to stamp onto the push payload as notificationId —
    // that's what lets a tapped push mark the right doc read on the mobile
    // side (mobile/src/components/NotificationTapRouter.js).
    const notificationDoc = await Notification.create({ user: userId, type, title, body, data });

    if (push) {
      let token = isDoc(user) ? user.expoPushToken : null;
      if (!isDoc(user)) {
        const User = require('../models/User');
        const doc  = await User.findById(userId).select('expoPushToken');
        token = doc?.expoPushToken || null;
      }
      if (token) await sendPush(token, title, body, { ...data, notificationId: notificationDoc._id });
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
  push: true,
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
    push: true,
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
  push: true,
  title: 'New order received',
  body:  `New order #${shortId(order._id)} — your earnings: Rs ${fmt(order.sellerEarnings)}.`,
  data:  { orderId: order._id },
});

// Mirrors sendReturnRequestToSeller(seller, returnRequest, order)
const notifyReturnRequestForSeller = (seller, returnRequest, order) => notifyUser({
  user: seller,
  type: 'SELLER_RETURN_REQUEST',
  push: true,
  title: 'Return request filed',
  body:  `A customer requested a return for order #${shortId(order._id)}: ${returnRequest.reason}.`,
  data:  { returnId: returnRequest._id, orderId: order._id },
});

// Mirrors sendSettlementReleasedEmail(seller, order) — `order` here is
// always a buildShipmentEmailView(...) result (sellerEarnings included).
const notifyEarningsReleased = (seller, order) => notifyUser({
  user: seller,
  type: 'EARNINGS_RELEASED',
  push: true,
  title: 'Earnings released',
  body:  `Rs ${fmt(order.sellerEarnings)} from order #${shortId(order._id)} is now available for payout.`,
  data:  { orderId: order._id, amount: order.sellerEarnings },
});

// Mirrors sendPayoutProcessedEmail(recipient, amount, method) — seller or agent.
const notifyPayoutProcessed = (recipient, amount, method) => notifyUser({
  user: recipient,
  type: 'PAYOUT_PROCESSED',
  push: true,
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
  push: true,
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
  push: true,
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
// customer-role user, then pushes to whichever of those recipients have an
// expoPushToken.
//
// insertMany is called with its default ordered:true (unchanged from
// before) specifically because that's what guarantees the returned array
// is in the exact same order as the `docs` array passed in when every
// insert succeeds — so `inserted[i]` is always the doc created for
// `customers[i]`, and each push message below can carry the correct
// recipient's own notificationId without a second query.
const notifyCouponPublished = async (coupon) => {
  try {
    const User  = require('../models/User');
    const users = await User.find({}).select('role roles expoPushToken');
    const customers = users.filter((u) => {
      const userRoles = u.roles && u.roles.length ? u.roles : [u.role];
      return userRoles.includes('customer');
    });

    if (customers.length === 0) return;

    const title = 'New coupon available';
    const body  = `Use code ${coupon.code} on your next order.`;

    const docs = customers.map((u) => ({
      user: u._id,
      type: 'COUPON_PUBLISHED',
      title,
      body,
      data: { couponCode: coupon.code },
    }));

    const inserted = await Notification.insertMany(docs);

    const messages = customers
      .map((u, i) => ({ token: u.expoPushToken, notificationId: inserted[i]._id }))
      .filter((m) => m.token)
      .map(({ token, notificationId }) => ({
        to: token,
        title,
        body,
        data: { couponCode: coupon.code, notificationId },
        priority: 'high',
        channelId: 'nepshop-high',
      }));

    await sendPushBatch(messages);
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
  push: true,
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
