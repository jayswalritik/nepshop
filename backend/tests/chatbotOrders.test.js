/**
 * ─────────────────────────────────────────────────────────────────────────────
 * chatbotOrders.test.js — run with: node backend/tests/chatbotOrders.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure-function tests for the shipment-aware chatbot ORDER layer:
 *   - orderActions.toChatOrder  (per-package `packages`, shipment-level refund)
 *   - templates.trackingReply / statusFilterReply / orderStatusLine
 * No DB connection: toChatOrder and the templates are pure — they receive
 * already-shaped order objects (with a `shipments` array, exactly what
 * attachShipments attaches) and return strings/objects. Requiring the modules
 * only DEFINES the Mongoose models (never opens a connection); no query runs.
 *
 * Covers:
 *   1 — single-package phrasing is byte-identical to the pre-change output
 *   2 — a {delivered, dispatched} order names BOTH package states
 *   3 — statusFilter "which is delivered?" surfaces a delivered package inside
 *       a still-moving order
 *   4 — refund reads a non-zero SHIPMENT-level value
 *   5 — an order with no shipments degrades gracefully
 * ─────────────────────────────────────────────────────────────────────────────
 */

const assert = require('assert');
const { toChatOrder } = require('../services/chatbot/orderActions');
const templates = require('../services/chatbot/templates');

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

// Minimal shipment shaped as attachShipments would leave it (full doc + a
// populated seller / deliveryAgent). Only the fields toChatPackage reads.
const ship = (over = {}) => ({
  status: 'confirmed',
  items: [{ name: 'Item' }],
  seller: { shopName: 'Shop' },
  deliveryAgent: null,
  deliveredAt: null,
  sellerSubtotal: 1000,
  deliveryCharge: 100,
  couponAllocation: 0,
  settlement: { refundToCustomer: 0 },
  ...over,
});

const order = (over = {}) => ({
  _id: '000000000000000000123456',
  status: 'confirmed',
  total: 1100,
  items: [{ name: 'Widget', image: 'img' }],
  createdAt: new Date('2026-07-01'),
  deliveredAt: null,
  deliveryAgent: null,
  settlement: { refundToCustomer: 0 },
  shipments: [ship()],
  ...over,
});

// ─────────────────────────────────────────────────────────
// 1 — single-package phrasing is byte-identical to today
// ─────────────────────────────────────────────────────────
test('single-package tracking reply is byte-identical to the pre-change format', () => {
  const o = order();
  const card = toChatOrder(o);

  assert.strictEqual(card.packages.length, 1);

  const reply = templates.trackingReply({ activeOrders: [card], latestOrder: null, everOrdered: true });
  const shortId = o._id.slice(-6).toUpperCase();
  const expected = `Your order #${shortId} (Widget, ${templates.formatRs(1100)}) is confirmed — the seller is preparing it.`;
  assert.strictEqual(reply, expected);
});

// ─────────────────────────────────────────────────────────
// 2 — {delivered, dispatched} names BOTH package states
// ─────────────────────────────────────────────────────────
test('multi-package tracking reply names each package status, seller and count', () => {
  const o = order({
    status: 'dispatched', // derived least-advanced-active
    total: 3000,
    items: [{ name: 'A', image: null }, { name: 'B' }],
    shipments: [
      ship({ status: 'delivered',  items: [{ name: 'A' }], seller: { shopName: 'Shop A' }, deliveredAt: new Date('2026-07-05') }),
      ship({ status: 'dispatched', items: [{ name: 'B' }], seller: { shopName: 'Shop B' }, deliveryAgent: { firstName: 'Ram', lastName: 'K' }, deliveryCharge: 0, sellerSubtotal: 2000 }),
    ],
  });
  const card = toChatOrder(o);
  assert.strictEqual(card.packages.length, 2);

  const reply = templates.trackingReply({ activeOrders: [card], latestOrder: null, everOrdered: true });
  assert.ok(reply.includes('2 packages'), 'mentions package count');
  assert.ok(reply.includes('Package 1 (Shop A)'), 'names package 1 seller');
  assert.ok(reply.includes('Package 2 (Shop B)'), 'names package 2 seller');
  assert.ok(reply.includes('was delivered'), 'reports the delivered package');
  assert.ok(reply.includes('is out for delivery'), 'reports the dispatched package');
});

// ─────────────────────────────────────────────────────────
// 3 — statusFilter surfaces a delivered package inside a moving order
// ─────────────────────────────────────────────────────────
test('statusFilter "delivered" surfaces a delivered package inside a moving order', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'delivered',  seller: { shopName: 'Shop A' }, deliveredAt: new Date('2026-07-05') }),
      ship({ status: 'dispatched', seller: { shopName: 'Shop B' } }),
    ],
  });
  const card = toChatOrder(o);

  // The predicate the service uses to select matching orders.
  const orderHasDelivered = card.packages.some((p) => p.status === 'delivered');
  assert.strictEqual(orderHasDelivered, true, 'order with a delivered package is matched');

  const reply = templates.statusFilterReply([card], 'delivered', 'delivered');
  assert.ok(reply.includes('delivered'), 'reply is about delivered');
  assert.ok(reply.includes('Package 1'), 'names the delivered package');
  assert.ok(reply.includes('Shop A'), 'names the delivered package seller');
});

// ─────────────────────────────────────────────────────────
// 4 — refund reads a non-zero SHIPMENT-level value
// ─────────────────────────────────────────────────────────
test('refund is read from shipment.settlement.refundToCustomer, not order-level', () => {
  const o = order({
    status: 'returned',
    total: 1000,
    items: [{ name: 'Cable' }],
    deliveredAt: new Date('2026-07-02'),
    settlement: { refundToCustomer: 0 }, // order-level stays 0 post-migration
    shipments: [
      ship({ status: 'returned', items: [{ name: 'Cable' }], seller: { shopName: 'Cables Inc' },
             deliveredAt: new Date('2026-07-02'), deliveryCharge: 0,
             settlement: { refundToCustomer: 139.47 } }),
    ],
  });
  const card = toChatOrder(o);

  assert.strictEqual(card.refund, 139.47);
  assert.ok(templates.orderStatusLine(card).includes(templates.formatRs(139.47)),
    'the returned status line surfaces the shipment-level refund');
});

// ─────────────────────────────────────────────────────────
// 5 — order with no shipments degrades gracefully
// ─────────────────────────────────────────────────────────
test('order with no shipments degrades gracefully (empty packages, 0 refund, still phrases)', () => {
  const o = order({
    total: 500,
    items: [{ name: 'Thing' }],
    shipments: [],
  });
  const card = toChatOrder(o);

  assert.deepStrictEqual(card.packages, []);
  assert.strictEqual(card.refund, 0);

  const reply = templates.trackingReply({ activeOrders: [card], latestOrder: null, everOrdered: true });
  const shortId = o._id.slice(-6).toUpperCase();
  assert.strictEqual(
    reply,
    `Your order #${shortId} (Thing, ${templates.formatRs(500)}) is confirmed — the seller is preparing it.`
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
