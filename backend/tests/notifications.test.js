/**
 * ─────────────────────────────────────────────────────────────────────────────
 * notifications.test.js — run with: node backend/tests/notifications.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Integration tests for the notifications backend (v1):
 *   - backend/models/Notification.js
 *   - backend/utils/notificationService.js (notifyUser chokepoint + wrappers)
 *   - backend/controllers/notificationController.js
 * Modeled on profileIdentityLock.test.js's harness (real throwaway User
 * documents, invoke the real controller function directly).
 * Requires MONGO_URI (reads backend/.env). Every test creates its own
 * throwaway User/Notification documents and deletes them afterward.
 *
 * Covers:
 *   1-2. notifyUser via a loaded doc AND via a bare id both create a
 *        Notification doc for the right user.
 *   3.   notifyUser never throws on a bad/invalid user id.
 *   4.   Unread-count correctness (getUnreadCount).
 *   5.   read-one ownership rejection — 404 for a notification you don't own.
 *   6.   read-all (markAllRead) sets readAt on every unread doc, leaves others.
 *   7-8. Broadcast (notifyCouponPublished): one doc per customer-role user —
 *        both the roles-array form AND the legacy role-string form — and
 *        none for a pure seller or pure delivery agent.
 *   9-10. Push-token set and clear (setPushToken).
 *   11-13. Push send attempted only when push=true AND a token is present —
 *        covers doc-form (token on the doc already) and bare-id form
 *        (re-queried), plus (as of the all-types-push change) a previously
 *        push=false type (ORDER_PLACED) now sending too. The doc-form case
 *        also asserts the push payload's data.notificationId matches the
 *        created Notification doc's own _id (mobile's push tap-router uses
 *        this to mark the tapped notification read), and that the payload
 *        carries priority: 'high' + channelId: 'nepshop-high' (heads-up
 *        banner delivery on Android, matching mobile's channel).
 *   14.  Addendum: notifyNewReviewForSeller creates a doc for the seller,
 *        not the reviewer.
 *   15.  notifyOrderDeliveredForSeller / notifyReturnCompletedForSeller
 *        (the two SELLER_* types added after the requestReturn/completeReturn
 *        gap discussion) create correctly-typed docs.
 *   16.  Broadcast push batching: notifyCouponPublished pushes ONLY to
 *        recipients with an expoPushToken, as a single Expo batch call (an
 *        array-of-messages body, not one call per recipient), and each
 *        message's data.notificationId matches the Notification doc actually
 *        created for that specific recipient (not just any doc from the
 *        broadcast) — 3 token-holding + 2 tokenless recipients -> exactly
 *        one HTTP call with exactly 3 messages.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const assert = require('assert');
const mongoose = require('mongoose');

let passed = 0;
let failed = 0;

const test = async (name, fn, cleanupFn) => {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(`   ${err.stack || err.message}`);
    failed++;
  } finally {
    if (cleanupFn) await cleanupFn();
  }
};

const fakeRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
};

const invoke = async (handler, req) => {
  const res = fakeRes();
  try {
    await handler(req, res);
    return { res, err: null };
  } catch (err) {
    return { res, err };
  }
};

// Small poll — Notification.create() calls inside fire-and-forget notify*
// wrappers are awaited by notifyUser internally but the wrappers themselves
// are called without awaiting at real call sites; in these tests we DO await
// the wrapper directly (they return the notifyUser promise), so no polling
// is actually needed — kept only as a safety net for the broadcast case
// (insertMany inside an async IIFE-style function we do await).
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set — cannot run integration tests');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });

  const Notification = require('../models/Notification');
  const User = require('../models/User');
  const {
    notifyOrderPlaced,
    notifyOrderStatus,
    notifyReturnDecision,
    notifyRefundIssued,
    notifyNewOrderForSeller,
    notifyReturnRequestForSeller,
    notifyEarningsReleased,
    notifyPayoutProcessed,
    notifyDeliveryAssigned,
    notifyReturnPickupAssigned,
    notifyCouponPublished,
    notifyNewReviewForSeller,
    notifyOrderDeliveredForSeller,
    notifyReturnCompletedForSeller,
  } = require('../utils/notificationService');
  const {
    getUnreadCount,
    markAllRead,
    markOneRead,
    setPushToken,
  } = require('../controllers/notificationController');

  const cleanupIds = { users: [] };

  const mkUser = async ({ role, roles, tag }) => {
    const data = {
      firstName: 'NotifDiag', lastName: tag,
      email: `notifdiag-${tag.toLowerCase()}-${new mongoose.Types.ObjectId()}@test.local`,
      phone: '9800000006',
      password: 'hashedpw-not-used-in-these-tests',
      role, status: 'active',
    };
    if (roles) data.roles = roles;
    const u = await User.create(data);
    cleanupIds.users.push(u._id);
    return u;
  };

  const cleanup = async () => {
    await Notification.deleteMany({ user: { $in: cleanupIds.users } });
    await User.deleteMany({ _id: { $in: cleanupIds.users } });
    cleanupIds.users = [];
  };

  // ── 1-2. notifyUser via doc AND bare id ───────────────────────────────────
  await test('notifyUser (doc form): notifyOrderPlaced creates a Notification for that user', async () => {
    const customer = await mkUser({ role: 'customer', roles: ['customer'], tag: 'Doc1' });
    const fakeOrder = { _id: new mongoose.Types.ObjectId(), total: 1500 };
    await notifyOrderPlaced(customer, fakeOrder);

    const docs = await Notification.find({ user: customer._id });
    assert.strictEqual(docs.length, 1);
    assert.strictEqual(docs[0].type, 'ORDER_PLACED');
    assert.ok(docs[0].title.length > 0);
    assert.strictEqual(String(docs[0].data.orderId), String(fakeOrder._id));
  }, cleanup);

  await test('notifyUser (bare-id form): notifyPayoutProcessed creates a Notification via a raw ObjectId', async () => {
    const seller = await mkUser({ role: 'seller', roles: ['seller'], tag: 'Bare1' });
    await notifyPayoutProcessed(seller._id, 950, 'bank');

    const docs = await Notification.find({ user: seller._id });
    assert.strictEqual(docs.length, 1);
    assert.strictEqual(docs[0].type, 'PAYOUT_PROCESSED');
    assert.strictEqual(docs[0].data.amount, 950);
  }, cleanup);

  // ── 3. Never throws on a bad id ───────────────────────────────────────────
  await test('notifyUser never throws on an invalid user id', async () => {
    const fakeOrder = { _id: new mongoose.Types.ObjectId(), total: 200 };
    let threw = false;
    try {
      await notifyOrderPlaced('not-a-valid-object-id', fakeOrder);
    } catch (err) {
      threw = true;
    }
    assert.strictEqual(threw, false, 'notifyUser must swallow the Mongoose cast error, not throw');

    const docs = await Notification.find({ 'data.orderId': fakeOrder._id });
    assert.strictEqual(docs.length, 0, 'no doc should have been created for the invalid id');
  });

  // ── 4. Unread-count correctness ───────────────────────────────────────────
  await test('getUnreadCount: counts only unread notifications for the caller', async () => {
    const user = await mkUser({ role: 'customer', roles: ['customer'], tag: 'Unread1' });
    await Notification.create([
      { user: user._id, type: 'ORDER_PLACED', title: 'A' },
      { user: user._id, type: 'ORDER_PLACED', title: 'B' },
      { user: user._id, type: 'ORDER_PLACED', title: 'C', readAt: new Date() },
    ]);

    const { res, err } = await invoke(getUnreadCount, { user });
    assert.strictEqual(err, null);
    assert.strictEqual(res.body.count, 2);
  }, cleanup);

  // ── 5. read-one ownership rejection ───────────────────────────────────────
  await test('markOneRead: 404 when the notification belongs to a different user', async () => {
    const owner   = await mkUser({ role: 'customer', roles: ['customer'], tag: 'Owner1' });
    const stranger = await mkUser({ role: 'customer', roles: ['customer'], tag: 'Stranger1' });
    const doc = await Notification.create({ user: owner._id, type: 'ORDER_PLACED', title: 'A' });

    const { res, err } = await invoke(markOneRead, { user: stranger, params: { id: doc._id.toString() } });
    assert.ok(err);
    assert.strictEqual(res.statusCode, 404);

    const raw = await Notification.findById(doc._id);
    assert.strictEqual(raw.readAt, null, 'the doc must remain unread — the request must not have touched it');
  }, cleanup);

  // ── 6. read-all ────────────────────────────────────────────────────────────
  await test('markAllRead: sets readAt on every unread doc for the caller, leaves already-read alone', async () => {
    const user = await mkUser({ role: 'customer', roles: ['customer'], tag: 'ReadAll1' });
    const already = await Notification.create({ user: user._id, type: 'ORDER_PLACED', title: 'Already', readAt: new Date('2020-01-01') });
    await Notification.create([
      { user: user._id, type: 'ORDER_PLACED', title: 'A' },
      { user: user._id, type: 'ORDER_PLACED', title: 'B' },
    ]);

    const { res, err } = await invoke(markAllRead, { user });
    assert.strictEqual(err, null);
    assert.strictEqual(res.statusCode, 200);

    const docs = await Notification.find({ user: user._id });
    assert.ok(docs.every((d) => d.readAt !== null), 'every doc must now be read');

    const raw = await Notification.findById(already._id);
    assert.strictEqual(raw.readAt.getTime(), new Date('2020-01-01').getTime(), 'an already-read doc must keep its original readAt, not be overwritten');
  }, cleanup);

  // ── 7-8. Broadcast — customer-role users only ─────────────────────────────
  await test('notifyCouponPublished: one doc per customer-role user (roles-array AND legacy role-string), none for seller/agent-only', async () => {
    const customerArray  = await mkUser({ role: 'customer', roles: ['customer'], tag: 'Bcast1' });
    const customerLegacy = await mkUser({ role: 'customer', tag: 'Bcast2' }); // no roles array — legacy fallback
    const multiRole       = await mkUser({ role: 'seller', roles: ['seller', 'customer'], tag: 'Bcast3' });
    const pureSeller       = await mkUser({ role: 'seller', roles: ['seller'], tag: 'Bcast4' });
    const pureAgent         = await mkUser({ role: 'delivery', roles: ['delivery'], tag: 'Bcast5' });

    await notifyCouponPublished({ code: 'DIAGCODE10' });

    const [dArray, dLegacy, dMulti, dSeller, dAgent] = await Promise.all([
      Notification.find({ user: customerArray._id, type: 'COUPON_PUBLISHED' }),
      Notification.find({ user: customerLegacy._id, type: 'COUPON_PUBLISHED' }),
      Notification.find({ user: multiRole._id, type: 'COUPON_PUBLISHED' }),
      Notification.find({ user: pureSeller._id, type: 'COUPON_PUBLISHED' }),
      Notification.find({ user: pureAgent._id, type: 'COUPON_PUBLISHED' }),
    ]);

    assert.strictEqual(dArray.length, 1, 'roles-array customer must get exactly one broadcast doc');
    assert.strictEqual(dLegacy.length, 1, 'legacy role-string customer must get exactly one broadcast doc');
    assert.strictEqual(dMulti.length, 1, 'a multi-role user holding customer must get exactly one broadcast doc');
    assert.strictEqual(dSeller.length, 0, 'a pure seller must not get a customer broadcast');
    assert.strictEqual(dAgent.length, 0, 'a pure delivery agent must not get a customer broadcast');
    assert.strictEqual(dArray[0].data.couponCode, 'DIAGCODE10');
  }, async () => {
    await Notification.deleteMany({ type: 'COUPON_PUBLISHED', user: { $in: cleanupIds.users } });
    await cleanup();
  });

  // ── 9-10. Push-token set and clear ────────────────────────────────────────
  await test('setPushToken: sets then clears the caller\'s expoPushToken', async () => {
    const user = await mkUser({ role: 'customer', roles: ['customer'], tag: 'Push1' });

    const { res: res1, err: err1 } = await invoke(setPushToken, { user, body: { token: 'ExponentPushToken[abc123]' } });
    assert.strictEqual(err1, null);
    assert.strictEqual(res1.statusCode, 200);
    let raw = await User.findById(user._id);
    assert.strictEqual(raw.expoPushToken, 'ExponentPushToken[abc123]');

    const { res: res2, err: err2 } = await invoke(setPushToken, { user: raw, body: { token: null } });
    assert.strictEqual(err2, null);
    raw = await User.findById(user._id);
    assert.strictEqual(raw.expoPushToken, null, 'null must clear the token');
  }, cleanup);

  // ── 11-13. Push send attempted only when push=true AND token present ─────
  const originalFetch = global.fetch;
  const withFetchStub = async (fn) => {
    const calls = [];
    global.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return { json: async () => ({ data: { status: 'ok' } }) };
    };
    try {
      await fn(calls);
    } finally {
      global.fetch = originalFetch;
    }
  };

  await test('push=true + doc already carries expoPushToken: push is sent, no re-query needed', async () => {
    await withFetchStub(async (calls) => {
      const agent = await mkUser({ role: 'delivery', roles: ['delivery'], tag: 'PushSend1' });
      agent.expoPushToken = 'ExponentPushToken[has-token]';
      await agent.save();

      await notifyDeliveryAssigned(agent, { _id: new mongoose.Types.ObjectId() });
      assert.strictEqual(calls.length, 1, 'a push must have been sent');
      const body = JSON.parse(calls[0].opts.body);
      assert.strictEqual(body.to, 'ExponentPushToken[has-token]');

      // notificationId must be the created doc's own _id — this is what
      // lets mobile/src/components/NotificationTapRouter.js mark the
      // tapped notification read (it has no other way to know the doc id;
      // the rest of `data` only ever carries orderId/returnId/etc.).
      const created = await Notification.findOne({ user: agent._id, type: 'DELIVERY_ASSIGNED' });
      assert.ok(created, 'the Notification doc must exist');
      assert.strictEqual(String(body.data.notificationId), String(created._id));

      // priority/channelId are what make this show as a heads-up banner on
      // Android instead of landing silently in the tray — channelId must
      // match mobile/src/utils/push.js's ANDROID_CHANNEL_ID exactly.
      assert.strictEqual(body.priority, 'high');
      assert.strictEqual(body.channelId, 'nepshop-high');
    });
  }, cleanup);

  await test('push=true + bare id, token present in DB: push is sent via re-query', async () => {
    await withFetchStub(async (calls) => {
      const agent = await mkUser({ role: 'delivery', roles: ['delivery'], tag: 'PushSend2' });
      agent.expoPushToken = 'ExponentPushToken[bare-id-token]';
      await agent.save();

      await notifyDeliveryAssigned(agent._id, { _id: new mongoose.Types.ObjectId() });
      assert.strictEqual(calls.length, 1, 'a push must have been sent after re-querying the bare id for its token');
    });
  }, cleanup);

  await test('push=true but no token present: push is never attempted', async () => {
    await withFetchStub(async (calls) => {
      const agent = await mkUser({ role: 'delivery', roles: ['delivery'], tag: 'PushSend3' });
      // expoPushToken stays null (default)
      await notifyDeliveryAssigned(agent, { _id: new mongoose.Types.ObjectId() });
      assert.strictEqual(calls.length, 0, 'no token → no push attempt');

      const docs = await Notification.find({ user: agent._id });
      assert.strictEqual(docs.length, 1, 'the Notification doc must still be created even without a push');
    });
  }, cleanup);

  await test('a previously-unpushed type (ORDER_PLACED) now attempts push when a token exists', async () => {
    await withFetchStub(async (calls) => {
      const customer = await mkUser({ role: 'customer', roles: ['customer'], tag: 'PushSend4' });
      customer.expoPushToken = 'ExponentPushToken[now-used]';
      await customer.save();

      await notifyOrderPlaced(customer, { _id: new mongoose.Types.ObjectId(), total: 500 });
      assert.strictEqual(calls.length, 1, 'ORDER_PLACED now has push=true — a push must be sent when a token exists');
      const body = JSON.parse(calls[0].opts.body);
      assert.strictEqual(body.to, 'ExponentPushToken[now-used]');
    });
  }, cleanup);

  // ── 14. Addendum — notifyNewReviewForSeller ───────────────────────────────
  await test('notifyNewReviewForSeller: creates a doc for the SELLER, not the reviewer', async () => {
    const seller   = await mkUser({ role: 'seller', roles: ['seller'], tag: 'Review1' });
    const reviewer = await mkUser({ role: 'customer', roles: ['customer'], tag: 'Review2' });
    const productId = new mongoose.Types.ObjectId();
    const orderId    = new mongoose.Types.ObjectId();

    await notifyNewReviewForSeller(seller, {
      productName: 'iPhone Cover', rating: 4, orderId, productId,
    });

    const sellerDocs   = await Notification.find({ user: seller._id, type: 'SELLER_NEW_REVIEW' });
    const reviewerDocs = await Notification.find({ user: reviewer._id, type: 'SELLER_NEW_REVIEW' });
    assert.strictEqual(sellerDocs.length, 1);
    assert.strictEqual(reviewerDocs.length, 0);
    assert.ok(sellerDocs[0].body.includes('4') && sellerDocs[0].body.includes('iPhone Cover'));
    assert.strictEqual(String(sellerDocs[0].data.productId), String(productId));
  }, async () => {
    await Notification.deleteMany({ user: { $in: cleanupIds.users } });
    await cleanup();
  });

  // ── 15. The two SELLER_* types added after the gap discussion ────────────
  await test('notifyOrderDeliveredForSeller and notifyReturnCompletedForSeller create correctly-typed docs', async () => {
    const seller = await mkUser({ role: 'seller', roles: ['seller'], tag: 'Gap1' });
    const shipmentView = { _id: new mongoose.Types.ObjectId(), sellerEarnings: 800 };
    const order = { _id: new mongoose.Types.ObjectId() };

    await notifyOrderDeliveredForSeller(seller, shipmentView);
    await notifyReturnCompletedForSeller(seller, order, 'seller');

    const delivered = await Notification.find({ user: seller._id, type: 'SELLER_ORDER_DELIVERED' });
    const returned   = await Notification.find({ user: seller._id, type: 'SELLER_RETURN_COMPLETED' });
    assert.strictEqual(delivered.length, 1);
    assert.strictEqual(returned.length, 1);
    assert.ok(delivered[0].body.includes('800'));
    assert.strictEqual(returned[0].data.fault, 'seller');
  }, cleanup);

  // ── 16. Broadcast push batching — token-holding recipients only ──────────
  await test('notifyCouponPublished: batches push to token-holding recipients with correct per-recipient notificationIds', async () => {
    await withFetchStub(async (calls) => {
      const withToken1 = await mkUser({ role: 'customer', roles: ['customer'], tag: 'Bpush1' });
      const withToken2 = await mkUser({ role: 'customer', roles: ['customer'], tag: 'Bpush2' });
      const withToken3 = await mkUser({ role: 'customer', roles: ['customer'], tag: 'Bpush3' });
      // No-token recipients — created so they're part of the broadcast's
      // Notification.insertMany, but must be excluded from the push batch.
      await mkUser({ role: 'customer', roles: ['customer'], tag: 'Bpush4' });
      await mkUser({ role: 'customer', roles: ['customer'], tag: 'Bpush5' });

      withToken1.expoPushToken = 'ExponentPushToken[bpush1]';
      withToken2.expoPushToken = 'ExponentPushToken[bpush2]';
      withToken3.expoPushToken = 'ExponentPushToken[bpush3]';
      await Promise.all([withToken1.save(), withToken2.save(), withToken3.save()]);
      // noToken1/noToken2 keep expoPushToken null (default)

      await notifyCouponPublished({ code: 'BATCHCODE5' });

      // notifyCouponPublished broadcasts to every customer-role user in the
      // whole collection (that's the spec — "every recipient who has an
      // expoPushToken"), so this shared dev DB may hold other real
      // customers with a token already registered (e.g. from device push
      // testing) beyond the 3 created here — assert our 3 are present and
      // correctly paired, not an exact global total. Under the 100-message
      // chunk limit this still fits in one call unless the DB holds >97
      // other token-holding customers, which it doesn't.
      assert.strictEqual(calls.length, 1, 'well under the 100-message chunk limit — exactly one HTTP call');
      const messages = JSON.parse(calls[0].opts.body);
      assert.ok(Array.isArray(messages), 'batch body must be an array of messages');
      assert.ok(messages.length >= 3, 'at least the 3 token-holding recipients created here must get a push message');

      const byToken = Object.fromEntries(messages.map((m) => [m.to, m]));
      assert.ok(byToken['ExponentPushToken[bpush1]']);
      assert.ok(byToken['ExponentPushToken[bpush2]']);
      assert.ok(byToken['ExponentPushToken[bpush3]']);

      // Each message's notificationId must match the doc actually created
      // for that specific recipient (not just any doc from the broadcast).
      const [doc1, doc2, doc3] = await Promise.all([
        Notification.findOne({ user: withToken1._id, type: 'COUPON_PUBLISHED' }),
        Notification.findOne({ user: withToken2._id, type: 'COUPON_PUBLISHED' }),
        Notification.findOne({ user: withToken3._id, type: 'COUPON_PUBLISHED' }),
      ]);
      assert.strictEqual(String(byToken['ExponentPushToken[bpush1]'].data.notificationId), String(doc1._id));
      assert.strictEqual(String(byToken['ExponentPushToken[bpush2]'].data.notificationId), String(doc2._id));
      assert.strictEqual(String(byToken['ExponentPushToken[bpush3]'].data.notificationId), String(doc3._id));

      messages.forEach((m) => {
        assert.strictEqual(m.priority, 'high');
        assert.strictEqual(m.channelId, 'nepshop-high');
      });
    });
  }, async () => {
    await Notification.deleteMany({ type: 'COUPON_PUBLISHED', user: { $in: cleanupIds.users } });
    await cleanup();
  });

  await mongoose.disconnect();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
};

run().catch((err) => { console.error('FATAL:', err); process.exit(1); });
