/**
 * ─────────────────────────────────────────────────────────────────────────────
 * payoutsFixes.test.js — run with: node backend/tests/payoutsFixes.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Integration tests for the four return-payout/report fixes:
 *   1. Return-pickup earnings reaching admin payouts (Return.pickupPaidOut).
 *   2. Commission report no longer dropping fully-returned shipments from
 *      base figures while still counting their reversals.
 *   3. paySeller rejecting a non-positive balance.
 *   4. returnHold correctly clearing after completion (not stuck true).
 *
 * Sibling to settlementMath.test.js (pure, no DB) and returnReservation.test.js
 * (reservation/reject race safety) — this file is kept separate so neither of
 * those counts changes; extend here for anything payout/report/hold-shaped.
 * Requires MONGO_URI (reads backend/.env). Every test creates its own
 * throwaway Order/Shipment/User/Return documents and deletes them afterward.
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

// cleanupFn always runs (pass or fail) — an assertion failure must never
// leave orphaned test data behind to contaminate a later run's global,
// unscoped aggregates (getPayouts/getCommissionReport read the WHOLE
// collection, so leftover test docs are not just clutter, they're a
// correctness hazard for the next run).
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

  const { requestReturn, processReturn, markReturnPickedUp, completeReturn } = require('../controllers/returnController');
  const { getPayouts, payAgent, getCommissionReport, paySeller } = require('../controllers/adminController');
  const Order    = require('../models/Order');
  const Shipment = require('../models/Shipment');
  const Return   = require('../models/Return');
  const User     = require('../models/User');

  const cleanupIds = { orders: [], shipments: [], returns: [], users: [] };
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  const mkUser = async (role, tag) => {
    const u = await User.create({
      firstName: 'Diag', lastName: tag,
      email: `diag-${tag.toLowerCase()}-${new mongoose.Types.ObjectId()}@test.local`,
      phone: '9800000001',
      password: 'hashedpw-not-used-in-these-tests',
      role, emailVerified: true,
    });
    cleanupIds.users.push(u._id);
    return u;
  };

  // Same worked example as returnReservation.test.js: Headphone Rs1000 x1,
  // Cable Rs200 x2, Rs100 voucher (headphone 52.63, cable line 21.06 ->
  // 10.53/unit). Shipment starts with sellerReleased/sellerPaidOut flags the
  // caller can override to set up payout-guard scenarios.
  const mkOrderAndShipment = async (customerId, sellerId, overrides = {}) => {
    const hpId = new mongoose.Types.ObjectId();
    const cbId = new mongoose.Types.ObjectId();

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
        { product: hpId, name: 'Headphone', image: 'x', price: 1000, quantity: 1, couponAllocation: 52.63, returnedQuantity: 0 },
        { product: cbId, name: 'Cable', image: 'x', price: 200, quantity: 2, couponAllocation: 21.06, returnedQuantity: 0 },
      ],
      sellerSubtotal: 1400,
      deliveryCharge: 100,
      commissionRate: 5,
      commissionAmount: 70,
      couponAllocation: 73.69,
      deliveryAgent: overrides.deliveryAgent || null,
      deliveryEarning: 50,
      status: 'delivered',
      deliveredAt: new Date(),
      settlement: { sellerShare: 1330, status: 'partial', ...overrides.settlement },
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

  // Drives one Return through request -> approve -> pickup -> complete.
  // `items` is [{ product, quantity }] — pass every line being returned in
  // ONE call for a genuine single-request full-shipment return (one pickup
  // leg), matching how a customer actually submits a multi-line return; two
  // separate calls for the same shipment means two separate pickup jobs and
  // two separate Rs 50 pickup legs, which is correct but a DIFFERENT scenario.
  const runFullReturnCycle = async ({ customer, shipment, items, reason, fault, agent }) => {
    const reqReturn = { user: { _id: customer._id }, body: { shipmentId: shipment._id, items, reason } };
    const { res: r1, err: e1 } = await invoke(requestReturn, reqReturn);
    assert.strictEqual(e1, null, `request threw: ${e1 && e1.message}`);
    assert.strictEqual(r1.statusCode, 201, `request failed: ${JSON.stringify(r1.body)}`);
    const returnId = r1.body.return._id;
    cleanupIds.returns.push(returnId);

    const reqApprove = { user: { _id: new mongoose.Types.ObjectId() }, body: { status: 'approved', fault, returnAgentId: agent._id }, params: { id: returnId } };
    const { res: r2, err: e2 } = await invoke(processReturn, reqApprove);
    assert.strictEqual(e2, null, `approve threw: ${e2 && e2.message}`);
    assert.strictEqual(r2.statusCode, 200, `approve failed: ${JSON.stringify(r2.body)}`);

    const { res: r3, err: e3 } = await invoke(markReturnPickedUp, { user: { _id: agent._id }, params: { id: returnId } });
    assert.strictEqual(e3, null, `pickup threw: ${e3 && e3.message}`);
    assert.strictEqual(r3.statusCode, 200, `pickup failed: ${JSON.stringify(r3.body)}`);

    const { res: r4, err: e4 } = await invoke(completeReturn, { user: { _id: agent._id }, params: { id: returnId } });
    assert.strictEqual(e4, null, `complete threw: ${e4 && e4.message}`);
    assert.strictEqual(r4.statusCode, 200, `complete failed: ${JSON.stringify(r4.body)}`);

    return returnId;
  };

  // ── 1. Completed return -> exactly one Rs 50 pickup payable ────────────
  await test('Fix 1: a completed return surfaces exactly one Rs 50 pickup payable for its return agent', async () => {
    const customer = await mkUser('customer', 'Cust');
    const seller    = await mkUser('seller', 'Seller');
    const agent     = await mkUser('delivery', 'Agent');
    const { shipment, cbId } = await mkOrderAndShipment(customer._id, seller._id);

    await runFullReturnCycle({ customer, shipment, items: [{ product: cbId, quantity: 1 }], reason: 'Changed my mind', fault: 'customer', agent });

    const { res } = await invoke(getPayouts, {});
    assert.strictEqual(res.statusCode, 200);
    const row = res.body.agents.find(a => a.agentId?._id?.toString() === agent._id.toString());
    assert.ok(row, 'agent must appear in pending payouts');
    assert.strictEqual(row.pickupJobs, 1, 'exactly one pickup job payable');
    assert.strictEqual(row.deliveryJobs, 0, 'no delivery leg — this agent only did the pickup');
    assert.strictEqual(row.amount, 50, 'exactly Rs 50 payable for the pickup leg');

  }, cleanup);

  // ── 2. Incomplete return -> none ─────────────────────────────────────
  await test('Fix 1: an in-progress return (picked up but not completed) contributes nothing payable', async () => {
    const customer = await mkUser('customer', 'Cust');
    const seller    = await mkUser('seller', 'Seller');
    const agent     = await mkUser('delivery', 'Agent');
    const { shipment, cbId } = await mkOrderAndShipment(customer._id, seller._id);

    const reqReturn = { user: { _id: customer._id }, body: { shipmentId: shipment._id, items: [{ product: cbId, quantity: 1 }], reason: 'Changed my mind' } };
    const { res: r1 } = await invoke(requestReturn, reqReturn);
    assert.strictEqual(r1.statusCode, 201);
    cleanupIds.returns.push(r1.body.return._id);

    const reqApprove = { user: { _id: new mongoose.Types.ObjectId() }, body: { status: 'approved', fault: 'customer', returnAgentId: agent._id }, params: { id: r1.body.return._id } };
    const { res: r2 } = await invoke(processReturn, reqApprove);
    assert.strictEqual(r2.statusCode, 200);

    const { res: r3 } = await invoke(markReturnPickedUp, { user: { _id: agent._id }, params: { id: r1.body.return._id } });
    assert.strictEqual(r3.statusCode, 200);
    // Deliberately NOT completed — status is 'picked_up', not 'refunded'.

    const { res } = await invoke(getPayouts, {});
    const row = res.body.agents.find(a => a.agentId?._id?.toString() === agent._id.toString());
    assert.strictEqual(row, undefined, 'an in-progress pickup must not appear in pending payouts at all');

  }, cleanup);

  // ── 3. Double mark-paid pays the pickup leg exactly once ────────────────
  await test('Fix 1: double mark-paid on the same agent pays the pickup leg exactly once', async () => {
    const customer = await mkUser('customer', 'Cust');
    const seller    = await mkUser('seller', 'Seller');
    const agent     = await mkUser('delivery', 'Agent');
    const { shipment, cbId } = await mkOrderAndShipment(customer._id, seller._id);

    await runFullReturnCycle({ customer, shipment, items: [{ product: cbId, quantity: 1 }], reason: 'Changed my mind', fault: 'customer', agent });

    const [a, b] = await Promise.all([
      invoke(payAgent, { params: { agentId: agent._id } }),
      invoke(payAgent, { params: { agentId: agent._id } }),
    ]);
    assert.strictEqual(a.res.statusCode, 200);
    assert.strictEqual(b.res.statusCode, 200);

    const paid = await Return.find({ returnAgent: agent._id, pickupPaidOut: true });
    assert.strictEqual(paid.length, 1, 'exactly one Return doc must end up marked paid');

    const { res: after } = await invoke(getPayouts, {});
    const row = after.body.agents.find(a2 => a2.agentId?._id?.toString() === agent._id.toString());
    assert.strictEqual(row, undefined, 'nothing pending left — already paid, not double-counted');

  }, cleanup);

  // ── 4. Commission report nets to 0 on the full-seller-fault worked example ──
  await test('Fix 2: commission report nets exactly 0 on a full-shipment seller-fault return', async () => {
    const customer = await mkUser('customer', 'Cust');
    const seller    = await mkUser('seller', 'Seller');
    const agent     = await mkUser('delivery', 'Agent');

    // "Before" must be captured BEFORE the shipment exists at all — capturing
    // it after creation-but-before-return would already include the +70
    // booked commission with no offsetting reversal yet, making the delta
    // measure only the reversal's effect instead of both sides netting out.
    const { res: before } = await invoke(getCommissionReport, {});
    const b = before.body.overall;

    // deliveryAgent must be a REAL assigned agent — the report's
    // totalDeliveryPaid sums shipment.deliveryEarning unconditionally
    // (mirroring how a real shipment is never marked delivered without an
    // agent), so leaving it unset here would count a Rs 50 payout with no
    // real recipient and throw off deliveryMargin's delta.
    const { shipment, hpId, cbId } = await mkOrderAndShipment(customer._id, seller._id, { deliveryAgent: agent._id });

    // Full-shipment return: BOTH lines in ONE request — a genuine
    // single-request full-shipment return, one pickup leg (see
    // runFullReturnCycle's doc comment). Splitting this into two separate
    // requests would dispatch two separate pickup agent visits (two real
    // Rs 50 legs), which is correct behavior but a different scenario that
    // does NOT net delivery margin to 0 — not what this test is checking.
    await runFullReturnCycle({ customer, shipment, items: [{ product: cbId, quantity: 2 }, { product: hpId, quantity: 1 }], reason: 'Damaged product', fault: 'seller', agent });

    const { res: after } = await invoke(getCommissionReport, {});
    const a = after.body.overall;

    // Deltas — isolates THIS test's contribution regardless of whatever
    // else is in the shared DB (e.g. earlier manual-testing data).
    assert.strictEqual(round2(a.totalCommission - b.totalCommission), 0, 'commission booked (+70) and reversed (−70) must net to 0');
    assert.strictEqual(round2(a.totalCouponDiscount - b.totalCouponDiscount), 0, 'coupons funded (+73.69) and reclaimed (−73.69) must net to 0');
    assert.strictEqual(round2(a.deliveryMargin - b.deliveryMargin), 0, 'delivery collected (+100) vs paid to both agent legs (−50−50) must net to 0');
    assert.strictEqual(round2(a.nepShopIncome - b.nepShopIncome), 0, 'NepShop must net exactly Rs 0 on a fully-returned shipment');

    // Per-seller row: gross revenue stays visible, commission nets via a
    // separately-reported reversal figure.
    const sellerRow = after.body.sellers.find(s => s._id?._id?.toString() === seller._id.toString());
    assert.ok(sellerRow, 'the fully-returned seller must still appear in the per-seller table');
    assert.strictEqual(sellerRow.confirmedRevenue, 1400, 'revenue stays gross, not netted to 0');
    assert.strictEqual(sellerRow.commissionReversal, 70, 'the reversal amount is reported explicitly');
    assert.strictEqual(sellerRow.confirmedCommission, 0, 'net commission after the reversal is 0');

  }, cleanup);

  // ── 5. mark-paid rejected on non-positive balance ───────────────────────
  await test('Fix 3: paySeller rejects a non-positive balance and makes no change', async () => {
    const customer = await mkUser('customer', 'Cust');
    const seller    = await mkUser('seller', 'Seller');
    // sellerReleased/sellerPaidOut both false, but a large negative
    // adjustment (as a post-payout return reversal would leave) makes the
    // NET payable amount negative.
    const { shipment } = await mkOrderAndShipment(customer._id, seller._id, {
      settlement: { sellerShare: 0, sellerReleased: false, sellerPaidOut: true, adjustment: -1480 },
    });

    const { res, err } = await invoke(paySeller, { params: { sellerId: seller._id } });
    assert.ok(err, 'paySeller must throw/reject on a non-positive balance');
    assert.strictEqual(res.statusCode, 400);

    const after = await Shipment.findById(shipment._id);
    assert.strictEqual(after.settlement.adjustment, -1480, 'adjustment must be untouched — not reset by a rejected payout');
    assert.strictEqual(after.settlement.sellerPaidOut, true, 'sellerPaidOut flag must be untouched');

  }, cleanup);

  // ── 6. returnHold: cleared after completion with no pending requests,
  // still true with one pending ────────────────────────────────────────
  await test('Fix 4: returnHold stays true while a sibling request is pending, clears once none remain', async () => {
    const customer = await mkUser('customer', 'Cust');
    const seller    = await mkUser('seller', 'Seller');
    const agent     = await mkUser('delivery', 'Agent');
    const { shipment, hpId, cbId } = await mkOrderAndShipment(customer._id, seller._id);

    // Request BOTH lines (both pending), then complete only the cable one.
    const reqCable = { user: { _id: customer._id }, body: { shipmentId: shipment._id, items: [{ product: cbId, quantity: 1 }], reason: 'Changed my mind' } };
    const { res: rc } = await invoke(requestReturn, reqCable);
    assert.strictEqual(rc.statusCode, 201);
    const cableReturnId = rc.body.return._id;
    cleanupIds.returns.push(cableReturnId);

    const reqHp = { user: { _id: customer._id }, body: { shipmentId: shipment._id, items: [{ product: hpId, quantity: 1 }], reason: 'Changed my mind' } };
    const { res: rh } = await invoke(requestReturn, reqHp);
    assert.strictEqual(rh.statusCode, 201);
    const hpReturnId = rh.body.return._id;
    cleanupIds.returns.push(hpReturnId);

    // Approve + pickup + complete the cable one; headphone stays pending.
    await invoke(processReturn, { user: { _id: new mongoose.Types.ObjectId() }, body: { status: 'approved', fault: 'customer', returnAgentId: agent._id }, params: { id: cableReturnId } });
    await invoke(markReturnPickedUp, { user: { _id: agent._id }, params: { id: cableReturnId } });
    const { res: completeCable, err: completeCableErr } = await invoke(completeReturn, { user: { _id: agent._id }, params: { id: cableReturnId } });
    assert.strictEqual(completeCableErr, null, `complete threw: ${completeCableErr && completeCableErr.message}`);
    assert.strictEqual(completeCable.statusCode, 200);

    const midShipment = await Shipment.findById(shipment._id);
    assert.strictEqual(midShipment.returnHold, true, 'headphone return still pending — hold must stay true');

    // Now complete the headphone one too — nothing pending remains.
    await invoke(processReturn, { user: { _id: new mongoose.Types.ObjectId() }, body: { status: 'approved', fault: 'customer', returnAgentId: agent._id }, params: { id: hpReturnId } });
    await invoke(markReturnPickedUp, { user: { _id: agent._id }, params: { id: hpReturnId } });
    const { res: completeHp, err: completeHpErr } = await invoke(completeReturn, { user: { _id: agent._id }, params: { id: hpReturnId } });
    assert.strictEqual(completeHpErr, null, `complete threw: ${completeHpErr && completeHpErr.message}`);
    assert.strictEqual(completeHp.statusCode, 200);

    const finalShipment = await Shipment.findById(shipment._id);
    assert.strictEqual(finalShipment.returnHold, false, 'no pending/approved/picked_up returns remain — hold must clear');

  }, cleanup);

  await mongoose.disconnect();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
};

run().catch((err) => { console.error('FATAL:', err); process.exit(1); });
