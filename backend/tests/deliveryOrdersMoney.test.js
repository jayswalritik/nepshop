/**
 * ─────────────────────────────────────────────────────────────────────────────
 * deliveryOrdersMoney.test.js — run with: node backend/tests/deliveryOrdersMoney.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Integration tests for GET /api/delivery/orders's money enrichment
 * (backend/controllers/deliveryController.js's getDeliveryOrders), added so
 * the web Dashboard.jsx (and later, mobile) can stop recomputing the
 * voucher-aware collect amount client-side. New suite — none of the existing
 * eight touch deliveryController.js or this endpoint's response shape.
 * Modeled on authAdminGuards.test.js's DB-integration pattern (real
 * throwaway User/Order/Shipment documents, invoke the real controller
 * function directly) rather than a pure-function mirror like
 * settlementMath.test.js, because the deliveryEarnings/deliveredCount
 * scoping requirement below can only be proven against real per-agent,
 * per-status Shipment documents in Mongo — a hand-rolled mirror of the
 * aggregation pipeline would just re-assert its own syntax, not prove the
 * real pipeline filters correctly.
 *
 * Requires MONGO_URI (reads backend/.env). Every test creates its own
 * throwaway User/Order/Shipment documents and deletes them afterward.
 *
 * Covers:
 *   1-3. The three worked examples from the money-model spec, through the
 *        actual enriched shipments[].customerPayable / .packageValue.
 *   4. deliveryEarnings/deliveredCount sum ONLY this agent's DELIVERED
 *      shipments — a second agent's delivered shipment and this agent's own
 *      non-delivered (dispatched) shipment must both be excluded.
 *   5. customerPayable with couponAllocation missing (schema default) vs.
 *      explicit 0 — both must equal packageValue (no voucher either way).
 *   6. Enrichment is response-only — re-fetching the shipment from Mongo
 *      afterward shows no persisted trace of it (nothing was .save()'d).
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

  const { getDeliveryOrders } = require('../controllers/deliveryController');
  const User     = require('../models/User');
  const Order    = require('../models/Order');
  const Shipment = require('../models/Shipment');

  const cleanupIds = { users: [], orders: [], shipments: [] };

  const mkUser = async (role, tag) => {
    const u = await User.create({
      firstName: 'DelivDiag', lastName: tag,
      email: `delivdiag-${tag.toLowerCase()}-${new mongoose.Types.ObjectId()}@test.local`,
      phone: '9800000004',
      password: 'hashedpw-not-used-in-these-tests',
      role, status: 'active',
    });
    cleanupIds.users.push(u._id);
    return u;
  };

  const mkShipment = async ({ customerId, sellerId, agentId, sellerSubtotal, deliveryCharge, couponAllocation, status, deliveryEarning = 50 }) => {
    const p1 = new mongoose.Types.ObjectId();
    const order = await Order.create({
      customer: customerId,
      items: [{ product: p1, name: 'Item', image: 'x', price: sellerSubtotal, quantity: 1, seller: sellerId }],
      deliveryAddress: { fullName: 'Diag', phone: '9800000000', street: 'x', city: 'x', district: 'x' },
      paymentMethod: 'cash_on_delivery', paymentStatus: 'pending',
      subtotal: sellerSubtotal, deliveryCharge, total: sellerSubtotal + deliveryCharge,
    });
    cleanupIds.orders.push(order._id);

    const shipmentData = {
      order: order._id, seller: sellerId, deliveryAgent: agentId,
      items: [{ product: p1, name: 'Item', image: 'x', price: sellerSubtotal, quantity: 1 }],
      sellerSubtotal, deliveryCharge, deliveryEarning, status,
    };
    // Intentionally omitted when undefined — proves the schema default (0)
    // behaves the same as an explicit 0 (see test 5 below).
    if (couponAllocation !== undefined) shipmentData.couponAllocation = couponAllocation;

    const shipment = await Shipment.create(shipmentData);
    cleanupIds.shipments.push(shipment._id);
    return { order, shipment };
  };

  const cleanup = async () => {
    await Shipment.deleteMany({ _id: { $in: cleanupIds.shipments } });
    await Order.deleteMany({ _id: { $in: cleanupIds.orders } });
    await User.deleteMany({ _id: { $in: cleanupIds.users } });
    cleanupIds.users = []; cleanupIds.orders = []; cleanupIds.shipments = [];
  };

  // ── Worked examples 1-3 (money-model spec) ───────────────────────────────
  await test('E1: subtotal 1000, delivery 100, no coupon → customerPayable 1100, packageValue 1100', async () => {
    const customer = await mkUser('customer', 'Cust1');
    const seller   = await mkUser('seller', 'Sell1');
    const agent    = await mkUser('delivery', 'Agent1');
    await mkShipment({ customerId: customer._id, sellerId: seller._id, agentId: agent._id, sellerSubtotal: 1000, deliveryCharge: 100, status: 'dispatched' });

    const { res, err } = await invoke(getDeliveryOrders, { user: agent });
    assert.strictEqual(err, null);
    assert.strictEqual(res.body.shipments.length, 1);
    assert.strictEqual(res.body.shipments[0].customerPayable, 1100);
    assert.strictEqual(res.body.shipments[0].packageValue, 1100);
  }, cleanup);

  await test('E2: subtotal 2500, delivery 0 (free ≥2000), coupon 300 → customerPayable 2200, packageValue 2500', async () => {
    const customer = await mkUser('customer', 'Cust2');
    const seller   = await mkUser('seller', 'Sell2');
    const agent    = await mkUser('delivery', 'Agent2');
    await mkShipment({ customerId: customer._id, sellerId: seller._id, agentId: agent._id, sellerSubtotal: 2500, deliveryCharge: 0, couponAllocation: 300, status: 'dispatched' });

    const { res, err } = await invoke(getDeliveryOrders, { user: agent });
    assert.strictEqual(err, null);
    assert.strictEqual(res.body.shipments[0].customerPayable, 2200);
    assert.strictEqual(res.body.shipments[0].packageValue, 2500);
  }, cleanup);

  await test('E3: subtotal 1000, delivery 100, coupon 150 → customerPayable 950, packageValue 1100', async () => {
    const customer = await mkUser('customer', 'Cust3');
    const seller   = await mkUser('seller', 'Sell3');
    const agent    = await mkUser('delivery', 'Agent3');
    await mkShipment({ customerId: customer._id, sellerId: seller._id, agentId: agent._id, sellerSubtotal: 1000, deliveryCharge: 100, couponAllocation: 150, status: 'dispatched' });

    const { res, err } = await invoke(getDeliveryOrders, { user: agent });
    assert.strictEqual(err, null);
    assert.strictEqual(res.body.shipments[0].customerPayable, 950);
    assert.strictEqual(res.body.shipments[0].packageValue, 1100);
  }, cleanup);

  // ── deliveryEarnings/deliveredCount scoping ──────────────────────────────
  await test('deliveryEarnings/deliveredCount: sums ONLY this agent\'s DELIVERED shipments', async () => {
    const customer = await mkUser('customer', 'Cust4');
    const seller   = await mkUser('seller', 'Sell4');
    const agentA   = await mkUser('delivery', 'AgentA');
    const agentB   = await mkUser('delivery', 'AgentB');

    // AgentA: two delivered (must count), one dispatched (must NOT count)
    await mkShipment({ customerId: customer._id, sellerId: seller._id, agentId: agentA._id, sellerSubtotal: 1000, deliveryCharge: 100, status: 'delivered', deliveryEarning: 50 });
    await mkShipment({ customerId: customer._id, sellerId: seller._id, agentId: agentA._id, sellerSubtotal: 1000, deliveryCharge: 100, couponAllocation: 150, status: 'delivered', deliveryEarning: 50 });
    await mkShipment({ customerId: customer._id, sellerId: seller._id, agentId: agentA._id, sellerSubtotal: 500,  deliveryCharge: 100, status: 'dispatched', deliveryEarning: 50 });

    // AgentB: one delivered — must not leak into AgentA's totals
    await mkShipment({ customerId: customer._id, sellerId: seller._id, agentId: agentB._id, sellerSubtotal: 2000, deliveryCharge: 0, status: 'delivered', deliveryEarning: 50 });

    const { res, err } = await invoke(getDeliveryOrders, { user: agentA });
    assert.strictEqual(err, null);
    assert.strictEqual(res.body.shipments.length, 3, 'all 3 of AgentA\'s own shipments must appear regardless of status');
    assert.strictEqual(res.body.deliveredCount, 2, 'only AgentA\'s delivered shipments count');
    assert.strictEqual(res.body.deliveryEarnings, 100, '2 x Rs 50 — AgentA\'s delivered shipments only, not AgentB\'s and not the dispatched one');

    const { res: resB, err: errB } = await invoke(getDeliveryOrders, { user: agentB });
    assert.strictEqual(errB, null);
    assert.strictEqual(resB.body.deliveredCount, 1, 'AgentB sees only their own delivered shipment');
    assert.strictEqual(resB.body.deliveryEarnings, 50);
  }, cleanup);

  // ── customerPayable: missing vs explicit-zero couponAllocation ───────────
  await test('customerPayable: couponAllocation missing (schema default) matches packageValue (no voucher)', async () => {
    const customer = await mkUser('customer', 'Cust5');
    const seller   = await mkUser('seller', 'Sell5');
    const agent    = await mkUser('delivery', 'Agent5');
    await mkShipment({ customerId: customer._id, sellerId: seller._id, agentId: agent._id, sellerSubtotal: 800, deliveryCharge: 100, status: 'dispatched' });

    const { res } = await invoke(getDeliveryOrders, { user: agent });
    assert.strictEqual(res.body.shipments[0].customerPayable, 900);
    assert.strictEqual(res.body.shipments[0].customerPayable, res.body.shipments[0].packageValue);
  }, cleanup);

  await test('customerPayable: couponAllocation explicit 0 matches packageValue (same as missing)', async () => {
    const customer = await mkUser('customer', 'Cust6');
    const seller   = await mkUser('seller', 'Sell6');
    const agent    = await mkUser('delivery', 'Agent6');
    await mkShipment({ customerId: customer._id, sellerId: seller._id, agentId: agent._id, sellerSubtotal: 800, deliveryCharge: 100, couponAllocation: 0, status: 'dispatched' });

    const { res } = await invoke(getDeliveryOrders, { user: agent });
    assert.strictEqual(res.body.shipments[0].customerPayable, 900);
    assert.strictEqual(res.body.shipments[0].customerPayable, res.body.shipments[0].packageValue);
  }, cleanup);

  // ── Enrichment is response-only, never persisted ─────────────────────────
  await test('enrichment is response-only: the Shipment document in Mongo is untouched by the read', async () => {
    const customer = await mkUser('customer', 'Cust7');
    const seller   = await mkUser('seller', 'Sell7');
    const agent    = await mkUser('delivery', 'Agent7');
    const { shipment } = await mkShipment({ customerId: customer._id, sellerId: seller._id, agentId: agent._id, sellerSubtotal: 1000, deliveryCharge: 100, couponAllocation: 150, status: 'dispatched' });

    await invoke(getDeliveryOrders, { user: agent });

    const raw = await Shipment.findById(shipment._id).lean();
    assert.strictEqual(raw.customerPayable, undefined, 'customerPayable must never be persisted on the Shipment document');
    assert.strictEqual(raw.packageValue, undefined, 'packageValue must never be persisted on the Shipment document');
    assert.strictEqual(raw.status, 'dispatched', 'status must be untouched by a read-only GET');
    assert.strictEqual(raw.sellerSubtotal, 1000);
    assert.strictEqual(raw.couponAllocation, 150);
  }, cleanup);

  await mongoose.disconnect();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
};

run().catch((err) => { console.error('FATAL:', err); process.exit(1); });
