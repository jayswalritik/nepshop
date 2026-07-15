/**
 * ─────────────────────────────────────────────────────────────────────────────
 * returnReservation.test.js — run with: node backend/tests/returnReservation.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Integration tests for the return REQUEST/REJECT reservation logic in
 * backend/controllers/returnController.js (requestReturn, processReturn,
 * releaseReservation). This logic reads/writes MongoDB atomically and is not
 * a pure function like backend/utils/returnMath.js, so it isn't unit-testable
 * in settlementMath.test.js's no-DB style — this is a sibling integration
 * suite instead. Requires MONGO_URI (reads backend/.env, same as the other
 * backend scripts). Every test creates its own throwaway Order/Shipment/User
 * documents and deletes them afterward — nothing here touches real data.
 *
 * Exercises the REAL exported Express handlers (requestReturn, processReturn)
 * via lightweight req/res mocks, not a reimplementation of their logic — so
 * these tests fail if the controller code drifts, not just if a copy of it
 * does.
 *
 * Covers:
 *   1. Reservation success reserves exactly the requested quantity.
 *   2. Reservation failure (over-request) creates NO Return document and
 *      leaves returnedQuantity unchanged.
 *   3. Two-tab race for the last unit: exactly one request succeeds, the
 *      other is cleanly rejected, returnedQuantity never exceeds quantity,
 *      exactly one Return document exists.
 *   4. Reject floors at 0 — releasing a reservation that (hypothetically)
 *      was never actually taken cannot drive returnedQuantity negative.
 *   5. End-to-end money regression: request -> approve -> pickup -> complete
 *      for the standard cable-qty-1 seller-fault worked example still
 *      produces the exact figures (sellerReversal 190, commissionReversal
 *      10, voucherReclaimed 10.53, refundToCustomer 189.47) — proves the
 *      new reservation path doesn't corrupt anything returnMath.js consumes.
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

const test = async (name, fn) => {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(`   ${err.message}`);
    failed++;
  }
};

// Minimal fake Express res — captures status/json like the real thing.
const fakeRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
};

// asyncHandler-wrapped controllers throw on error instead of calling next() —
// invoking them directly means we must catch that throw ourselves.
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

  const { requestReturn, processReturn, markReturnPickedUp, completeReturn } = require('../controllers/returnController');
  const Order = require('../models/Order');
  const Shipment = require('../models/Shipment');
  const Return = require('../models/Return');
  const User = require('../models/User');

  const cleanupIds = { orders: [], shipments: [], returns: [], users: [] };

  const mkCustomer = async () => {
    const u = await User.create({
      firstName: 'Diag', lastName: 'Customer',
      email: `diag-${new mongoose.Types.ObjectId()}@test.local`,
      phone: '9800000001',
      password: 'hashedpw-not-used-in-these-tests',
      role: 'customer', emailVerified: true,
    });
    cleanupIds.users.push(u._id);
    return u;
  };

  // Standard worked example: Headphone Rs1000 x1, Cable Rs200 x2, Rs100
  // voucher already allocated (headphone 52.63, cable line 21.06 -> 10.53/unit).
  const mkOrderAndShipment = async (customerId, { headphoneRq = 0, cableRq = 0 } = {}) => {
    const hpId = new mongoose.Types.ObjectId();
    const cbId = new mongoose.Types.ObjectId();
    const sellerId = new mongoose.Types.ObjectId();

    const order = await Order.create({
      customer: customerId,
      items: [
        { product: hpId, name: 'Headphone', image: 'x', price: 1000, quantity: 1, seller: sellerId, couponAllocation: 52.63 },
        { product: cbId, name: 'Cable', image: 'x', price: 200, quantity: 2, seller: sellerId, couponAllocation: 21.06 },
      ],
      deliveryAddress: { fullName: 'Diag', phone: '9800000000', street: 'x', city: 'x', district: 'x' },
      paymentMethod: 'cash_on_delivery',
      paymentStatus: 'paid',
      subtotal: 1400,
      deliveryCharge: 200,
      total: 1600,
    });
    cleanupIds.orders.push(order._id);

    const shipment = await Shipment.create({
      order: order._id,
      seller: sellerId,
      items: [
        { product: hpId, name: 'Headphone', image: 'x', price: 1000, quantity: 1, couponAllocation: 52.63, returnedQuantity: headphoneRq },
        { product: cbId, name: 'Cable', image: 'x', price: 200, quantity: 2, couponAllocation: 21.06, returnedQuantity: cableRq },
      ],
      sellerSubtotal: 1400,
      deliveryCharge: 100,
      commissionRate: 5,
      status: 'delivered',
      deliveredAt: new Date(),
      settlement: { sellerShare: 1330, status: 'partial' },
    });
    cleanupIds.shipments.push(shipment._id);
    return { order, shipment, hpId, cbId };
  };

  const cleanup = async () => {
    await Return.deleteMany({ _id: { $in: cleanupIds.returns } });
    await Shipment.deleteMany({ _id: { $in: cleanupIds.shipments } });
    await Order.deleteMany({ _id: { $in: cleanupIds.orders } });
    await User.deleteMany({ _id: { $in: cleanupIds.users } });
    cleanupIds.returns = []; cleanupIds.shipments = []; cleanupIds.orders = []; cleanupIds.users = [];
  };

  // ── 1. Reservation success reserves exactly the requested quantity ──────
  await test('reservation success reserves exactly the requested quantity', async () => {
    const customer = await mkCustomer();
    const { shipment, cbId } = await mkOrderAndShipment(customer._id);

    const req = { user: { _id: customer._id }, body: { shipmentId: shipment._id, items: [{ product: cbId, quantity: 1 }], reason: 'Changed my mind' } };
    const { res, err } = await invoke(requestReturn, req);
    assert.strictEqual(err, null, `requestReturn threw: ${err && err.message}`);
    assert.strictEqual(res.statusCode, 201);
    if (res.body.return) cleanupIds.returns.push(res.body.return._id);

    const after = await Shipment.findById(shipment._id);
    const cableLine = after.items.find(i => i.product.toString() === cbId.toString());
    assert.strictEqual(cableLine.returnedQuantity, 1, 'cable returnedQuantity must be exactly 1 after reserving 1');

    const returnCount = await Return.countDocuments({ shipment: shipment._id });
    assert.strictEqual(returnCount, 1);

    await cleanup();
  });

  // ── 2. Reservation failure creates NO Return doc ────────────────────────
  await test('over-request creates no Return document and leaves returnedQuantity unchanged', async () => {
    const customer = await mkCustomer();
    const { shipment, cbId } = await mkOrderAndShipment(customer._id);

    const req = { user: { _id: customer._id }, body: { shipmentId: shipment._id, items: [{ product: cbId, quantity: 5 }], reason: 'Changed my mind' } };
    const { res, err } = await invoke(requestReturn, req);
    assert.ok(err, 'expected requestReturn to throw a 400 for an over-request');
    assert.strictEqual(res.statusCode, 400);

    const after = await Shipment.findById(shipment._id);
    const cableLine = after.items.find(i => i.product.toString() === cbId.toString());
    assert.strictEqual(cableLine.returnedQuantity, 0, 'returnedQuantity must be unchanged after a blocked request');

    const returnCount = await Return.countDocuments({ shipment: shipment._id });
    assert.strictEqual(returnCount, 0, 'no Return document may exist for a request the reservation blocked');

    await cleanup();
  });

  // ── 3. Two-tab race for the last unit ───────────────────────────────────
  await test('two-tab race for the last unit: exactly one succeeds, returnedQuantity never exceeds quantity', async () => {
    const customer = await mkCustomer();
    // Cable already has 1 of 2 reserved — exactly ONE more unit is returnable.
    const { shipment, cbId } = await mkOrderAndShipment(customer._id, { cableRq: 1 });

    const mkReq = () => ({ user: { _id: customer._id }, body: { shipmentId: shipment._id, items: [{ product: cbId, quantity: 1 }], reason: 'Changed my mind' } });
    const [a, b] = await Promise.all([invoke(requestReturn, mkReq()), invoke(requestReturn, mkReq())]);

    const outcomes = [a, b];
    const successes = outcomes.filter(o => o.res.statusCode === 201);
    const failures  = outcomes.filter(o => o.res.statusCode === 400);
    assert.strictEqual(successes.length, 1, 'exactly one of the two concurrent requests must succeed');
    assert.strictEqual(failures.length, 1, 'exactly one of the two concurrent requests must be cleanly rejected');

    for (const s of successes) if (s.res.body.return) cleanupIds.returns.push(s.res.body.return._id);

    const after = await Shipment.findById(shipment._id);
    const cableLine = after.items.find(i => i.product.toString() === cbId.toString());
    assert.strictEqual(cableLine.returnedQuantity, 2, 'returnedQuantity must land exactly at quantity, never beyond');

    const returnCount = await Return.countDocuments({ shipment: shipment._id });
    assert.strictEqual(returnCount, 1, 'exactly one Return document must exist — the loser must be orphan-free');

    await cleanup();
  });

  // ── 4. Reject floors at 0, never negative ───────────────────────────────
  await test('reject floors returnedQuantity at 0 — cannot go negative even releasing an unreserved return', async () => {
    const customer = await mkCustomer();
    // headphoneRq = 0 — this simulates the orphaned-return precondition
    // directly: a pending Return exists whose reservation never landed.
    const { shipment, hpId } = await mkOrderAndShipment(customer._id, { headphoneRq: 0 });

    const orphan = await Return.create({
      order: shipment.order, shipment: shipment._id, seller: shipment.seller, customer: customer._id,
      items: [{ product: hpId, name: 'Headphone', image: 'x', price: 1000, quantity: 1, couponAllocation: 0 }],
      reason: 'Changed my mind',
    });
    cleanupIds.returns.push(orphan._id);

    const req = { user: { _id: customer._id }, body: { status: 'rejected', adminNote: 'diag' }, params: { id: orphan._id } };
    const { res, err } = await invoke(processReturn, req);
    assert.strictEqual(err, null, `processReturn(reject) threw: ${err && err.message}`);
    assert.strictEqual(res.statusCode, 200);

    const after = await Shipment.findById(shipment._id);
    const hpLine = after.items.find(i => i.product.toString() === hpId.toString());
    assert.strictEqual(hpLine.returnedQuantity, 0, 'returnedQuantity must floor at 0, never go negative');

    await cleanup();
  });

  // ── 5. End-to-end money regression ──────────────────────────────────────
  await test('end-to-end: cable x1 seller-fault still produces the exact worked-example figures', async () => {
    const customer = await mkCustomer();
    const agent = await User.create({
      firstName: 'Diag', lastName: 'Agent', email: `diag-agent-${new mongoose.Types.ObjectId()}@test.local`,
      phone: '9800000002',
      password: 'hashedpw-not-used-in-these-tests', role: 'delivery', emailVerified: true,
    });
    cleanupIds.users.push(agent._id);
    const { shipment, cbId } = await mkOrderAndShipment(customer._id);

    const reqReturn = { user: { _id: customer._id }, body: { shipmentId: shipment._id, items: [{ product: cbId, quantity: 1 }], reason: 'Damaged product' } };
    const { res: r1 } = await invoke(requestReturn, reqReturn);
    assert.strictEqual(r1.statusCode, 201);
    const returnId = r1.body.return._id;
    cleanupIds.returns.push(returnId);

    const reqApprove = { user: { _id: new mongoose.Types.ObjectId() }, body: { status: 'approved', fault: 'seller', returnAgentId: agent._id }, params: { id: returnId } };
    const { res: r2, err: e2 } = await invoke(processReturn, reqApprove);
    assert.strictEqual(e2, null, `approve threw: ${e2 && e2.message}`);
    assert.strictEqual(r2.statusCode, 200);

    const reqPickup = { user: { _id: agent._id }, params: { id: returnId } };
    const { res: r3, err: e3 } = await invoke(markReturnPickedUp, reqPickup);
    assert.strictEqual(e3, null, `pickup threw: ${e3 && e3.message}`);
    assert.strictEqual(r3.statusCode, 200);

    const reqComplete = { user: { _id: agent._id }, params: { id: returnId } };
    const { res: r4, err: e4 } = await invoke(completeReturn, reqComplete);
    assert.strictEqual(e4, null, `complete threw: ${e4 && e4.message}`);
    assert.strictEqual(r4.statusCode, 200);

    const finalReturn = await Return.findById(returnId);
    assert.strictEqual(finalReturn.sellerReversal, 190);
    assert.strictEqual(finalReturn.commissionReversal, 10);
    assert.strictEqual(finalReturn.voucherReclaimed, 10.53);
    assert.strictEqual(finalReturn.refundToCustomer, 189.47);
    assert.strictEqual(finalReturn.fullShipmentReturn, false);

    await cleanup();
  });

  // ── 6. Pinned production failure: a fully-returned sibling line must NOT
  // block a request on an untouched line ──────────────────────────────────
  await test('production repro: line B fully returned (rq==quantity) does not block a fresh request on line A', async () => {
    const customer = await mkCustomer();
    // Headphone (line A): quantity 1, returnedQuantity 0 — untouched.
    // Cable (line B): quantity 2, returnedQuantity 2 — fully returned.
    // This is the exact live-incident precondition: the old shipment-wide
    // $allElementsTrue gate (checking EVERY line, not just the requested
    // one) would still have passed here (2<=2 is true) — so this alone
    // wasn't the live bug — but it's the precise shape of shipment state
    // the incident occurred on, and pins that a fully-returned sibling line
    // can never, now or in a future regression, block an unrelated line.
    const { shipment, hpId } = await mkOrderAndShipment(customer._id, { headphoneRq: 0, cableRq: 2 });

    const req = { user: { _id: customer._id }, body: { shipmentId: shipment._id, items: [{ product: hpId, quantity: 1 }], reason: 'Changed my mind' } };
    const { res, err } = await invoke(requestReturn, req);
    assert.strictEqual(err, null, `requestReturn threw: ${err && err.message}`);
    assert.strictEqual(res.statusCode, 201, 'a request on an untouched line must succeed regardless of a fully-returned sibling line');
    if (res.body.return) cleanupIds.returns.push(res.body.return._id);

    const after = await Shipment.findById(shipment._id);
    const hpLine = after.items.find(i => i.product.toString() === hpId.toString());
    assert.strictEqual(hpLine.returnedQuantity, 1, 'headphone returnedQuantity must be exactly 1 — reserved, not blocked');

    const returnCount = await Return.countDocuments({ shipment: shipment._id });
    assert.strictEqual(returnCount, 1);

    await cleanup();
  });

  // ── 7. Double-reject race: exactly one release, never two ──────────────
  await test('double reject on the same pending return: exactly one succeeds, returnedQuantity decrements exactly once', async () => {
    const customer = await mkCustomer();
    const { shipment, cbId } = await mkOrderAndShipment(customer._id);

    const reqReturn = { user: { _id: customer._id }, body: { shipmentId: shipment._id, items: [{ product: cbId, quantity: 1 }], reason: 'Changed my mind' } };
    const { res: r1 } = await invoke(requestReturn, reqReturn);
    assert.strictEqual(r1.statusCode, 201);
    const returnId = r1.body.return._id;
    cleanupIds.returns.push(returnId);

    const afterRequest = await Shipment.findById(shipment._id);
    const cableAfterRequest = afterRequest.items.find(i => i.product.toString() === cbId.toString());
    assert.strictEqual(cableAfterRequest.returnedQuantity, 1, 'sanity check: reservation landed before racing the reject');

    const mkRejectReq = () => ({ user: { _id: new mongoose.Types.ObjectId() }, body: { status: 'rejected', adminNote: 'diag' }, params: { id: returnId } });
    const [a, b] = await Promise.all([invoke(processReturn, mkRejectReq()), invoke(processReturn, mkRejectReq())]);

    const outcomes = [a, b];
    const successes = outcomes.filter(o => o.res.statusCode === 200);
    const conflicts = outcomes.filter(o => o.res.statusCode === 400);
    assert.strictEqual(successes.length, 1, 'exactly one of the two concurrent reject calls must succeed');
    assert.strictEqual(conflicts.length, 1, 'the other must be cleanly rejected as already-processed, not silently double-applied');

    const finalReturn = await Return.findById(returnId);
    assert.strictEqual(finalReturn.status, 'rejected');

    const afterReject = await Shipment.findById(shipment._id);
    const cableAfterReject = afterReject.items.find(i => i.product.toString() === cbId.toString());
    assert.strictEqual(cableAfterReject.returnedQuantity, 0, 'the reservation must be released exactly once — not decremented twice');

    await cleanup();
  });

  await mongoose.disconnect();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
};

run().catch((err) => { console.error('FATAL:', err); process.exit(1); });
