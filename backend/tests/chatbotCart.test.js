/**
 * ─────────────────────────────────────────────────────────────────────────────
 * chatbotCart.test.js — run with: node backend/tests/chatbotCart.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests the three-block cart reply and the additive buildCartSummary change.
 * No DB connection: templates.cartViewReply is pure; buildCartSummary is
 * exercised with the Cart model's `findOne` static stubbed (defining a model
 * never opens a connection — only a real query would, and that's replaced).
 *
 * Covers:
 *   1 — ticked-only cart → no empty blocks
 *   2 — all three groups → each labelled, with correct rows
 *   3 — the ticked block's grand total == buildCartSummary.grandTotal
 *   4 — not-ticked / stale blocks carry NO total
 *   5 — empty cart → the existing empty-cart reply
 *   6 — buildCartSummary's new keys do NOT leak into the HTTP summary shape
 *   7 — includeExcluded partitions items into ticked / notSelected / stale
 * ─────────────────────────────────────────────────────────────────────────────
 */

const assert = require('assert');
const Cart = require('../models/Cart');
const { buildCartSummary } = require('../utils/cartSummary');
const templates = require('../services/chatbot/templates');

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

// buildCartSummary does: await Cart.findOne({...}).populate(POPULATE)
const stubCart = (cartDoc) => {
  Cart.findOne = () => ({ populate: () => Promise.resolve(cartDoc) });
};

// A populated cart item shaped how buildCartSummary/cartSelection read it.
const item = ({
  price, quantity = 1, selected = true, sellerId = 'A', shopName = 'Shop A',
  productId = 'p', name = 'Widget', stock = 100, isActive = true,
}) => ({
  price, quantity, selected,
  product: {
    _id: productId, name, images: [{ url: 'img' }], price, stock, isActive,
    seller: { _id: sellerId, shopName },
  },
});

