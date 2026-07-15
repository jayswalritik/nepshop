/**
 * ─────────────────────────────────────────────────────────────────────────────
 * couponRestore.test.js — run with: node backend/tests/couponRestore.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Integration tests for Coupon.restoreFor's usedBy-pull fix. Operates
 * directly on the Coupon model plus orderController.cancelShipmentByCustomer
 * — no return/payout controllers involved, so unlike returnReservation.test.js
 * / payoutsFixes.test.js this file triggers NO order-status emails (cancel
 * paths only email the seller — sendOrderCancelledToSeller — which is
 * allowed to fire; no return/payout emails are touched).
 * Requires MONGO_URI (reads backend/.env). Every test creates its own
 * throwaway Coupon/Order/Shipment/User documents and deletes them afterward.
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

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set — cannot run integration tests');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });

  const { cancelShipmentByCustomer } = require('../controllers/orderController');
  const { adminUpdateOrderStatus }   = require('../controllers/adminController');
  const Coupon   = require('../models/Coupon');
  const Order    = require('../models/Order');
  const Shipment = require('../models/Shipment');
  const User     = require('../models/User');
  const Product  = require('../models/Product');

  const cleanupIds = { coupons: [], orders: [], shipments: [], users: [], products: [] };

  const mkUser = async (role, tag) => {
    const u = await User.create({
      firstName: 'CouponDiag', lastName: tag,
      email: `coupondiag-${tag.toLowerCase()}-${new mongoose.Types.ObjectId()}@test.local`,
      phone: '9800000002',
      password: 'hashedpw-not-used-in-these-tests',
      role, emailVerified: true,
    });
    cleanupIds.users.push(u._id);
    return u;
  };

  const mkCoupon = async (tag, overrides = {}) => {
    const c = await Coupon.create({
      code: `DIAG-${tag}-${new mongoose.Types.ObjectId().toString().slice(-6).toUpperCase()}`,
      description: 'restore-fix diagnostic coupon',
      type: 'fixed',
      value: 50,
      usageLimit: null,
      perUserLimit: 1,
      usedCount: 0,
      usedBy: [],
      ...overrides,
    });
    cleanupIds.coupons.push(c._id);
    return c;
  };

  // Two-shipment order with a coupon already "redeemed" (state set directly,
  // not via redeemFor — this test is about restoreFor's cancel-triggered
  // path, not redemption itself).
  const mkTwoPackageOrder = async (customerId, sellerId, couponCode) => {
    const p1 = new mongoose.Types.ObjectId();
    const p2 = new mongoose.Types.ObjectId();

    const order = await Order.create({
      customer: customerId,
      items: [
        { product: p1, name: 'Item A', image: 'x', price: 500, quantity: 1, seller: sellerId },
        { product: p2, name: 'Item B', image: 'x', price: 300, quantity: 1, seller: sellerId },
      ],
      deliveryAddress: { fullName: 'Diag', phone: '9800000000', street: 'x', city: 'x', district: 'x' },
      paymentMethod: 'cash_on_delivery',
      paymentStatus: 'pending',
      subtotal: 800,
      deliveryCharge: 200,
      couponCode,
      couponDiscount: 50,
      total: 950,
    });
    cleanupIds.orders.push(order._id);

    const shipment1 = await Shipment.create({
      order: order._id, seller: sellerId,
      items: [{ product: p1, name: 'Item A', image: 'x', price: 500, quantity: 1 }],
      sellerSubtotal: 500, deliveryCharge: 100, commissionRate: 5, commissionAmount: 25,
      status: 'pending',
    });
    const shipment2 = await Shipment.create({
      order: order._id, seller: sellerId,
      items: [{ product: p2, name: 'Item B', image: 'x', price: 300, quantity: 1 }],
      sellerSubtotal: 300, deliveryCharge: 100, commissionRate: 5, commissionAmount: 15,
      status: 'pending',
    });
    cleanupIds.shipments.push(shipment1._id, shipment2._id);

    return { order, shipment1, shipment2 };
  };

  // Real Product docs (not throwaway ObjectIds) — needed wherever a test
  // asserts on stock, since cancelShipment restores stock by looking the
  // product up and $inc-ing it.
  const mkProduct = async (sellerId, stock, tag) => {
    const p = await Product.create({
      name: `CouponDiag Product ${tag}`,
      description: 'restore-fix diagnostic product',
      price: 500,
      category: 'Electronics',
      stock,
      seller: sellerId,
      images: [{ url: 'https://example.com/x.jpg', publicId: `diag-${tag}` }],
    });
    cleanupIds.products.push(p._id);
    return p;
  };

  // One order with N shipments, each in a caller-chosen status, each with
  // ONE real product line — for admin-cancel stock/refund/voucher tests.
  const mkAdminCancelOrder = async ({ customerId, sellerId, shipmentSpecs, paymentMethod = 'cash_on_delivery', paymentStatus = 'pending', couponCode = null }) => {
    const items = [];
    const productsByTag = {};
    for (const spec of shipmentSpecs) {
      const product = await mkProduct(sellerId, spec.startStock, spec.tag);
      productsByTag[spec.tag] = product;
      items.push({ product: product._id, name: `Item ${spec.tag}`, image: 'x', price: spec.price, quantity: spec.quantity, seller: sellerId });
    }
    const subtotal = shipmentSpecs.reduce((s, sp) => s + sp.price * sp.quantity, 0);
    const deliveryCharge = shipmentSpecs.length * 100;

    const order = await Order.create({
      customer: customerId,
      items,
      deliveryAddress: { fullName: 'Diag', phone: '9800000000', street: 'x', city: 'x', district: 'x' },
      paymentMethod,
      paymentStatus,
      subtotal,
      deliveryCharge,
      couponCode,
      couponDiscount: couponCode ? 50 : 0,
      total: subtotal + deliveryCharge - (couponCode ? 50 : 0),
    });
    cleanupIds.orders.push(order._id);

    const shipments = {};
    for (const spec of shipmentSpecs) {
      const product = productsByTag[spec.tag];
      const shipment = await Shipment.create({
        order: order._id, seller: sellerId,
        items: [{ product: product._id, name: `Item ${spec.tag}`, image: 'x', price: spec.price, quantity: spec.quantity, couponAllocation: spec.couponAllocation || 0 }],
        sellerSubtotal: spec.price * spec.quantity, deliveryCharge: 100, commissionRate: 5,
        commissionAmount: round2(spec.price * spec.quantity * 0.05),
        couponAllocation: spec.couponAllocation || 0,
        status: spec.status,
      });
      cleanupIds.shipments.push(shipment._id);
      shipments[spec.tag] = shipment;
    }

    return { order, shipments, products: productsByTag };
  };

  const round2 = (n) => +Number(n).toFixed(2);

  const cleanup = async () => {
    await Coupon.deleteMany({ _id: { $in: cleanupIds.coupons } });
    await Shipment.deleteMany({ _id: { $in: cleanupIds.shipments } });
    await Order.deleteMany({ _id: { $in: cleanupIds.orders } });
    await User.deleteMany({ _id: { $in: cleanupIds.users } });
    await Product.deleteMany({ _id: { $in: cleanupIds.products } });
    cleanupIds.coupons = []; cleanupIds.shipments = []; cleanupIds.orders = []; cleanupIds.users = []; cleanupIds.products = [];
  };

  const usedByEntry = (coupon, userId) =>
    (coupon.usedBy || []).find((u) => u.user?.toString() === userId.toString());

  // ── 1. Sequential two-package cancel → full restore, entry pulled ──────
  await test('sequential two-package cancel: usedCount reverts to 0 AND user is pulled from usedBy', async () => {
    const customer = await mkUser('customer', 'Cust');
    const seller    = await mkUser('seller', 'Seller');
    const coupon    = await mkCoupon('SEQ');

    coupon.usedCount = 1;
    coupon.usedBy    = [{ user: customer._id, count: 1 }];
    await coupon.save();

    const { shipment1, shipment2 } = await mkTwoPackageOrder(customer._id, seller._id, coupon.code);

    const { res: r1, err: e1 } = await invoke(cancelShipmentByCustomer, {
      user: { _id: customer._id }, params: { shipmentId: shipment1._id },
    });
    assert.strictEqual(e1, null, `first cancel threw: ${e1 && e1.message}`);
    assert.strictEqual(r1.statusCode, 200, `first cancel failed: ${JSON.stringify(r1.body)}`);

    // Order not fully cancelled yet (shipment2 still pending) — coupon must
    // be UNTOUCHED (this is what makes the bug "sequential", not one-shot).
    let mid = await Coupon.findById(coupon._id);
    assert.strictEqual(mid.usedCount, 1, 'coupon must not be restored until the WHOLE order is cancelled');
    assert.ok(usedByEntry(mid, customer._id), 'usedBy entry must still exist before the order is fully cancelled');

    const { res: r2, err: e2 } = await invoke(cancelShipmentByCustomer, {
      user: { _id: customer._id }, params: { shipmentId: shipment2._id },
    });
    assert.strictEqual(e2, null, `second cancel threw: ${e2 && e2.message}`);
    assert.strictEqual(r2.statusCode, 200, `second cancel failed: ${JSON.stringify(r2.body)}`);

    const after = await Coupon.findById(coupon._id);
    assert.strictEqual(after.usedCount, 0, 'usedCount must revert to 0 once the order is fully cancelled');
    assert.strictEqual(usedByEntry(after, customer._id), undefined, 'customer must be PULLED from usedBy, not left with count 0');

  }, cleanup);

  // ── 2. Idempotency — double restore ─────────────────────────────────────
  await test('restoreFor is idempotent: calling it twice does not double-decrement or corrupt usedBy', async () => {
    const customer = await mkUser('customer', 'Cust');
    const coupon    = await mkCoupon('IDEMP');
    coupon.usedCount = 1;
    coupon.usedBy    = [{ user: customer._id, count: 1 }];
    await coupon.save();

    await Coupon.restoreFor(coupon.code, customer._id);
    const once = await Coupon.findById(coupon._id);
    assert.strictEqual(once.usedCount, 0);
    assert.strictEqual(usedByEntry(once, customer._id), undefined);

    // Second call — nothing left to restore; must not go negative or throw.
    await Coupon.restoreFor(coupon.code, customer._id);
    const twice = await Coupon.findById(coupon._id);
    assert.strictEqual(twice.usedCount, 0, 'usedCount must not go negative on a second restore');
    assert.strictEqual(usedByEntry(twice, customer._id), undefined, 'usedBy must stay clean, not re-corrupted');

  }, cleanup);

  // ── 3. Redeem-after-restore succeeds for the same user ──────────────────
  await test('redeemFor succeeds for the same user after restoreFor (no phantom entry blocking them)', async () => {
    const customer = await mkUser('customer', 'Cust');
    const coupon    = await mkCoupon('REDEEM');
    coupon.usedCount = 1;
    coupon.usedBy    = [{ user: customer._id, count: 1 }];
    await coupon.save();

    await Coupon.restoreFor(coupon.code, customer._id);

    const redemption = await Coupon.redeemFor(coupon.code, customer._id, 1000);
    assert.strictEqual(redemption.ok, true, `redeem-after-restore must succeed: ${redemption.message}`);

    const after = await Coupon.findById(coupon._id);
    assert.strictEqual(after.usedCount, 1, 'fresh redemption after restore must count exactly once');
    const entry = usedByEntry(after, customer._id);
    assert.ok(entry, 'usedBy must have a fresh entry for this user');
    assert.strictEqual(entry.count, 1, 'fresh entry count must be exactly 1, not stacked on a stale value');

  }, cleanup);

  // ── 4. Admin cancel restores stock for every non-terminal shipment,
  // including a LATE-STATE one ('packed') the customer path never reaches ──
  await test('admin order-cancel restores stock for every non-terminal shipment (pending AND packed)', async () => {
    const customer = await mkUser('customer', 'Cust');
    const seller    = await mkUser('seller', 'Seller');
    const { order, shipments, products } = await mkAdminCancelOrder({
      customerId: customer._id, sellerId: seller._id,
      shipmentSpecs: [
        { tag: 'A', status: 'pending', startStock: 5, price: 500, quantity: 2 },
        { tag: 'B', status: 'packed',  startStock: 5, price: 300, quantity: 3 },
      ],
    });

    const { res, err } = await invoke(adminUpdateOrderStatus, {
      params: { id: order._id }, body: { status: 'cancelled' },
    });
    assert.strictEqual(err, null, `admin cancel threw: ${err && err.message}`);
    assert.strictEqual(res.statusCode, 200, `admin cancel failed: ${JSON.stringify(res.body)}`);

    const productA = await Product.findById(products.A._id);
    const productB = await Product.findById(products.B._id);
    assert.strictEqual(productA.stock, 7, 'pending shipment: stock must be restored (5 + 2)');
    assert.strictEqual(productB.stock, 8, 'packed shipment (late state): stock must ALSO be restored (5 + 3)');

    const shipA = await Shipment.findById(shipments.A._id);
    const shipB = await Shipment.findById(shipments.B._id);
    assert.strictEqual(shipA.status, 'cancelled');
    assert.strictEqual(shipB.status, 'cancelled');

  }, cleanup);

  // ── 5. Admin cancel of the whole (only) order restores the voucher ──────
  await test('admin cancel restores the voucher (usedCount and usedBy) once the whole order is cancelled', async () => {
    const customer = await mkUser('customer', 'Cust');
    const seller    = await mkUser('seller', 'Seller');
    const coupon    = await mkCoupon('ADMIN-SEQ');
    coupon.usedCount = 1;
    coupon.usedBy    = [{ user: customer._id, count: 1 }];
    await coupon.save();

    const { order } = await mkAdminCancelOrder({
      customerId: customer._id, sellerId: seller._id, couponCode: coupon.code,
      shipmentSpecs: [
        { tag: 'A', status: 'pending',   startStock: 5, price: 500, quantity: 1, couponAllocation: 33.33 },
        { tag: 'B', status: 'confirmed', startStock: 5, price: 300, quantity: 1, couponAllocation: 16.67 },
      ],
    });

    const { res, err } = await invoke(adminUpdateOrderStatus, {
      params: { id: order._id }, body: { status: 'cancelled' },
    });
    assert.strictEqual(err, null, `admin cancel threw: ${err && err.message}`);
    assert.strictEqual(res.statusCode, 200);

    const after = await Coupon.findById(coupon._id);
    assert.strictEqual(after.usedCount, 0, 'usedCount must revert once the admin cancel fully cancels the order');
    assert.strictEqual(usedByEntry(after, customer._id), undefined, 'customer must be pulled from usedBy');

  }, cleanup);

  // ── 6. Double admin-cancel does not double-restore stock ────────────────
  await test('double admin-cancel does not double-restore stock', async () => {
    const customer = await mkUser('customer', 'Cust');
    const seller    = await mkUser('seller', 'Seller');
    const { order, products } = await mkAdminCancelOrder({
      customerId: customer._id, sellerId: seller._id,
      shipmentSpecs: [{ tag: 'A', status: 'pending', startStock: 5, price: 500, quantity: 2 }],
    });

    const first  = await invoke(adminUpdateOrderStatus, { params: { id: order._id }, body: { status: 'cancelled' } });
    assert.strictEqual(first.res.statusCode, 200);
    const second = await invoke(adminUpdateOrderStatus, { params: { id: order._id }, body: { status: 'cancelled' } });
    assert.strictEqual(second.res.statusCode, 200, 're-cancelling an already-cancelled order must not error');

    const product = await Product.findById(products.A._id);
    assert.strictEqual(product.stock, 7, 'stock must be restored exactly once (5 + 2), not twice (9)');

  }, cleanup);

  // ── 7. Paid-order admin cancel records refund fields ─────────────────────
  await test('paid-order admin cancel records refund fields (shipment AND order level)', async () => {
    const customer = await mkUser('customer', 'Cust');
    const seller    = await mkUser('seller', 'Seller');
    const { order, shipments } = await mkAdminCancelOrder({
      customerId: customer._id, sellerId: seller._id,
      paymentMethod: 'khalti', paymentStatus: 'paid',
      shipmentSpecs: [{ tag: 'A', status: 'pending', startStock: 5, price: 500, quantity: 1, couponAllocation: 0 }],
    });

    const { res, err } = await invoke(adminUpdateOrderStatus, {
      params: { id: order._id }, body: { status: 'cancelled' },
    });
    assert.strictEqual(err, null, `admin cancel threw: ${err && err.message}`);
    assert.strictEqual(res.statusCode, 200);

    const shipment = await Shipment.findById(shipments.A._id);
    assert.strictEqual(shipment.settlement.status, 'refunded', 'shipment settlement must flip to refunded');
    assert.strictEqual(shipment.settlement.refundToCustomer, 600, 'refund = sellerSubtotal(500) + deliveryCharge(100) - couponAllocation(0)');

    const updatedOrder = await Order.findById(order._id);
    assert.strictEqual(updatedOrder.paymentStatus, 'refunded', 'order-level paymentStatus must flip once fully cancelled');
    assert.strictEqual(updatedOrder.settlement.refundToCustomer, updatedOrder.total, 'order-level refund equals the order total');

  }, cleanup);

  await mongoose.disconnect();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
};

run().catch((err) => { console.error('FATAL:', err); process.exit(1); });
