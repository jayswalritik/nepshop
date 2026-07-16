/**
 * ─────────────────────────────────────────────────────────────────────────────
 * cartSummary.test.js — run with: node backend/tests/cartSummary.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure-function tests for GET /api/cart/summary (backend/controllers/
 * cartController.js's getCartSummary), which computes the checkout preview
 * by calling the SAME shared pricing helpers as order creation
 * (backend/utils/orderPricing.js) — groupItemsBySeller for per-seller
 * packages/delivery, allocateCouponDiscount for coupon splitting, and the
 * same `round2(subtotal + deliveryCharge - couponDiscount)` total formula
 * orderController.js's placeOrder already uses. No DB connection required —
 * these are exactly the worked examples from the task's money model, run
 * against the real functions the endpoint delegates to (not reimplemented
 * here).
 *
 * Covers the four worked examples (E1-E4):
 *   E1 — one seller, one item Rs 1000 x1 → subtotal 1000, delivery 100, payable 1100
 *   E2 — one seller, subtotal exactly 2000 → delivery 0 (free), payable 2000
 *   E3 — two sellers, one under/one at-or-over the threshold → grand total 4100
 *   E4 — one seller, two lines, Rs 200 coupon → per-line allocation + payable 1400
 * ─────────────────────────────────────────────────────────────────────────────
 */

const assert = require('assert');
const { groupItemsBySeller, allocateCouponDiscount, round2 } = require('../utils/orderPricing');

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

// Same total formula orderController.js's placeOrder uses (line ~101) —
// asserted here as a fixed point, not a new formula being introduced.
const payableOf = (subtotal, deliveryCharge, couponDiscount = 0) =>
  round2(subtotal + deliveryCharge - couponDiscount);

// ─────────────────────────────────────────────────────────
// E1 — one seller, one item Rs 1000 x1
// ─────────────────────────────────────────────────────────
test('E1: single item Rs 1000 x1 → subtotal 1000, delivery 100, payable 1100', () => {
  const items = [{ price: 1000, quantity: 1, seller: sellerA }];
  const { groups, subtotal, deliveryCharge } = groupItemsBySeller(items);

  assert.strictEqual(groups.length, 1);
  assert.strictEqual(subtotal, 1000);
  assert.strictEqual(deliveryCharge, 100);
  assert.strictEqual(payableOf(subtotal, deliveryCharge), 1100);
});

// ─────────────────────────────────────────────────────────
// E2 — one seller, subtotal exactly at the free-delivery threshold
// ─────────────────────────────────────────────────────────
test('E2: subtotal exactly 2000 → delivery FREE, payable 2000', () => {
  const items = [{ price: 2000, quantity: 1, seller: sellerA }];
  const { groups, subtotal, deliveryCharge } = groupItemsBySeller(items);

  assert.strictEqual(groups.length, 1);
  assert.strictEqual(subtotal, 2000);
  assert.strictEqual(deliveryCharge, 0); // >= 2000, not > 2000
  assert.strictEqual(payableOf(subtotal, deliveryCharge), 2000);
});

// ─────────────────────────────────────────────────────────
// E3 — two sellers, one under the threshold, one at/over it
// ─────────────────────────────────────────────────────────
test('E3: two sellers (1500 + 2500) → per-package delivery correct, grand total 4100', () => {
  const items = [
    { price: 1500, quantity: 1, seller: sellerA }, // S1: under 2000 → Rs 100
    { price: 2500, quantity: 1, seller: sellerB }, // S2: at/over 2000 → free
  ];
  const { groups, subtotal, deliveryCharge } = groupItemsBySeller(items);

  const s1 = groups.find((g) => g.seller === sellerA);
  const s2 = groups.find((g) => g.seller === sellerB);

  assert.strictEqual(s1.sellerSubtotal, 1500);
  assert.strictEqual(s1.deliveryCharge, 100);
  assert.strictEqual(s2.sellerSubtotal, 2500);
  assert.strictEqual(s2.deliveryCharge, 0);

  assert.strictEqual(subtotal, 4000);
  assert.strictEqual(deliveryCharge, 100);
  assert.strictEqual(payableOf(subtotal, deliveryCharge), 4100);
});

// ─────────────────────────────────────────────────────────
// E4 — one seller, two lines, Rs 200 coupon
// ─────────────────────────────────────────────────────────
test('E4: two lines (1000 + 500) with Rs 200 coupon → proportional allocation, payable 1400', () => {
  const items = [
    { price: 1000, quantity: 1, seller: sellerA },
    { price: 500,  quantity: 1, seller: sellerA },
  ];
  const { groups, subtotal, deliveryCharge } = groupItemsBySeller(items);

  assert.strictEqual(subtotal, 1500);
  assert.strictEqual(deliveryCharge, 100);

  const couponDiscount = 200;
  allocateCouponDiscount(items, couponDiscount);

  // allocateCouponDiscount rounds to 2dp per unit (133.33 / 66.67) — the
  // worked example's "133 + 67" is the whole-rupee DISPLAY of these same
  // figures; asserting both so a display-layer rounding regression and a
  // computation regression are caught separately.
  assert.strictEqual(items[0].couponAllocation, 133.33);
  assert.strictEqual(items[1].couponAllocation, 66.67);
  assert.strictEqual(Math.round(items[0].couponAllocation), 133);
  assert.strictEqual(Math.round(items[1].couponAllocation), 67);

  // Allocations always sum EXACTLY to the coupon amount (last unit absorbs
  // the rounding remainder) — never off by a paisa.
  const allocatedTotal = round2(items.reduce((s, i) => s + i.couponAllocation, 0));
  assert.strictEqual(allocatedTotal, couponDiscount);

  // Per-package allocation (what the endpoint reports per seller group) —
  // single seller here, so it's the same sum.
  const packageAllocation = round2(
    groups[0].items.reduce((s, i) => s + (i.couponAllocation || 0), 0)
  );
  assert.strictEqual(packageAllocation, 200);

  assert.strictEqual(payableOf(subtotal, deliveryCharge, couponDiscount), 1400);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