const run = async () => {
  // ── 1. ticked-only → no empty blocks ─────────────────────────────────────
  await test('ticked-only cart reply has no empty not-ticked/stale blocks', () => {
    const summary = {
      packages: [{ sellerName: 'Shop A', deliveryCharge: 0, packageSubtotal: 2000, couponAllocation: 0,
                   items: [{ name: 'Widget', quantity: 2 }] }],
      itemsSubtotal: 2000, totalDelivery: 0, totalDiscount: 0, grandTotal: 2000, coupon: null,
      notSelectedItems: [], staleItems: [],
    };
    const reply = templates.cartViewReply(summary);
    assert.ok(reply.includes('Ready to check out'), 'has ticked block');
    assert.ok(!reply.includes('Not ticked'), 'no not-ticked block');
    assert.ok(!reply.includes('Needs a look'), 'no stale block');
    assert.ok(reply.includes('Total to pay: Rs 2,000'), 'shows grand total');
  });

  // ── 2. all three groups labelled ─────────────────────────────────────────
  await test('all three groups render with clear labels and rows', () => {
    const summary = {
      packages: [{ sellerName: 'Shop A', deliveryCharge: 100, packageSubtotal: 1000, couponAllocation: 0,
                   items: [{ name: 'Widget', quantity: 1 }] }],
      itemsSubtotal: 1000, totalDelivery: 100, totalDiscount: 0, grandTotal: 1100, coupon: null,
      notSelectedItems: [{ name: 'Gadget', quantity: 3, price: 250 }],
      staleItems: [{ name: 'Gizmo', quantity: 1, price: 500, staleReason: 'out of stock' }],
    };
    const reply = templates.cartViewReply(summary);
    assert.ok(reply.includes('✅ Ready to check out'), 'ticked label');
    assert.ok(reply.includes('🕗 Not ticked'), 'not-ticked label');
    assert.ok(reply.includes('⚠️ Needs a look'), 'stale label');
    assert.ok(reply.includes('Widget × 1'), 'ticked item row');
    assert.ok(reply.includes('Gadget × 3'), 'not-ticked item row');
    assert.ok(reply.includes('Gizmo × 1 — out of stock'), 'stale item row with reason');
    assert.ok(reply.includes('Total to pay: Rs 1,100'), 'grand total');
  });

  // ── 3 + 4. grand total matches; excluded blocks carry NO total ───────────
  await test('grand total shows once; not-ticked & stale blocks carry no total', () => {
    const summary = {
      packages: [{ sellerName: 'Shop A', deliveryCharge: 100, packageSubtotal: 1000, couponAllocation: 0,
                   items: [{ name: 'Widget', quantity: 1 }] }],
      itemsSubtotal: 1000, totalDelivery: 100, totalDiscount: 0, grandTotal: 1100, coupon: null,
      notSelectedItems: [{ name: 'Gadget', quantity: 3, price: 250 }],
      staleItems: [{ name: 'Gizmo', quantity: 1, price: 500, staleReason: 'out of stock' }],
    };
    const reply = templates.cartViewReply(summary);
    assert.strictEqual(reply.split('Total to pay').length - 1, 1, 'exactly one grand total');
    const staleSection = reply.slice(reply.indexOf('⚠️ Needs a look'));
    assert.ok(!staleSection.includes('Rs'), 'stale block shows no money');
    const notTicked = reply.slice(reply.indexOf('🕗'), reply.indexOf('⚠️'));
    assert.ok(!/Total/i.test(notTicked), 'not-ticked block shows no total');
  });

  // ── 5. empty cart → existing empty-cart reply ────────────────────────────
  await test('empty cart produces the existing empty-cart reply', async () => {
    stubCart({ items: [] });
    const summary = await buildCartSummary({ userId: 'u1', includeExcluded: true });
    assert.strictEqual(
      templates.cartViewReply(summary),
      'Your cart is empty right now — want me to help you find something?'
    );
  });

  // ── 6. new keys do NOT leak into the HTTP summary shape ──────────────────
  await test('buildCartSummary without includeExcluded returns only the 6 HTTP keys', async () => {
    stubCart({ items: [item({ price: 1000, quantity: 1 })] });
    const httpShape = await buildCartSummary({ userId: 'u1', couponCode: undefined });
    assert.deepStrictEqual(
      Object.keys(httpShape).sort(),
      ['coupon', 'grandTotal', 'itemsSubtotal', 'packages', 'totalDelivery', 'totalDiscount'].sort()
    );
    assert.strictEqual(httpShape.notSelectedItems, undefined, 'no notSelectedItems leak');
    assert.strictEqual(httpShape.staleItems, undefined, 'no staleItems leak');
  });

  // ── 7. includeExcluded partitions ticked / notSelected / stale; total matches
  await test('includeExcluded partitions items and reply total matches grandTotal', async () => {
    stubCart({ items: [
      item({ price: 1000, quantity: 1, selected: true,  productId: 'p1', name: 'Widget' }),               // ticked
      item({ price: 250,  quantity: 3, selected: false, productId: 'p2', name: 'Gadget' }),               // not ticked
      item({ price: 500,  quantity: 1, selected: true,  productId: 'p3', name: 'Gizmo', stock: 0 }),      // stale (out of stock)
    ]});
    const s = await buildCartSummary({ userId: 'u1', includeExcluded: true });
    assert.strictEqual(s.packages.length, 1, 'one ticked package');
    assert.strictEqual(s.notSelectedItems.length, 1, 'one not-ticked item');
    assert.strictEqual(s.notSelectedItems[0].name, 'Gadget');
    assert.strictEqual(s.staleItems.length, 1, 'one stale item');
    assert.strictEqual(s.staleItems[0].name, 'Gizmo');
    assert.strictEqual(s.staleItems[0].staleReason, 'out of stock');

    const reply = templates.cartViewReply(s);
    assert.ok(reply.includes(`Total to pay: ${templates.formatRs(s.grandTotal)}`), 'reply total == grandTotal');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
};

run();
