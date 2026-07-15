/**
 * ─────────────────────────────────────────────────────────────────────────────
 * authAdminGuards.test.js — run with: node backend/tests/authAdminGuards.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Integration tests for two guards added in the same pass:
 *   1. protect() per-request suspension check (backend/middleware/authMiddleware.js)
 *   2. adminUpdateOrderStatus's restricted status allowlist (backend/controllers/adminController.js)
 * Item 2's "cancel still restores stock/voucher" requirement is already
 * exhaustively covered by couponRestore.test.js's four admin-cancel cases —
 * not duplicated here; this file only covers what's NEW: the allowlist gate
 * itself and the suspension check.
 * Requires MONGO_URI (reads backend/.env). Every test creates its own
 * throwaway User/Order/Shipment documents and deletes them afterward.
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

// For controller-style handlers: (req, res) => Promise, errors thrown/rejected.
const invoke = async (handler, req) => {
  const res = fakeRes();
  try {
    await handler(req, res);
    return { res, err: null };
  } catch (err) {
    return { res, err };
  }
};

// For middleware-style handlers: (req, res, next) — asyncHandler routes a
// thrown error to next(err) rather than rejecting the outer promise, so this
// needs its own invoker that captures what next() was called with.
const invokeMiddleware = (handler, req) => new Promise((resolve) => {
  const res = fakeRes();
  const calls = [];
  const next = (err) => { calls.push(err); resolve({ res, nextArg: err, calledNext: true }); };
  const result = handler(req, res, next);
  // asyncHandler always resolves via next(), but guard against a handler
  // that resolves without ever calling next (shouldn't happen here).
  Promise.resolve(result).then(() => {
    if (calls.length === 0) resolve({ res, nextArg: undefined, calledNext: false });
  });
});

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set — cannot run integration tests');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });

  const { protect, SUSPENDED_MESSAGE } = require('../middleware/authMiddleware');
  const { adminUpdateOrderStatus }     = require('../controllers/adminController');
  const { generateToken }              = require('../utils/generateToken');
  const User     = require('../models/User');
  const Order    = require('../models/Order');
  const Shipment = require('../models/Shipment');

  const cleanupIds = { users: [], orders: [], shipments: [] };

  const mkUser = async (role, tag, status = 'active') => {
    const u = await User.create({
      firstName: 'GuardDiag', lastName: tag,
      email: `guarddiag-${tag.toLowerCase()}-${new mongoose.Types.ObjectId()}@test.local`,
      phone: '9800000003',
      password: 'hashedpw-not-used-in-these-tests',
      role, status, emailVerified: true,
    });
    cleanupIds.users.push(u._id);
    return u;
  };

  const mkPendingOrder = async (customerId, sellerId) => {
    const p1 = new mongoose.Types.ObjectId();
    const order = await Order.create({
      customer: customerId,
      items: [{ product: p1, name: 'Item', image: 'x', price: 500, quantity: 1, seller: sellerId }],
      deliveryAddress: { fullName: 'Diag', phone: '9800000000', street: 'x', city: 'x', district: 'x' },
      paymentMethod: 'cash_on_delivery', paymentStatus: 'pending',
      subtotal: 500, deliveryCharge: 100, total: 600,
    });
    cleanupIds.orders.push(order._id);
    const shipment = await Shipment.create({
      order: order._id, seller: sellerId,
      items: [{ product: p1, name: 'Item', image: 'x', price: 500, quantity: 1 }],
      sellerSubtotal: 500, deliveryCharge: 100, commissionRate: 5, commissionAmount: 25,
      status: 'pending',
    });
    cleanupIds.shipments.push(shipment._id);
    return { order, shipment };
  };

  const cleanup = async () => {
    await Shipment.deleteMany({ _id: { $in: cleanupIds.shipments } });
    await Order.deleteMany({ _id: { $in: cleanupIds.orders } });
    await User.deleteMany({ _id: { $in: cleanupIds.users } });
    cleanupIds.users = []; cleanupIds.orders = []; cleanupIds.shipments = [];
  };

  // ── ITEM 1 — protect() per-request suspension check ─────────────────────
  await test('protect(): a suspended user\'s still-valid token is rejected with 403 + the shared message', async () => {
    const user = await mkUser('customer', 'Susp', 'active');
    const token = generateToken(user._id, user.role);

    user.status = 'suspended';
    await user.save();

    const req = { headers: { authorization: `Bearer ${token}` } };
    const { res, nextArg, calledNext } = await invokeMiddleware(protect, req);

    assert.ok(calledNext, 'next() must be called (asyncHandler routes the throw there)');
    assert.strictEqual(res.statusCode, 403);
    assert.ok(nextArg instanceof Error, 'next must be called WITH an error, not next()');
    assert.strictEqual(nextArg.message, SUSPENDED_MESSAGE);

  }, cleanup);

  await test('protect(): reactivating the SAME token works again', async () => {
    const user = await mkUser('customer', 'Reactivate', 'suspended');
    const token = generateToken(user._id, user.role);

    // Confirm it's blocked first (sanity — proves the token itself is valid).
    const blocked = await invokeMiddleware(protect, { headers: { authorization: `Bearer ${token}` } });
    assert.strictEqual(blocked.res.statusCode, 403);

    user.status = 'active';
    await user.save();

    const req = { headers: { authorization: `Bearer ${token}` } };
    const { res, nextArg, calledNext } = await invokeMiddleware(protect, req);

    assert.ok(calledNext);
    assert.strictEqual(nextArg, undefined, 'next() must be called with no error once reactivated');
    assert.notStrictEqual(res.statusCode, 403);
    assert.ok(req.user, 'req.user must be attached on success');
    assert.strictEqual(req.user.status, 'active');

  }, cleanup);

  // ── ITEM 2 — admin override allowlist ────────────────────────────────────
  for (const rejected of ['delivered', 'dispatched', 'returned']) {
    await test(`admin override rejects "${rejected}" with 400`, async () => {
      const fakeOrderId = new mongoose.Types.ObjectId();
      const { res, err } = await invoke(adminUpdateOrderStatus, {
        params: { id: fakeOrderId }, body: { status: rejected },
      });
      assert.ok(err, `must throw/reject for "${rejected}"`);
      assert.strictEqual(res.statusCode, 400);
    }, async () => {});
  }

  for (const allowed of ['pending', 'confirmed']) {
    await test(`admin override still accepts "${allowed}"`, async () => {
      const customer = await mkUser('customer', 'Cust');
      const seller    = await mkUser('seller', 'Seller');
      const { order } = await mkPendingOrder(customer._id, seller._id);

      const { res, err } = await invoke(adminUpdateOrderStatus, {
        params: { id: order._id }, body: { status: allowed },
      });
      assert.strictEqual(err, null, `admin override to "${allowed}" must not throw: ${err && err.message}`);
      assert.strictEqual(res.statusCode, 200);
    }, cleanup);
  }

  await mongoose.disconnect();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
};

run().catch((err) => { console.error('FATAL:', err); process.exit(1); });
