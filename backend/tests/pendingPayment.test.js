/**
 * ─────────────────────────────────────────────────────────────────────────────
 * pendingPayment.test.js — run with: node backend/tests/pendingPayment.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Covers the PendingPayment refactor (backend/models/PendingPayment.js,
 * backend/controllers/paymentController.js):
 *   1. Return-URL allowlist (RETURN_URLS/resolveSource) — all four
 *      (source, gateway) combinations, plus invalid-source rejection.
 *   2. findInitiatedPendingPayment lookup logic — found / not-found /
 *      wrong-customer / already-completed / previously-failed.
 *   3. Idempotent double-verify — hitting verifyKhalti twice for the same
 *      pidx must create exactly one order, not two.
 *
 * No live Khalti/eSewa HTTP calls: axios.post is monkey-patched per test to
 * return a canned gateway response and restored afterward. No new
 * dependency — axios's module object is a singleton under Node's require
 * cache, so patching `axios.post` here also patches the SAME reference
 * paymentController.js calls.
 *
 * Requires MONGO_URI (reads backend/.env). Every test creates its own
 * throwaway User/Product/Cart/PendingPayment/Order/Shipment documents and
 * deletes them afterward — same convention as couponRestore.test.js.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const assert = require('assert');
const mongoose = require('mongoose');
const axios = require('axios');

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
    contentType: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    type(t) { this.contentType = t; return this; },
    send(payload) { this.body = payload; return this; },
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

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set — cannot run integration tests');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });

  const {
    verifyKhalti,
    esewaForm,
    RETURN_URLS,
    resolveSource,
    findInitiatedPendingPayment,
    buildEsewaSignature,
    buildEsewaFormData,
  } = require('../controllers/paymentController');
  const PendingPayment = require('../models/PendingPayment');
  const User    = require('../models/User');
  const Product = require('../models/Product');
  const Cart    = require('../models/Cart');
  const Order   = require('../models/Order');
  const Shipment = require('../models/Shipment');

  const cleanupIds = { users: [], products: [], carts: [], pendingPayments: [], orders: [], shipments: [] };

  const mkUser = async (tag, role = 'customer') => {
    const u = await User.create({
      firstName: 'PayDiag', lastName: tag,
      email: `paydiag-${tag.toLowerCase()}-${new mongoose.Types.ObjectId()}@test.local`,
      phone: '9800000003',
      password: 'hashedpw-not-used-in-these-tests',
      role, emailVerified: true,
    });
    cleanupIds.users.push(u._id);
    return u;
  };

  const mkProduct = async (sellerId, tag) => {
    const p = await Product.create({
      name: `PayDiag Product ${tag}`,
      description: 'pending-payment diagnostic product',
      price: 1000,
      category: 'Electronics',
      stock: 10,
      seller: sellerId,
      images: [{ url: 'https://example.com/x.jpg', publicId: `paydiag-${tag}` }],
    });
    cleanupIds.products.push(p._id);
    return p;
  };

  const mkCartWithItem = async (customerId, product) => {
    const cart = await Cart.create({
      customer: customerId,
      items: [{ product: product._id, quantity: 1, price: product.price }],
    });
    cleanupIds.carts.push(cart._id);
    return cart;
  };

  const address = { fullName: 'Diag', phone: '9800000000', street: 'x', city: 'x', district: 'x' };

  const cleanup = async () => {
    await PendingPayment.deleteMany({ _id: { $in: cleanupIds.pendingPayments } });
    await Shipment.deleteMany({ _id: { $in: cleanupIds.shipments } });
    await Order.deleteMany({ _id: { $in: cleanupIds.orders } });
    await Cart.deleteMany({ _id: { $in: cleanupIds.carts } });
    await Product.deleteMany({ _id: { $in: cleanupIds.products } });
    await User.deleteMany({ _id: { $in: cleanupIds.users } });
    cleanupIds.pendingPayments = []; cleanupIds.shipments = []; cleanupIds.orders = [];
    cleanupIds.carts = []; cleanupIds.products = []; cleanupIds.users = [];
  };

  // ── 1. Return-URL allowlist ──────────────────────────────────────────
  await test('allowlist: web+khalti returns a FRONTEND_URL-based return_url', () => {
    const original = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://web.example.com';
    try {
      assert.strictEqual(RETURN_URLS.web.khalti(), 'https://web.example.com/payment/khalti/verify');
    } finally {
      process.env.FRONTEND_URL = original;
    }
  });

  await test('allowlist: web+esewa returns FRONTEND_URL-based success/failure URLs', () => {
    const original = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://web.example.com';
    try {
      const urls = RETURN_URLS.web.esewa();
      assert.strictEqual(urls.success, 'https://web.example.com/payment/esewa/verify');
      assert.strictEqual(urls.failure, 'https://web.example.com/payment/failed');
    } finally {
      process.env.FRONTEND_URL = original;
    }
  });

  await test('allowlist: mobile+khalti returns the FRONTEND_URL-based https bridge page (Khalti rejects non-http return_url)', () => {
    const original = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://web.example.com';
    try {
      assert.strictEqual(RETURN_URLS.mobile.khalti(), 'https://web.example.com/payment/mobile-return/khalti');
    } finally {
      process.env.FRONTEND_URL = original;
    }
  });

  await test('allowlist: mobile+esewa returns FRONTEND_URL-based https bridge success/failure pages', () => {
    const original = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://web.example.com';
    try {
      const urls = RETURN_URLS.mobile.esewa();
      assert.strictEqual(urls.success, 'https://web.example.com/payment/mobile-return/esewa');
      assert.strictEqual(urls.failure, 'https://web.example.com/payment/mobile-return/failed');
    } finally {
      process.env.FRONTEND_URL = original;
    }
  });

  await test('resolveSource: "web" and "mobile" pass through unchanged', () => {
    assert.strictEqual(resolveSource('web'), 'web');
    assert.strictEqual(resolveSource('mobile'), 'mobile');
  });

  await test('resolveSource: omitted (undefined) defaults to "web"', () => {
    assert.strictEqual(resolveSource(undefined), 'web');
  });

  await test('resolveSource: any other value is rejected', () => {
    assert.strictEqual(resolveSource('desktop'), null);
    assert.strictEqual(resolveSource(''), null);
    assert.strictEqual(resolveSource('Web'), null); // case-sensitive — not the allowed 'web'
  });

  // ── 2. findInitiatedPendingPayment lookup logic ──────────────────────
  await test('lookup: an initiated PendingPayment for the right customer is returned', async () => {
    const customer = await mkUser('LookupOK');
    const pp = await PendingPayment.create({
      gateway: 'khalti', gatewayRef: `pidx-${customer._id}`, customer: customer._id,
      orderData: { total: 1100 }, source: 'web',
    });
    cleanupIds.pendingPayments.push(pp._id);

    const { pendingPayment, error } = await findInitiatedPendingPayment(pp.gatewayRef, customer._id);
    assert.strictEqual(error, null);
    assert.ok(pendingPayment);
    assert.strictEqual(pendingPayment._id.toString(), pp._id.toString());
  }, cleanup);

  await test('lookup: unknown gatewayRef → "not found or expired"', async () => {
    const customer = await mkUser('LookupMissing');
    const { pendingPayment, error } = await findInitiatedPendingPayment('pidx-does-not-exist', customer._id);
    assert.strictEqual(pendingPayment, null);
    assert.strictEqual(error, 'Payment session not found or expired');
  }, cleanup);

  await test("lookup: right gatewayRef, WRONG customer → \"not found or expired\" (never leaks another customer's payment)", async () => {
    const owner = await mkUser('LookupOwner');
    const other = await mkUser('LookupOther');
    const pp = await PendingPayment.create({
      gateway: 'khalti', gatewayRef: `pidx-${owner._id}`, customer: owner._id,
      orderData: { total: 1100 }, source: 'web',
    });
    cleanupIds.pendingPayments.push(pp._id);

    const { pendingPayment, error } = await findInitiatedPendingPayment(pp.gatewayRef, other._id);
    assert.strictEqual(pendingPayment, null);
    assert.strictEqual(error, 'Payment session not found or expired');
  }, cleanup);

  await test('lookup: already-completed PendingPayment → "Payment already processed", distinct from not-found', async () => {
    const customer = await mkUser('LookupCompleted');
    const pp = await PendingPayment.create({
      gateway: 'khalti', gatewayRef: `pidx-${customer._id}`, customer: customer._id,
      orderData: { total: 1100 }, source: 'web', status: 'completed',
    });
    cleanupIds.pendingPayments.push(pp._id);

    const { pendingPayment, error } = await findInitiatedPendingPayment(pp.gatewayRef, customer._id);
    assert.strictEqual(pendingPayment, null);
    assert.strictEqual(error, 'Payment already processed');
  }, cleanup);

  await test('lookup: a previously-failed PendingPayment is not re-usable → "not found or expired"', async () => {
    const customer = await mkUser('LookupFailed');
    const pp = await PendingPayment.create({
      gateway: 'khalti', gatewayRef: `pidx-${customer._id}`, customer: customer._id,
      orderData: { total: 1100 }, source: 'web', status: 'failed',
    });
    cleanupIds.pendingPayments.push(pp._id);

    const { pendingPayment, error } = await findInitiatedPendingPayment(pp.gatewayRef, customer._id);
    assert.strictEqual(pendingPayment, null);
    assert.strictEqual(error, 'Payment session not found or expired');
  }, cleanup);

  // ── 3. Idempotent double-verify ──────────────────────────────────────
  await test('verifyKhalti: re-hitting verify for an already-completed pidx does NOT create a second order', async () => {
    const customer = await mkUser('DoubleVerify');
    const seller   = await mkUser('DoubleVerifySeller', 'seller');
    const product  = await mkProduct(seller._id, 'DoubleVerify');
    await mkCartWithItem(customer._id, product);

    // Stub Khalti's lookup call — always reports Completed, paid amount
    // matching the order total (Rs 1000 item + Rs 100 delivery = 1100) in
    // paisa. No other axios.post call is expected in this test.
    const originalPost = axios.post;
    axios.post = async (url) => {
      if (url.includes('/epayment/lookup/')) {
        return { data: { status: 'Completed', total_amount: 110000 } };
      }
      throw new Error(`Unexpected axios.post in test: ${url}`);
    };

    try {
      const pp = await PendingPayment.create({
        gateway: 'khalti',
        gatewayRef: `pidx-double-${customer._id}`,
        customer: customer._id,
        orderData: {
          deliveryAddress: address, customerNote: '', paymentMethod: 'khalti',
          couponCode: null, total: 1100,
        },
        source: 'web',
      });
      cleanupIds.pendingPayments.push(pp._id);

      const { res: r1, err: e1 } = await invoke(verifyKhalti, {
        user: { _id: customer._id }, body: { pidx: pp.gatewayRef },
      });
      assert.strictEqual(e1, null, `first verify threw: ${e1 && e1.message}`);
      assert.strictEqual(r1.statusCode, 200, `first verify failed: ${JSON.stringify(r1.body)}`);
      assert.ok(r1.body.order, 'first verify must return the created order');
      cleanupIds.orders.push(r1.body.order._id);
      const shipments1 = await Shipment.find({ order: r1.body.order._id });
      cleanupIds.shipments.push(...shipments1.map((s) => s._id));

      const afterFirst = await PendingPayment.findById(pp._id);
      assert.strictEqual(afterFirst.status, 'completed', 'PendingPayment must flip to completed on success');

      // Re-hit verify for the SAME pidx — must not create a second order.
      const { res: r2, err: e2 } = await invoke(verifyKhalti, {
        user: { _id: customer._id }, body: { pidx: pp.gatewayRef },
      });
      assert.strictEqual(r2.statusCode, 400, 'second verify must be rejected');
      assert.strictEqual(e2 && e2.message, 'Payment already processed');

      const totalOrders = await Order.countDocuments({ customer: customer._id });
      assert.strictEqual(totalOrders, 1, 'exactly one order must exist after double-verify');
    } finally {
      axios.post = originalPost;
    }
  }, cleanup);

  // ── 4. eSewa signing + mobile form-rebuild endpoint ──────────────────
  await test('buildEsewaSignature: HMAC-SHA256 over total_amount,transaction_uuid,product_code matches manual computation', () => {
    const crypto = require('crypto');
    const original = { merchant: process.env.ESEWA_MERCHANT_ID, secret: process.env.ESEWA_SECRET_KEY };
    process.env.ESEWA_MERCHANT_ID = 'EPAYTEST';
    process.env.ESEWA_SECRET_KEY  = 'test-secret-key';
    try {
      const signature = buildEsewaSignature(1100, 'NEPSHOP-abc-123');
      const message  = 'total_amount=1100,transaction_uuid=NEPSHOP-abc-123,product_code=EPAYTEST';
      const expected = crypto.createHmac('sha256', 'test-secret-key').update(message).digest('base64');
      assert.strictEqual(signature, expected);
    } finally {
      process.env.ESEWA_MERCHANT_ID = original.merchant;
      process.env.ESEWA_SECRET_KEY  = original.secret;
    }
  });

  await test('buildEsewaFormData: same inputs (as at initiate time vs. rebuild time) produce an identical signature — cannot drift, both call the one shared helper', () => {
    const original = { merchant: process.env.ESEWA_MERCHANT_ID, secret: process.env.ESEWA_SECRET_KEY, frontend: process.env.FRONTEND_URL };
    process.env.ESEWA_MERCHANT_ID = 'EPAYTEST';
    process.env.ESEWA_SECRET_KEY  = 'test-secret-key';
    process.env.FRONTEND_URL      = 'https://web.example.com';
    try {
      const atInitiate = buildEsewaFormData({ total: 1100, transactionUuid: 'NEPSHOP-abc-123', source: 'mobile' });
      const atRebuild  = buildEsewaFormData({ total: 1100, transactionUuid: 'NEPSHOP-abc-123', source: 'mobile' });
      assert.strictEqual(atInitiate.signature, atRebuild.signature);
      assert.strictEqual(atInitiate.total_amount, 1100);
      assert.strictEqual(atInitiate.success_url, 'https://web.example.com/payment/mobile-return/esewa');
      assert.strictEqual(atInitiate.failure_url, 'https://web.example.com/payment/mobile-return/failed');
    } finally {
      process.env.ESEWA_MERCHANT_ID = original.merchant;
      process.env.ESEWA_SECRET_KEY  = original.secret;
      process.env.FRONTEND_URL      = original.frontend;
    }
  });

  await test('esewaForm: initiated PendingPayment found → 200 html page containing the signed hidden fields', async () => {
    const customer = await mkUser('EsewaFormOK');
    const pp = await PendingPayment.create({
      gateway: 'esewa', gatewayRef: `esewa-form-ok-${customer._id}`, customer: customer._id,
      orderData: { deliveryAddress: address, customerNote: '', paymentMethod: 'esewa', couponCode: null, total: 1100 },
      source: 'mobile',
    });
    cleanupIds.pendingPayments.push(pp._id);

    const { res, err } = await invoke(esewaForm, { params: { transactionUuid: pp.gatewayRef } });
    assert.strictEqual(err, null, `esewaForm threw: ${err && err.message}`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.contentType, 'html');
    assert.ok(res.body.includes('name="transaction_uuid" value="' + pp.gatewayRef + '"'));
    assert.ok(res.body.includes('name="total_amount" value="1100"'));
    assert.ok(res.body.includes("document.getElementById('esewaForm').submit()"));
  }, cleanup);

  await test('esewaForm: unknown transactionUuid → 404 html "not found or expired" page (not JSON)', async () => {
    const { res, err } = await invoke(esewaForm, { params: { transactionUuid: 'does-not-exist' } });
    assert.strictEqual(err, null);
    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.contentType, 'html');
    assert.ok(res.body.includes('not found or expired'));
  });

  await test('esewaForm: a completed (already-used) PendingPayment is not re-servable → 404, same as unknown', async () => {
    const customer = await mkUser('EsewaFormCompleted');
    const pp = await PendingPayment.create({
      gateway: 'esewa', gatewayRef: `esewa-form-done-${customer._id}`, customer: customer._id,
      orderData: { deliveryAddress: address, customerNote: '', paymentMethod: 'esewa', couponCode: null, total: 1100 },
      source: 'mobile', status: 'completed',
    });
    cleanupIds.pendingPayments.push(pp._id);

    const { res } = await invoke(esewaForm, { params: { transactionUuid: pp.gatewayRef } });
    assert.strictEqual(res.statusCode, 404);
  }, cleanup);

  await mongoose.disconnect();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
};

run().catch((err) => { console.error('FATAL:', err); process.exit(1); });
