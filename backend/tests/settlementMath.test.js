/**
 * ─────────────────────────────────────────────────────────────────────────────
 * settlementMath.test.js — run with: node backend/tests/settlementMath.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure-function tests for the per-seller-group pricing helper
 * (backend/utils/orderPricing.js) and the payout-aggregation logic that
 * consumes Shipment documents (adminController.getPayouts/paySeller). No DB
 * connection required — these are the numbers the money model is built on.
 *
 * Covers:
 *   1. Single-seller order — must be byte-for-byte identical to today's math
 *      (NO-REGRESSION constraint).
 *   2. The X/Y worked example from DIAGNOSIS.md (seller X: Rs 1000, seller Y:
 *      Rs 500, one order).
 *   3. Per-group free-delivery threshold (one group >= Rs 2000, one below).
 *   4. Payout aggregation: paying seller X leaves seller Y's pending balance
 *      untouched (the bug this whole change fixes).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const assert = require('assert');
const { groupItemsBySeller, allocateCouponDiscount, round2 } = require('../utils/orderPricing');
const { computeReturnReversal, isShipmentFullyReturned } = require('../utils/returnMath');
const { buildShipmentEmailView } = require('../utils/orderAggregate');

let passed = 0;
let failed = 0;

const test = (name, fn) => {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(`   ${err.message}`);
    failed++;
  }
};

const sellerA = 'seller-a';
const sellerB = 'seller-b';

// ─────────────────────────────────────────────────────────
// 1. Single-seller regression — identical to today's flat math
// ─────────────────────────────────────────────────────────
test('single-seller order: numbers match today\'s flat (non-grouped) formula', () => {
  const items = [
    { price: 500, quantity: 1, seller: sellerA },
    { price: 250, quantity: 2, seller: sellerA },
    { price: 500, quantity: 1, seller: sellerA },
  ];
  const { groups, subtotal, deliveryCharge, commissionAmount } = groupItemsBySeller(items);

  assert.strictEqual(groups.length, 1, 'single seller must produce exactly one group');
  assert.strictEqual(subtotal, 1500);
  assert.strictEqual(deliveryCharge, 100); // 1500 < 2000 → flat Rs 100, same as today
  assert.strictEqual(commissionAmount, 75); // 5% of 1500
  assert.strictEqual(round2(subtotal + deliveryCharge), 1600); // today's order.total (no coupon)

  const sellerShare = round2(groups[0].sellerSubtotal - groups[0].commissionAmount);
  assert.strictEqual(sellerShare, 1425); // deliveryController's live formula, unchanged
});

// ─────────────────────────────────────────────────────────
// 2. Worked example — Seller X: Rs 1000, Seller Y: Rs 500, one order
// ─────────────────────────────────────────────────────────
test('X/Y worked example: per-seller partition matches DIAGNOSIS.md figures', () => {
  const items = [
    { price: 1000, quantity: 1, seller: sellerA }, // X
    { price: 500,  quantity: 1, seller: sellerB }, // Y
  ];
  const { groups, subtotal, deliveryCharge, commissionAmount } = groupItemsBySeller(items);

  assert.strictEqual(groups.length, 2);

  const total = round2(subtotal + deliveryCharge);
  assert.strictEqual(subtotal, 1500);
  assert.strictEqual(deliveryCharge, 200); // 100 + 100 — one delivery leg per seller-group
  assert.strictEqual(commissionAmount, 75); // 50 + 25
  assert.strictEqual(total, 1700); // NOT 1600 — the bug this fix corrects

  const x = groups.find(g => g.seller === sellerA);
  const y = groups.find(g => g.seller === sellerB);

  assert.strictEqual(x.sellerSubtotal, 1000);
  assert.strictEqual(x.deliveryCharge, 100);
  assert.strictEqual(x.commissionAmount, 50);
  assert.strictEqual(round2(x.sellerSubtotal - x.commissionAmount), 950); // X's seller share

  assert.strictEqual(y.sellerSubtotal, 500);
  assert.strictEqual(y.deliveryCharge, 100);
  assert.strictEqual(y.commissionAmount, 25);
  assert.strictEqual(round2(y.sellerSubtotal - y.commissionAmount), 475); // Y's seller share

  // NepShop's correct keep: commission + delivery margin (2 x Rs 50 agent fee)
  const deliveryEarningPaid = groups.length * 50; // one Rs 50 agent fee per shipment
  const nepShopKeep = round2(commissionAmount + (deliveryCharge - deliveryEarningPaid));
  assert.strictEqual(nepShopKeep, 175);
});

// ─────────────────────────────────────────────────────────
// 3. Per-group free-delivery threshold
// ─────────────────────────────────────────────────────────
test('free-delivery threshold applies PER GROUP, not to the combined cart', () => {
  const items = [
    { price: 2500, quantity: 1, seller: sellerA }, // >= 2000 → free for this group
    { price: 500,  quantity: 1, seller: sellerB }, // < 2000 → Rs 100 for this group
  ];
  const { groups, deliveryCharge } = groupItemsBySeller(items);

  const free   = groups.find(g => g.seller === sellerA);
  const charged = groups.find(g => g.seller === sellerB);

  assert.strictEqual(free.deliveryCharge, 0);
  assert.strictEqual(charged.deliveryCharge, 100);
  assert.strictEqual(deliveryCharge, 100); // combined total delivery — NOT free just because one group crossed 2000
});

// ─────────────────────────────────────────────────────────
// 4. Payout aggregation — pure-logic mirror of adminController.getPayouts/paySeller
// ─────────────────────────────────────────────────────────
test('payout aggregation: paying seller X leaves seller Y\'s pending balance intact', () => {
  // Mimics Shipment documents after markDelivered + settlement release
  const shipments = [
    { _id: 's1', seller: sellerA, settlement: { sellerShare: 950, sellerReleased: true, sellerPaidOut: false } },
    { _id: 's2', seller: sellerB, settlement: { sellerShare: 475, sellerReleased: true, sellerPaidOut: false } },
  ];

  // getPayouts aggregation
  const sellerMap = {};
  for (const s of shipments.filter(s => s.settlement.sellerReleased && !s.settlement.sellerPaidOut)) {
    const sid = s.seller;
    if (!sellerMap[sid]) sellerMap[sid] = { sellerId: sid, amount: 0, orders: 0 };
    sellerMap[sid].amount += s.settlement.sellerShare;
    sellerMap[sid].orders += 1;
  }

  assert.strictEqual(sellerMap[sellerA].amount, 950);
  assert.strictEqual(sellerMap[sellerB].amount, 475);

  // paySeller(sellerA) — scoped update, mirrors Shipment.updateMany({ seller: sellerA, ... })
  for (const s of shipments) {
    if (s.seller === sellerA && s.settlement.sellerReleased && !s.settlement.sellerPaidOut) {
      s.settlement.sellerPaidOut = true;
    }
  }

  const sellerMapAfter = {};
  for (const s of shipments.filter(s => s.settlement.sellerReleased && !s.settlement.sellerPaidOut)) {
    const sid = s.seller;
    if (!sellerMapAfter[sid]) sellerMapAfter[sid] = { sellerId: sid, amount: 0 };
    sellerMapAfter[sid].amount += s.settlement.sellerShare;
  }

  assert.strictEqual(sellerMapAfter[sellerA], undefined, 'seller X should no longer appear in pending payouts');
  assert.strictEqual(sellerMapAfter[sellerB].amount, 475, 'seller Y\'s 475 must remain untouched by X\'s payout');
});

// ─────────────────────────────────────────────────────────
// 5. Voucher proportional allocation — headphone/cable/book, Rs 100 voucher
// ─────────────────────────────────────────────────────────
test('coupon allocation: Rs 100 voucher splits proportionally, per-unit rounding, sums exactly', () => {
  const headphone = { name: 'Headphone', price: 1000, quantity: 1 };
  const cable     = { name: 'Cable',     price: 200,  quantity: 2 };
  const book      = { name: 'Book',      price: 500,  quantity: 1 };
  const items = [headphone, cable, book];

  allocateCouponDiscount(items, 100);

  // Per-unit rounding: cable's two Rs 200 units each round to 10.53, then
  // sum into the line (21.06) — NOT the line's own 400/1900*100 (21.05).
  assert.strictEqual(headphone.couponAllocation, 52.63);
  assert.strictEqual(cable.couponAllocation, 21.06);
  assert.strictEqual(book.couponAllocation, 26.31); // absorbs the rounding remainder (last unit)

  const sum = round2(items.reduce((s, i) => s + i.couponAllocation, 0));
  assert.strictEqual(sum, 100.00);
});

// ─────────────────────────────────────────────────────────
// 6. Allocation-aware per-shipment refund — Ram's shipment (headphone + cable)
// ─────────────────────────────────────────────────────────
test('per-shipment cancellation refund subtracts that shipment\'s coupon allocation', () => {
  const headphone = { price: 1000, quantity: 1 };
  const cable     = { price: 200,  quantity: 2 };
  const book      = { price: 500,  quantity: 1 }; // different seller's shipment

  const items = [headphone, cable, book];
  allocateCouponDiscount(items, 100);

  // Ram's shipment: headphone + cable only.
  const ramShipment = {
    sellerSubtotal:   round2(headphone.price * headphone.quantity + cable.price * cable.quantity), // 1400
    deliveryCharge:   100, // 1400 < 2000 -> flat Rs 100
    couponAllocation: round2(headphone.couponAllocation + cable.couponAllocation), // 73.69
  };
  assert.strictEqual(ramShipment.sellerSubtotal, 1400);
  assert.strictEqual(ramShipment.couponAllocation, 73.69);

  // Mirrors orderController.js's per-shipment cancellation refund formula.
  const refund = round2(ramShipment.sellerSubtotal + ramShipment.deliveryCharge - ramShipment.couponAllocation);
  assert.strictEqual(refund, 1426.31); // 1400 + 100 - 73.69
});

// ─────────────────────────────────────────────────────────
// 7. No-coupon order — zero allocations, refund unchanged (regression)
// ─────────────────────────────────────────────────────────
test('no-coupon order: allocateCouponDiscount is a no-op, refund matches pre-voucher formula', () => {
  const items = [
    { price: 500, quantity: 1 },
    { price: 250, quantity: 2 },
    { price: 500, quantity: 1 },
  ];
  allocateCouponDiscount(items, 0);

  items.forEach(i => assert.strictEqual(i.couponAllocation, 0));

  const shipment = { sellerSubtotal: 1500, deliveryCharge: 100, couponAllocation: round2(items.reduce((s, i) => s + i.couponAllocation, 0)) };
  const refund = round2(shipment.sellerSubtotal + shipment.deliveryCharge - shipment.couponAllocation);
  assert.strictEqual(refund, 1600); // identical to today's sellerSubtotal + deliveryCharge, no voucher involved
});

// ─────────────────────────────────────────────────────────
// 8-10. Item-level return reversal — Ram's shipment (headphone Rs 1000 x1 +
// cable Rs 200 x2 -> sellerSubtotal 1400, commission 70, sellerShare 1330,
// package delivery 100; Rs 100 platform voucher; headphone allocation 52.63,
// cable line allocation 21.06 -> 10.53/unit). Scenarios A/B/C from the task
// spec, reproduced exactly against backend/utils/returnMath.js.
// ─────────────────────────────────────────────────────────

test('Scenario A — return 1 cable, SELLER fault (partial return)', () => {
  const reversal = computeReturnReversal({
    returnedValue:          200,   // 1 cable @ Rs 200
    voucherSlice:           10.53, // this unit's per-unit voucher slice
    commissionRate:         5,
    fault:                  'seller',
    isFullShipmentReturn:   false,
    shipmentDeliveryCharge: 100,
  });

  assert.strictEqual(reversal.refundToCustomer, 189.47);   // 200 - 10.53
  assert.strictEqual(reversal.commissionReversal, 10);      // NepShop gives back
  assert.strictEqual(reversal.voucherReclaimed, 10.53);
  assert.strictEqual(reversal.sellerShareDelta, -240);      // -190 seller reversal - 50 pickup

  const sellerShareAfter = round2(1330 + reversal.sellerShareDelta);
  assert.strictEqual(sellerShareAfter, 1090); // Ram's sellerShare -190 -50 pickup -> 1090
});

test('Scenario B — return 1 cable, CUSTOMER fault (partial return)', () => {
  const reversal = computeReturnReversal({
    returnedValue:          200,
    voucherSlice:           10.53,
    commissionRate:         5,
    fault:                  'customer',
    isFullShipmentReturn:   false,
    shipmentDeliveryCharge: 100,
  });

  assert.strictEqual(reversal.refundToCustomer, 139.47);   // 189.47 - 50 withheld
  assert.strictEqual(reversal.commissionReversal, 10);      // same as scenario A
  assert.strictEqual(reversal.voucherReclaimed, 10.53);
  assert.strictEqual(reversal.sellerShareDelta, -190);      // seller does NOT bear pickup

  const sellerShareAfter = round2(1330 + reversal.sellerShareDelta);
  assert.strictEqual(sellerShareAfter, 1140); // Ram -190 -> 1140
});

test('Scenario C — ENTIRE shipment returned, SELLER fault (full return)', () => {
  const reversal = computeReturnReversal({
    returnedValue:          1400,  // headphone 1000 + cable 400
    voucherSlice:           73.69, // 52.63 + 21.06
    commissionRate:         5,
    fault:                  'seller',
    isFullShipmentReturn:   true,
    shipmentDeliveryCharge: 100,
  });

  assert.strictEqual(reversal.refundToCustomer, 1426.31);  // 1400 - 73.69 + 100 delivery
  assert.strictEqual(reversal.commissionReversal, 70);      // full commission given back
  assert.strictEqual(reversal.voucherReclaimed, 73.69);
  assert.strictEqual(reversal.sellerShareDelta, -1480);     // -1330 reversal -100 delivery -50 pickup

  const sellerShareAfter = round2(1330 + reversal.sellerShareDelta);
  assert.strictEqual(sellerShareAfter, -150); // NEGATIVE balance, per the spec
});

// ─────────────────────────────────────────────────────────
// 11. No-voucher, full-order, single-seller return — must match what a
// simple order-level refund would have produced (NO-REGRESSION constraint:
// the generalized item-level model must not change the simple case).
// ─────────────────────────────────────────────────────────
test('return regression: single-item, single-seller, no-voucher, full return, seller fault', () => {
  const reversal = computeReturnReversal({
    returnedValue:          1500,  // whole (no-coupon) order from test 1
    voucherSlice:           0,
    commissionRate:         5,
    fault:                  'seller',
    isFullShipmentReturn:   true,
    shipmentDeliveryCharge: 100,
  });

  // Old order-level logic: seller-fault refund = order.total (subtotal + delivery, no voucher)
  assert.strictEqual(reversal.refundToCustomer, 1600); // 1500 + 100, identical to order.total
  assert.strictEqual(reversal.commissionReversal, 75);  // 5% of 1500, matches test 1's commissionAmount
});

// ─────────────────────────────────────────────────────────
// 12-15. Full-vs-partial classification — isShipmentFullyReturned
// (backend/utils/returnMath.js). Same shipment as the scenarios above:
// Headphone x1 + Cable x2.
// ─────────────────────────────────────────────────────────

const shipmentItems = [
  { product: 'headphone', quantity: 1 },
  { product: 'cable',     quantity: 2 },
];

test('classification: cable 1-of-2 returned, headphone untouched -> PARTIAL', () => {
  const full = isShipmentFullyReturned({
    shipmentItems,
    completedReturnsItems: [],
    currentReturnItems: [{ product: 'cable', quantity: 1 }],
  });
  assert.strictEqual(full, false);
});

test('classification: every unit across both lines completed -> FULL', () => {
  const full = isShipmentFullyReturned({
    shipmentItems,
    completedReturnsItems: [
      { product: 'cable', quantity: 1 }, // first cable unit already refunded
    ],
    currentReturnItems: [
      { product: 'headphone', quantity: 1 },
      { product: 'cable',     quantity: 1 }, // second cable unit, being completed now
    ],
  });
  assert.strictEqual(full, true);
});

test('classification: second cable request while first is COMPLETED, headphone untouched -> still PARTIAL', () => {
  const full = isShipmentFullyReturned({
    shipmentItems,
    completedReturnsItems: [
      { product: 'cable', quantity: 1 }, // first cable request, already refunded
    ],
    currentReturnItems: [
      { product: 'cable', quantity: 1 }, // second cable request, being completed/previewed now
    ],
  });
  assert.strictEqual(full, false); // headphone still untouched
});

test('classification: reservation-aware — an OPEN (pending/approved) request on the other line must NOT count toward fullness', () => {
  // Cable 1-of-2 is the request being classified. A second, still-OPEN
  // return for the headphone (pending/approved/picked_up — not 'refunded')
  // must be excluded entirely: it never appears in completedReturnsItems.
  const full = isShipmentFullyReturned({
    shipmentItems,
    completedReturnsItems: [], // the open headphone return contributes NOTHING here
    currentReturnItems: [{ product: 'cable', quantity: 1 }],
  });
  assert.strictEqual(full, false);
});

// ─────────────────────────────────────────────────────────
// 16. End-to-end wiring check — Scenario A's exact numbers must come out
// PARTIAL (no delivery add-on) when classification is fed by
// isShipmentFullyReturned instead of a hand-set flag, closing the loop
// between the classifier and computeReturnReversal on the real bug report
// (cable x1 of 3 total units across the shipment misclassified as full).
// ─────────────────────────────────────────────────────────
test('wiring: cable x1 of 3 total shipment units classifies PARTIAL end-to-end (the reported bug)', () => {
  const threeUnitShipment = [
    { product: 'headphone', quantity: 1 },
    { product: 'cable',     quantity: 2 },
  ];
  const isFullShipmentReturn = isShipmentFullyReturned({
    shipmentItems: threeUnitShipment,
    completedReturnsItems: [],
    currentReturnItems: [{ product: 'cable', quantity: 1 }],
  });
  assert.strictEqual(isFullShipmentReturn, false);

  const reversal = computeReturnReversal({
    returnedValue:          200,
    voucherSlice:           10.53,
    commissionRate:         5,
    fault:                  'seller',
    isFullShipmentReturn,
    shipmentDeliveryCharge: 100,
  });

  assert.strictEqual(reversal.refundToCustomer, 189.47); // NOT 289.47 — no delivery add-on
});

// ─────────────────────────────────────────────────────────
// 17. buildShipmentEmailView.customerPayable — voucher-aware collection
// amount used by the delivery agent's COD email/dashboard (Finding 1 fix).
// Must equal sellerSubtotal + deliveryCharge - couponAllocation, and must
// NOT leak into `total` (gross package value, seller-facing, unaffected).
// Real numbers from live order #A4CCF072's Sita package.
// ─────────────────────────────────────────────────────────
test('buildShipmentEmailView: customerPayable is voucher-aware, total stays gross', () => {
  const order    = { _id: 'order-1' };
  const shipment = { items: [], sellerSubtotal: 500, deliveryCharge: 100, commissionRate: 5, commissionAmount: 25, couponAllocation: 33.33, deliveryEarning: 50 };

  const view = buildShipmentEmailView(order, shipment);

  assert.strictEqual(view.total, 600, 'total stays gross (sellerSubtotal + deliveryCharge), unaffected by voucher');
  assert.strictEqual(view.customerPayable, 566.67, 'customerPayable subtracts couponAllocation');
});

test('buildShipmentEmailView: customerPayable with no coupon matches total', () => {
  const order    = { _id: 'order-2' };
  const shipment = { items: [], sellerSubtotal: 1000, deliveryCharge: 100, commissionRate: 5, commissionAmount: 50, deliveryEarning: 50 };

  const view = buildShipmentEmailView(order, shipment);

  assert.strictEqual(view.customerPayable, 1100, 'no coupon → customerPayable equals gross total');
  assert.strictEqual(view.customerPayable, view.total);
});

// ─────────────────────────────────────────────────────────
// 18. buildShipmentEmailView.sellerEarnings — the seller-facing "Your
// Earnings" email figure (Fix A). Must equal sellerSubtotal - commission,
// NEVER including deliveryCharge, matching settlement.sellerShare exactly
// (deliveryController.markDelivered) and EarningsPage.jsx's own documented
// formula ("NEVER includes delivery").
// ─────────────────────────────────────────────────────────
test('buildShipmentEmailView: sellerEarnings excludes deliveryCharge (Fix A)', () => {
  const order    = { _id: 'order-3' };
  const shipment = { items: [], sellerSubtotal: 1000, deliveryCharge: 100, commissionRate: 5, commissionAmount: 50, deliveryEarning: 50 };

  const view = buildShipmentEmailView(order, shipment);

  assert.strictEqual(view.sellerEarnings, 950, 'sellerEarnings = sellerSubtotal - commission, delivery charge excluded');
  assert.notStrictEqual(view.sellerEarnings, view.total - view.commissionAmount, 'must NOT equal the old (wrong) total-based formula, which would be 1050');
});

// ─────────────────────────────────────────────────────────
// 19-21. Chatbot return-refund math (Fix B) — computeReturnReversal /
// isShipmentFullyReturned are DB-free pure functions; getReturnFacts itself
// (backend/services/chatbot/returnActions.js) does live Mongoose queries and
// is NOT unit-testable without a DB connection. These tests instead prove
// the underlying math is correct for exactly the call shape
// returnActions.js now uses (real functions, not a chatbot-local
// reimplementation) — full live wiring is covered by the manual checklist.
// ─────────────────────────────────────────────────────────
test('chatbot refund math: customer-fault deducts the pickup fee exactly once (139.47 worked example)', () => {
  const { RETURN_PICKUP_FEE } = require('../utils/returnMath');
  assert.strictEqual(RETURN_PICKUP_FEE, 50);

  const reversal = computeReturnReversal({
    returnedValue:  200,
    voucherSlice:   10.53,
    commissionRate: 5,
    fault:          'customer',
  });

  assert.strictEqual(reversal.refundToCustomer, 139.47, '200 - 10.53 - 50, fee deducted ONCE — not 89.47 (double-deducted)');
});

test('chatbot refund math: seller-fault partial matches 189.47, full-shipment matches 1,426.32', () => {
  // Partial — an open (non-completed) hold on a sibling line keeps this
  // shipment from classifying as fully returned, exactly like a real
  // concurrent in-progress return would (isShipmentFullyReturned's own
  // documented nuance, reused verbatim).
  const partialFull = isShipmentFullyReturned({
    shipmentItems:         [{ product: 'p1', quantity: 1 }, { product: 'p2', quantity: 1 }],
    completedReturnsItems: [],
    currentReturnItems:    [{ product: 'p1', quantity: 1 }],
  });
  assert.strictEqual(partialFull, false);

  const partial = computeReturnReversal({
    returnedValue: 200, voucherSlice: 10.53, commissionRate: 5, fault: 'seller',
    isFullShipmentReturn: partialFull, shipmentDeliveryCharge: 100,
  });
  assert.strictEqual(partial.refundToCustomer, 189.47, 'partial seller-fault — no delivery add-on');

  // Full — nothing held back elsewhere.
  const wholeFull = isShipmentFullyReturned({
    shipmentItems:         [{ product: 'p1', quantity: 1 }],
    completedReturnsItems: [],
    currentReturnItems:    [{ product: 'p1', quantity: 1 }],
  });
  assert.strictEqual(wholeFull, true);

  const full = computeReturnReversal({
    returnedValue: 1400, voucherSlice: 73.68, commissionRate: 5, fault: 'seller',
    isFullShipmentReturn: wholeFull, shipmentDeliveryCharge: 100,
  });
  assert.strictEqual(full.refundToCustomer, 1426.32, 'full seller-fault — includes the Rs 100 delivery add-on');
});

test('chatbot refund math: voucher slice prorates to the remaining (still-returnable) quantity', () => {
  // Mirrors returnActions.js's exact prorating expression: a line already
  // partially returned must not reuse its FULL original couponAllocation for
  // the portion still outstanding — (couponAllocation / originalQty) * remainingQty.
  const item = { couponAllocation: 40, originalQty: 4, returnedQuantity: 1 }; // 3 of 4 units remain
  const remainingQty = item.originalQty - item.returnedQuantity;
  const proratedSlice = round2((item.couponAllocation / item.originalQty) * remainingQty);

  assert.strictEqual(remainingQty, 3);
  assert.strictEqual(proratedSlice, 30, 'Rs 10/unit x 3 remaining units, not the full Rs 40 line allocation');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
