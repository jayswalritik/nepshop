/**
 * ─────────────────────────────────────────────────────────────────────────────
 * cartSummaryExtraction.test.js — run with:
 *   node backend/tests/cartSummaryExtraction.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for backend/utils/cartSummary.js's buildCartSummary — the logic
 * extracted verbatim from cartController.getCartSummary. NO DB connection: the
 * Cart / Coupon model STATICS are stubbed on their singleton exports (defining
 * a Mongoose model never opens a connection; only a real query would, and we
 * replace those). The money math underneath is the real orderPricing.js — not
 * reimplemented here — so these assertions exercise the actual delegation.
 *
 * Covers the four required cases:
 *   1 — single-seller cart under the free-delivery threshold
 *   2 — single-seller cart at/over the threshold (free delivery)
 *   3 — two-seller cart (per-package delivery)
 *   4 — coupon case: allocations sum EXACTLY to the discount
 * Plus the invariant grandTotal = itemsSubtotal + totalDelivery − totalDiscount
 * on every case, and the empty-cart shape.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const assert = require('assert');
const Cart = require('../models/Cart');
const { buildCartSummary } = require('../utils/cartSummary');

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

// ── Stubs (no DB) ────────────────────────────────────────────────────────────
// buildCartSummary does: await Cart.findOne({...}).populate(POPULATE)
const stubCart = (cartDoc) => {
  Cart.findOne = () => ({ populate: () => Promise.resolve(cartDoc) });
};

// buildCartSummary lazily does: const Coupon = require('../models/Coupon');
// then await Coupon.findOne({ code }). Stub that singleton's static.
const stubCoupon = (couponDoc) => {
  const Coupon = require('../models/Coupon');
  Coupon.findOne = () => Promise.resolve(couponDoc);
};

// A populated cart item shaped exactly how buildCartSummary reads it
// (item.product._id/name/images/stock/isActive/seller, item.price/quantity,
// item.selected). Defaults keep the item selected + non-stale.
const item = ({
  price, quantity = 1, sellerId, shopName = 'Shop',
  productId = 'p', name = 'Product', stock = 100, isActive = true, selected = true,
}) => ({
  price,
  quantity,
  selected,
  product: {
    _id: productId,
    name,
    images: [{ url: 'img' }],
    stock,
    isActive,
    seller: { _id: sellerId, shopName },
  },
});

const invariant = (s) =>
  assert.strictEqual(
    s.grandTotal,
    Math.round((s.itemsSubtotal + s.totalDelivery - s.totalDiscount) * 100) / 100,
    `grandTotal (${s.grandTotal}) != itemsSubtotal + totalDelivery - totalDiscount`
  );

const run = async () => {
  // ── 1. single seller, under free-delivery threshold ──────────────────────
  await test('single-seller under threshold: Rs 1000 → delivery 100, grandTotal 1100', async () => {
    stubCart({ items: [item({ price: 1000, sellerId: 'A' })] });
    const s = await buildCartSummary({ userId: 'u1', couponCode: undefined });

    assert.strictEqual(s.packages.length, 1);
    assert.strictEqual(s.itemsSubtotal, 1000);
    assert.strictEqual(s.totalDelivery, 100);
    assert.strictEqual(s.totalDiscount, 0);
    assert.strictEqual(s.grandTotal, 1100);
    assert.strictEqual(s.packages[0].deliveryCharge, 100);
    assert.strictEqual(s.coupon, null);
    invariant(s);
  });

  // ── 2. single seller, at/over threshold → free delivery ──────────────────
  await test('single-seller at threshold: Rs 2000 → delivery FREE, grandTotal 2000', async () => {
    stubCart({ items: [item({ price: 2000, sellerId: 'A' })] });
    const s = await buildCartSummary({ userId: 'u1', couponCode: undefined });

    assert.strictEqual(s.itemsSubtotal, 2000);
    assert.strictEqual(s.totalDelivery, 0);
    assert.strictEqual(s.grandTotal, 2000);
    assert.strictEqual(s.packages[0].deliveryCharge, 0);
    invariant(s);
  });

  // ── 3. two sellers → per-package delivery ────────────────────────────────
  await test('two-seller cart (1500 + 2500): per-package delivery, grandTotal 4100', async () => {
    stubCart({
      items: [
        item({ price: 1500, sellerId: 'A', productId: 'pa' }), // under → 100
        item({ price: 2500, sellerId: 'B', productId: 'pb' }), // over  → free
      ],
    });
    const s = await buildCartSummary({ userId: 'u1', couponCode: undefined });

    assert.strictEqual(s.packages.length, 2);
    assert.strictEqual(s.itemsSubtotal, 4000);
    assert.strictEqual(s.totalDelivery, 100);
    assert.strictEqual(s.grandTotal, 4100);

    const pa = s.packages.find((p) => p.seller === 'A');
    const pb = s.packages.find((p) => p.seller === 'B');
    assert.strictEqual(pa.packageSubtotal, 1500);
    assert.strictEqual(pa.deliveryCharge, 100);
    assert.strictEqual(pb.packageSubtotal, 2500);
    assert.strictEqual(pb.deliveryCharge, 0);
    invariant(s);
  });

  // ── 4. coupon: allocations sum EXACTLY to the discount ───────────────────
  await test('coupon Rs 200 over two lines (1000 + 500): allocations sum to 200, grandTotal 1400', async () => {
    stubCart({
      items: [
        item({ price: 1000, sellerId: 'A', productId: 'pa' }),
        item({ price: 500,  sellerId: 'A', productId: 'pb' }),
      ],
    });
    // Valid coupon returning a Rs 200 discount for the Rs 1500 subtotal.
    stubCoupon({
      code: 'SAVE200',
      validateFor: () => ({ valid: true, discount: 200, message: 'ok' }),
    });

    const s = await buildCartSummary({ userId: 'u1', couponCode: 'save200' });

    assert.strictEqual(s.itemsSubtotal, 1500);
    assert.strictEqual(s.totalDelivery, 100);
    assert.strictEqual(s.totalDiscount, 200);
    assert.strictEqual(s.grandTotal, 1400); // 1500 + 100 − 200
    assert.strictEqual(s.coupon.valid, true);
    assert.strictEqual(s.coupon.code, 'SAVE200');
    assert.strictEqual(s.coupon.discount, 200);

    // Per-package allocations sum EXACTLY to the discount (last unit absorbs
    // the rounding remainder — the real allocateCouponDiscount guarantee).
    const allocSum = Math.round(
      s.packages.reduce((sum, p) => sum + p.couponAllocation, 0) * 100
    ) / 100;
    assert.strictEqual(allocSum, 200);
    invariant(s);
  });

  // ── 5. invalid coupon → discount 0, coupon.valid false, grandTotal ignores it
  await test('invalid coupon code → discount 0, grandTotal unchanged', async () => {
    stubCart({ items: [item({ price: 1000, sellerId: 'A' })] });
    stubCoupon(null); // Coupon.findOne returns nothing

    const s = await buildCartSummary({ userId: 'u1', couponCode: 'NOPE' });
    assert.strictEqual(s.coupon.valid, false);
    assert.strictEqual(s.totalDiscount, 0);
    assert.strictEqual(s.grandTotal, 1100);
    invariant(s);
  });

  // ── 6. empty cart → empty summary shape ──────────────────────────────────
  await test('empty cart → emptySummary shape', async () => {
    stubCart({ items: [] });
    const s = await buildCartSummary({ userId: 'u1', couponCode: undefined });
    assert.deepStrictEqual(s, {
      packages: [],
      itemsSubtotal: 0,
      totalDelivery: 0,
      totalDiscount: 0,
      grandTotal: 0,
      coupon: null,
    });
  });

  // ── 7. no cart at all → empty summary shape ──────────────────────────────
  await test('no cart document → emptySummary shape', async () => {
    stubCart(null);
    const s = await buildCartSummary({ userId: 'u1', couponCode: undefined });
    assert.strictEqual(s.packages.length, 0);
    assert.strictEqual(s.grandTotal, 0);
    assert.strictEqual(s.coupon, null);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
};

run();
