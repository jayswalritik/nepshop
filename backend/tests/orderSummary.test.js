/**
 * ─────────────────────────────────────────────────────────────────────────────
 * orderSummary.test.js — run with: node backend/tests/orderSummary.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure-function tests for GET /api/orders/:id/summary (backend/controllers/
 * orderController.js's getOrderSummary), which delegates ALL arithmetic to
 * backend/utils/orderSummary.js — a server-side reproduction of what
 * frontend/src/pages/customer/OrdersPage.jsx currently computes client-side
 * (its Paid / To-pay-on-delivery / Refunded footer, and CancelPackageModal's
 * confirmation figure). No DB connection required — plain order/shipment
 * objects run straight through the real functions the endpoint delegates to
 * (not reimplemented here).
 *
 * Covers the four required worked examples (E1-E4) plus E5, which documents
 * a genuine surprise found while mirroring the web: an order where EVERY
 * shipment ends up cancelled/returned does NOT trigger the "something was
 * removed" branch at all (hasRemovedShipment requires a MIX), so it silently
 * produces the same all-zero buckets as an order nothing has happened to.
 * This is the web's existing behavior, reproduced deliberately — see this
 * task's summary for the STOP-case writeup.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const assert = require('assert');
const { computeOrderBuckets, computeShipmentSummaries, shipmentPayable } = require('../utils/orderSummary');

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

// ─────────────────────────────────────────────────────────
// E1 — single-seller COD order, still active → bucket = toPayOnDelivery
// ─────────────────────────────────────────────────────────
test('E1: single-seller COD order (pending) → toPayOnDelivery 1100, paid/refunded 0', () => {
  const order = { paymentMethod: 'cash_on_delivery' };
  const shipments = [
    { _id: 's1', status: 'pending', sellerSubtotal: 1000, deliveryCharge: 100, couponAllocation: 0 },
  ];

  const buckets = computeOrderBuckets(order, shipments);
  assert.strictEqual(buckets.paid, 0);
  assert.strictEqual(buckets.toPayOnDelivery, 1100);
  assert.strictEqual(buckets.refunded, 0);
  assert.strictEqual(buckets.hasRemovedShipment, false);

  const summaries = computeShipmentSummaries(shipments);
  assert.strictEqual(summaries[0].customerPayable, 1100);
  assert.strictEqual(summaries[0].cancelRefundPreview, 1100); // pending → cancel-eligible
});

// ─────────────────────────────────────────────────────────
// E2 — multi-seller prepaid order with coupon allocated across packages,
// nothing cancelled → web shows plain "Total X" (no bucket split at all),
// but each shipment's customerPayable still reflects its own coupon slice.
// ─────────────────────────────────────────────────────────
test('E2: multi-seller prepaid, coupon split across packages, none removed → all buckets 0, customerPayable carries the split', () => {
  const order = { paymentMethod: 'khalti' };
  const shipments = [
    // Rs 1000 line, Rs 100 delivery, this package's slice of a Rs 200 coupon (proportional: 1000/1500 * 200 = 133.33)
    { _id: 's1', status: 'confirmed', sellerSubtotal: 1000, deliveryCharge: 100, couponAllocation: 133.33 },
    // Rs 500 line, Rs 100 delivery, remaining slice (500/1500 * 200 = 66.67)
    { _id: 's2', status: 'pending', sellerSubtotal: 500, deliveryCharge: 100, couponAllocation: 66.67 },
  ];

  const buckets = computeOrderBuckets(order, shipments);
  assert.strictEqual(buckets.paid, 0);
  assert.strictEqual(buckets.toPayOnDelivery, 0);
  assert.strictEqual(buckets.refunded, 0);
  assert.strictEqual(buckets.hasRemovedShipment, false);

  const summaries = computeShipmentSummaries(shipments);
  assert.strictEqual(summaries[0].customerPayable, 966.67); // 1000 + 100 - 133.33
  assert.strictEqual(summaries[1].customerPayable, 533.33); // 500 + 100 - 66.67
  // Both still pending/confirmed → both cancel-eligible, preview === customerPayable
  assert.strictEqual(summaries[0].cancelRefundPreview, 966.67);
  assert.strictEqual(summaries[1].cancelRefundPreview, 533.33);
});

// ─────────────────────────────────────────────────────────
// E3 — one shipment cancelled (of two) — COD vs prepaid semantics differ,
// exactly as OrdersPage.jsx's footer does.
// ─────────────────────────────────────────────────────────
test('E3a: COD, one of two shipments cancelled → cancelled one contributes to NEITHER bucket (web never shows a refunded figure for COD)', () => {
  const order = { paymentMethod: 'cash_on_delivery' };
  const shipments = [
    { _id: 's1', status: 'cancelled', sellerSubtotal: 1000, deliveryCharge: 100, couponAllocation: 0 },
    { _id: 's2', status: 'delivered', sellerSubtotal: 2000, deliveryCharge: 0, couponAllocation: 0 },
  ];

  const buckets = computeOrderBuckets(order, shipments);
  assert.strictEqual(buckets.hasRemovedShipment, true);
  assert.strictEqual(buckets.paid, 2000); // only the delivered shipment
  assert.strictEqual(buckets.toPayOnDelivery, 0);
  assert.strictEqual(buckets.refunded, 0); // COD footer never populates this bucket

  const summaries = computeShipmentSummaries(shipments);
  assert.strictEqual(summaries[0].cancelRefundPreview, null); // already cancelled, not cancel-eligible anymore
});

test('E3b: prepaid, one of two shipments cancelled → refunded bucket sums settlement.refundToCustomer for the cancelled one only', () => {
  const order = { paymentMethod: 'esewa' };
  const shipments = [
    { _id: 's1', status: 'cancelled', sellerSubtotal: 1000, deliveryCharge: 100, couponAllocation: 0, settlement: { refundToCustomer: 1100 } },
    { _id: 's2', status: 'delivered', sellerSubtotal: 2000, deliveryCharge: 0, couponAllocation: 0, settlement: { refundToCustomer: 0 } },
  ];

  const buckets = computeOrderBuckets(order, shipments);
  assert.strictEqual(buckets.hasRemovedShipment, true);
  assert.strictEqual(buckets.paid, 0); // prepaid never populates paid/toPay
  assert.strictEqual(buckets.toPayOnDelivery, 0);
  assert.strictEqual(buckets.refunded, 1100);
});

// ─────────────────────────────────────────────────────────
// E4 — free-delivery package (subtotal >= 2000)
// ─────────────────────────────────────────────────────────
test('E4: COD, single package subtotal exactly 2000 → delivery FREE, toPayOnDelivery 2000', () => {
  const order = { paymentMethod: 'cash_on_delivery' };
  const shipments = [
    { _id: 's1', status: 'packed', sellerSubtotal: 2000, deliveryCharge: 0, couponAllocation: 0 },
  ];

  assert.strictEqual(shipmentPayable(shipments[0]), 2000);
  const buckets = computeOrderBuckets(order, shipments);
  assert.strictEqual(buckets.toPayOnDelivery, 2000);
  assert.strictEqual(buckets.paid, 0);
  assert.strictEqual(buckets.refunded, 0);
});

// ─────────────────────────────────────────────────────────
// E5 — surprise edge case: EVERY shipment removed → hasRemovedShipment is
// FALSE (it requires a MIX), so buckets fall through to all-zero exactly as
// if nothing had happened — no Refunded/To-pay signal at all in THIS
// footer, for EITHER payment method. Documented, not "fixed" — mirrors
// OrdersPage.jsx's actual current behavior.
// ─────────────────────────────────────────────────────────
test('E5a: COD, ALL shipments cancelled → hasRemovedShipment false, all buckets 0 (matches web exactly, not "fixed")', () => {
  const order = { paymentMethod: 'cash_on_delivery' };
  const shipments = [
    { _id: 's1', status: 'cancelled', sellerSubtotal: 1000, deliveryCharge: 100, couponAllocation: 0 },
    { _id: 's2', status: 'cancelled', sellerSubtotal: 2000, deliveryCharge: 0, couponAllocation: 0 },
  ];

  const buckets = computeOrderBuckets(order, shipments);
  assert.strictEqual(buckets.hasRemovedShipment, false);
  assert.strictEqual(buckets.paid, 0);
  assert.strictEqual(buckets.toPayOnDelivery, 0);
  assert.strictEqual(buckets.refunded, 0);
});

test('E5b: prepaid, ALL shipments cancelled → hasRemovedShipment false, refunded stays 0 even though settlement.refundToCustomer is nonzero', () => {
  const order = { paymentMethod: 'khalti' };
  const shipments = [
    { _id: 's1', status: 'cancelled', sellerSubtotal: 1000, deliveryCharge: 100, couponAllocation: 0, settlement: { refundToCustomer: 1100 } },
    { _id: 's2', status: 'cancelled', sellerSubtotal: 2000, deliveryCharge: 0, couponAllocation: 0, settlement: { refundToCustomer: 2000 } },
  ];

  const buckets = computeOrderBuckets(order, shipments);
  assert.strictEqual(buckets.hasRemovedShipment, false);
  assert.strictEqual(buckets.refunded, 0); // NOT 3100 — the gate never opens
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
