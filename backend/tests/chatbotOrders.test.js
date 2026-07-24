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
const { toChatOrder, resolveOrderTarget, resolveListTarget, packageAsCard } = require('../services/chatbot/orderActions');
const { detectIntent, INTENTS } = require('../services/chatbot/intentRouter');
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

// ─────────────────────────────────────────────────────────
// 6 — multi-package top-level refund is null (not 0)
// ─────────────────────────────────────────────────────────
test('multi-package order: top-level refund is null, not 0', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'delivered',  seller: { shopName: 'Shop A' } }),
      ship({ status: 'dispatched', seller: { shopName: 'Shop B' } }),
    ],
  });
  const card = toChatOrder(o);
  assert.strictEqual(card.refund, null);
  // Per-package refunds are still their own real values.
  assert.strictEqual(card.packages.length, 2);
});

// ─────────────────────────────────────────────────────────
// 7 — multi-package returned line names sellers, no currency
// ─────────────────────────────────────────────────────────
test('multi-package returned line names sellers and contains no currency figure', () => {
  const o = order({
    status: 'returned',
    total: 3000,
    shipments: [
      ship({ status: 'returned', seller: { shopName: 'Shop A' }, settlement: { refundToCustomer: 500 } }),
      ship({ status: 'returned', seller: { shopName: 'Shop B' }, settlement: { refundToCustomer: 700 } }),
    ],
  });
  const line = templates.orderStatusLine(toChatOrder(o));
  assert.ok(line.includes('Shop A'), 'names the first seller');
  assert.ok(line.includes('Shop B'), 'names the second seller');
  assert.ok(line.includes('refund is being processed'), 'states a refund is being processed');
  assert.ok(!line.includes('Rs'), 'no currency figure in multi-package returned prose');
});

// ─────────────────────────────────────────────────────────
// 8 — two-seller cap then "and N others" (4 packages, 3 returned)
// ─────────────────────────────────────────────────────────
test('multi-package returned line caps at two sellers then "and N others"', () => {
  const o = order({
    status: 'returned',
    shipments: [
      ship({ status: 'returned',  seller: { shopName: 'Shop A' }, settlement: { refundToCustomer: 100 } }),
      ship({ status: 'returned',  seller: { shopName: 'Shop B' }, settlement: { refundToCustomer: 100 } }),
      ship({ status: 'returned',  seller: { shopName: 'Shop C' }, settlement: { refundToCustomer: 100 } }),
      ship({ status: 'cancelled', seller: { shopName: 'Shop D' } }),
    ],
  });
  const line = templates.orderStatusLine(toChatOrder(o));
  assert.ok(line.includes('Shop A') && line.includes('Shop B'), 'names the first two sellers');
  assert.ok(line.includes('and 1 other'), 'folds the rest into "and N others"');
  assert.ok(!line.includes('Shop C'), 'third returned seller is not named');
  assert.ok(!line.includes('Rs'), 'no currency figure');
});

// ─────────────────────────────────────────────────────────
// 9 — single-package returned line stays byte-identical (keeps its amount)
// ─────────────────────────────────────────────────────────
test('single-package returned line is byte-identical (keeps its refund amount)', () => {
  const o = order({
    status: 'returned',
    total: 1000,
    items: [{ name: 'Cable' }],
    settlement: { refundToCustomer: 0 },
    shipments: [
      ship({ status: 'returned', seller: { shopName: 'Cables Inc' }, settlement: { refundToCustomer: 139.47 } }),
    ],
  });
  assert.strictEqual(
    templates.orderStatusLine(toChatOrder(o)),
    `was returned — your refund of ${templates.formatRs(139.47)} is being processed`
  );
});

// ─────────────────────────────────────────────────────────
// 10 — a delivered package inside its window gets a returnWindowLabel
// ─────────────────────────────────────────────────────────
test('delivered package inside the window gets a backend-built returnWindowLabel', () => {
  const o = order({
    status: 'delivered',
    deliveredAt: new Date(),
    shipments: [ship({ status: 'delivered', seller: { shopName: 'Shop A' }, deliveredAt: new Date() })],
  });
  const p = toChatOrder(o).packages[0];
  assert.ok(typeof p.returnWindowLabel === 'string', 'label is a string');
  assert.ok(p.returnWindowLabel.startsWith('Returnable —'), 'label is ready-to-print');
  assert.ok(p.returnWindowLabel.endsWith('left'), 'label ends with "left"');
  assert.ok(p.returnMinutesLeft >= 0, 'minutes-left is a non-negative number');
});

// ─────────────────────────────────────────────────────────
// 11 — a delivered package PAST its window → null label
// ─────────────────────────────────────────────────────────
test('a delivered package past its return window has a null returnWindowLabel', () => {
  const o = order({
    status: 'delivered',
    deliveredAt: new Date('2020-01-01'),
    shipments: [ship({ status: 'delivered', seller: { shopName: 'Shop A' }, deliveredAt: new Date('2020-01-01') })],
  });
  const p = toChatOrder(o).packages[0];
  assert.strictEqual(p.returnWindowLabel, null);
  assert.strictEqual(p.returnMinutesLeft, 0);
});

// ─────────────────────────────────────────────────────────
// 12 — a non-delivered package → null label
// ─────────────────────────────────────────────────────────
test('a non-delivered package has a null returnWindowLabel', () => {
  const o = order({
    status: 'dispatched',
    shipments: [ship({ status: 'dispatched', seller: { shopName: 'Shop A' }, deliveredAt: null })],
  });
  const p = toChatOrder(o).packages[0];
  assert.strictEqual(p.returnWindowLabel, null);
  assert.strictEqual(p.returnMinutesLeft, 0);
});

// ─────────────────────────────────────────────────────────
// 13 — plural fix: three returned names read "1 other package" (singular)
// ─────────────────────────────────────────────────────────
test('multi-package returned line reads "1 other package" (singular noun) at three names', () => {
  const o = order({
    status: 'returned',
    shipments: [
      ship({ status: 'returned', seller: { shopName: 'Shop A' }, settlement: { refundToCustomer: 100 } }),
      ship({ status: 'returned', seller: { shopName: 'Shop B' }, settlement: { refundToCustomer: 100 } }),
      ship({ status: 'returned', seller: { shopName: 'Shop C' }, settlement: { refundToCustomer: 100 } }),
    ],
  });
  const line = templates.orderStatusLine(toChatOrder(o));
  assert.ok(line.includes('and 1 other package returned'), 'noun agrees with "1 other" (singular)');
  assert.ok(!line.includes('1 other packages'), 'no longer the mismatched "1 other packages"');
});

// ─────────────────────────────────────────────────────────
// 14 — plural noun-phrase: exact output at one / two / three / four shops
// ─────────────────────────────────────────────────────────
test('returned noun-phrase reads correctly at 1/2/3/4 returned shops', () => {
  const returnedOrder = (shops) => order({
    status: 'returned',
    shipments: shops.map((name) =>
      ship({ status: 'returned', seller: { shopName: name }, settlement: { refundToCustomer: 100 } })),
  });
  const line = (shops) => templates.orderStatusLine(toChatOrder(returnedOrder(shops)));

  // 1 & 2 shops need ≥2 packages to be MULTI; pad with a cancelled package so
  // the order is multi-package but only the named shops are 'returned'.
  const multi1 = order({
    status: 'returned',
    shipments: [
      ship({ status: 'returned',  seller: { shopName: 'Shop A' }, settlement: { refundToCustomer: 100 } }),
      ship({ status: 'cancelled', seller: { shopName: 'Shop Z' } }),
    ],
  });
  assert.strictEqual(
    templates.orderStatusLine(toChatOrder(multi1)),
    'had the Shop A package returned — a refund is being processed');

  assert.strictEqual(
    line(['Shop A', 'Shop B']),
    'had the Shop A and Shop B packages returned — a refund is being processed');

  assert.strictEqual(
    line(['Shop A', 'Shop B', 'Shop C']),
    'had the Shop A, Shop B and 1 other package returned — a refund is being processed');

  assert.strictEqual(
    line(['Shop A', 'Shop B', 'Shop C', 'Shop D']),
    'had the Shop A, Shop B and 2 other packages returned — a refund is being processed');
});

// ─────────────────────────────────────────────────────────
// 15 — single-package switch branches are byte-identical (Step 1.3),
//      and the grouped opt-in cannot change a single-package output
// ─────────────────────────────────────────────────────────
test('orderStatusLine single-package switch branches are byte-identical', () => {
  const S = (status, extra = {}) => templates.orderStatusLine({ status, ...extra });
  assert.strictEqual(S('pending'), 'is placed and waiting for the seller to confirm');
  assert.strictEqual(S('confirmed'), 'is confirmed — the seller is preparing it');
  assert.strictEqual(S('packed'), 'is packed and ready for pickup');
  assert.strictEqual(S('dispatched'), 'is out for delivery 🚚');
  assert.strictEqual(S('dispatched', { agentName: 'Ram' }), 'is out for delivery with Ram 🚚');
  assert.strictEqual(S('delivered'), 'was delivered ✅');
  assert.strictEqual(S('delivered', { deliveredAt: new Date('2026-07-05') }), 'was delivered on 5 Jul ✅');
  assert.strictEqual(S('cancelled'), 'was cancelled');
  assert.strictEqual(S('weird'), 'has status "weird"');

  // A single-package order (packages.length === 1) is never multi, so grouped=true
  // is a no-op — identical to grouped=false on every branch.
  const single = { status: 'delivered', packages: [{ status: 'delivered', sellerName: 'Shop A' }] };
  assert.strictEqual(templates.orderStatusLine(single, true), templates.orderStatusLine(single, false));
});

// ─────────────────────────────────────────────────────────
// 16 — a PACKAGE arg (via packageLine) is unaffected by grouping
// ─────────────────────────────────────────────────────────
test('orderStatusLine on a PACKAGE arg is unaffected (no .packages → grouped can never trigger)', () => {
  const pkg = { status: 'dispatched', sellerName: 'Shop A', index: 1 };
  assert.strictEqual(templates.orderStatusLine(pkg), 'is out for delivery 🚚');
  assert.strictEqual(templates.orderStatusLine(pkg, true), 'is out for delivery 🚚');
});

// ─────────────────────────────────────────────────────────
// 17 — multi-package, all same status, opt-in set → today's wording
// ─────────────────────────────────────────────────────────
test('multi-package all-same-status: opt-in yields the SAME wording as no opt-in', () => {
  const o = order({
    status: 'delivered',
    shipments: [
      ship({ status: 'delivered', seller: { shopName: 'Shop A' } }),
      ship({ status: 'delivered', seller: { shopName: 'Shop B' } }),
    ],
  });
  const card = toChatOrder(o);
  assert.strictEqual(templates.orderStatusLine(card, true), templates.orderStatusLine(card, false));
});

// ─────────────────────────────────────────────────────────
// 18 — mixed multi-package WITHOUT opt-in collapses (line 195 path is safe)
// ─────────────────────────────────────────────────────────
test('mixed multi-package without opt-in collapses to the derived status (line 195 is safe)', () => {
  const o = order({
    status: 'dispatched', // derived least-advanced-active
    shipments: [
      ship({ status: 'returned',   seller: { shopName: 'Shop A' }, settlement: { refundToCustomer: 100 } }),
      ship({ status: 'dispatched', seller: { shopName: 'Shop B' } }),
    ],
  });
  const card = toChatOrder(o);
  assert.strictEqual(templates.orderStatusLine(card), 'is out for delivery 🚚');
  assert.strictEqual(templates.orderStatusLine(card, false), 'is out for delivery 🚚');
});

// ─────────────────────────────────────────────────────────
// 19 — opt-in: returned + delivered surfaces BOTH, returned first
// ─────────────────────────────────────────────────────────
test('opt-in: returned + delivered names both, returned clause first, no money', () => {
  const o = order({
    status: 'delivered',
    shipments: [
      ship({ status: 'delivered', seller: { shopName: 'Shop B' } }),
      ship({ status: 'returned',  seller: { shopName: 'Shop A' }, settlement: { refundToCustomer: 100 } }),
    ],
  });
  const line = templates.orderStatusLine(toChatOrder(o), true);
  assert.strictEqual(line,
    "Shop A's package was returned and your refund is being processed. Shop B's package was delivered");
  assert.ok(!line.includes('Rs'), 'no money figure');
});

// ─────────────────────────────────────────────────────────
// 20 — opt-in: returned + dispatched reads like the target predicate
// ─────────────────────────────────────────────────────────
test('opt-in: returned + dispatched reads like the target predicate', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'returned',   seller: { shopName: 'Shop A' }, settlement: { refundToCustomer: 100 } }),
      ship({ status: 'dispatched', seller: { shopName: 'Shop B' } }),
    ],
  });
  const line = templates.orderStatusLine(toChatOrder(o), true);
  assert.strictEqual(line,
    "Shop A's package was returned and your refund is being processed. Shop B's package is on the way");
});

// ─────────────────────────────────────────────────────────
// 21 — opt-in: two shops sharing a status squash into one clause
// ─────────────────────────────────────────────────────────
test('opt-in: two shops sharing a status squash ("Shop B and Shop C\'s packages")', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'returned',   seller: { shopName: 'Shop A' }, settlement: { refundToCustomer: 100 } }),
      ship({ status: 'dispatched', seller: { shopName: 'Shop B' } }),
      ship({ status: 'dispatched', seller: { shopName: 'Shop C' } }),
    ],
  });
  const line = templates.orderStatusLine(toChatOrder(o), true);
  assert.strictEqual(line,
    "Shop A's package was returned and your refund is being processed. Shop B and Shop C's packages are on the way");
});

// ─────────────────────────────────────────────────────────
// 22 — opt-in: 5+ distinct shops drop names for counts
// ─────────────────────────────────────────────────────────
test('opt-in: 5+ distinct shops use counts, no shop names', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'returned',   seller: { shopName: 'Shop A' }, settlement: { refundToCustomer: 100 } }),
      ship({ status: 'dispatched', seller: { shopName: 'Shop B' } }),
      ship({ status: 'dispatched', seller: { shopName: 'Shop C' } }),
      ship({ status: 'dispatched', seller: { shopName: 'Shop D' } }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop E' } }),
    ],
  });
  const line = templates.orderStatusLine(toChatOrder(o), true);
  assert.strictEqual(line,
    '1 package was returned and your refund is being processed. 3 packages are on the way. 1 package was delivered');
  assert.ok(!line.includes('Shop'), 'no shop names in count mode');
});

// ─────────────────────────────────────────────────────────
// 23 — opt-in: clause order is returned → active → delivered → cancelled
// ─────────────────────────────────────────────────────────
test('opt-in: clause order returned < active < delivered < cancelled', () => {
  const o = order({
    status: 'confirmed',
    shipments: [
      ship({ status: 'cancelled', seller: { shopName: 'Shop D' } }),
      ship({ status: 'delivered', seller: { shopName: 'Shop C' } }),
      ship({ status: 'confirmed', seller: { shopName: 'Shop B' } }),
      ship({ status: 'returned',  seller: { shopName: 'Shop A' }, settlement: { refundToCustomer: 100 } }),
    ],
  });
  const line = templates.orderStatusLine(toChatOrder(o), true);
  const iRet = line.indexOf('returned and your refund');
  const iAct = line.indexOf('is being prepared');
  const iDel = line.indexOf('was delivered');
  const iCan = line.indexOf('was cancelled');
  assert.ok(iRet >= 0 && iAct >= 0 && iDel >= 0 && iCan >= 0, 'all four clauses present');
  assert.ok(iRet < iAct && iAct < iDel && iDel < iCan, 'returned < active < delivered < cancelled');
});

// ─────────────────────────────────────────────────────────
// 24 — grouped delivered: two shops on the SAME date squash, date shown
// ─────────────────────────────────────────────────────────
test('grouped delivered: two shops delivered on the same date squash into one dated clause', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'dispatched', seller: { shopName: 'Shop Z' } }), // forces mixed status
      ship({ status: 'delivered',  seller: { shopName: 'Shop A' }, deliveredAt: new Date('2026-07-05') }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop B' }, deliveredAt: new Date('2026-07-05') }),
    ],
  });
  const line = templates.orderStatusLine(toChatOrder(o), true);
  assert.strictEqual(line,
    "Shop Z's package is on the way. Shop A and Shop B's packages were delivered on 5 Jul");
});

// ─────────────────────────────────────────────────────────
// 25 — grouped delivered: different dates split, oldest first
// ─────────────────────────────────────────────────────────
test('grouped delivered: different dates split into two clauses, oldest date first', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'dispatched', seller: { shopName: 'Shop Z' } }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop B' }, deliveredAt: new Date('2026-07-10') }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop A' }, deliveredAt: new Date('2026-07-05') }),
    ],
  });
  const line = templates.orderStatusLine(toChatOrder(o), true);
  assert.strictEqual(line,
    "Shop Z's package is on the way. Shop A's package was delivered on 5 Jul. Shop B's package was delivered on 10 Jul");
});

// ─────────────────────────────────────────────────────────
// 26 — grouped delivered: three shops, two sharing a date → two clauses
// ─────────────────────────────────────────────────────────
test('grouped delivered: three shops, two sharing a date, group correctly', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'dispatched', seller: { shopName: 'Shop Z' } }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop A' }, deliveredAt: new Date('2026-07-05') }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop B' }, deliveredAt: new Date('2026-07-05') }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop C' }, deliveredAt: new Date('2026-07-10') }),
    ],
  });
  const line = templates.orderStatusLine(toChatOrder(o), true);
  assert.ok(line.includes("Shop A and Shop B's packages were delivered on 5 Jul"), 'same-date pair squashes');
  assert.ok(line.includes("Shop C's package was delivered on 10 Jul"), 'later date is its own clause');
  assert.ok(line.indexOf('on 5 Jul') < line.indexOf('on 10 Jul'), 'oldest date first');
});

// ─────────────────────────────────────────────────────────
// 27 — grouped delivered: MISSING date → dateless clause, package present
// ─────────────────────────────────────────────────────────
test('grouped delivered: a missing date yields a dateless clause, package still named', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'dispatched', seller: { shopName: 'Shop Z' } }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop A' }, deliveredAt: null }),
    ],
  });
  const line = templates.orderStatusLine(toChatOrder(o), true);
  assert.ok(line.includes("Shop A's package was delivered"), 'delivered package is still present');
  assert.ok(!line.includes('delivered on'), 'no date is invented for a dateless package');
});

// ─────────────────────────────────────────────────────────
// 28 — grouped delivered: INVALID date → dateless clause, package present
// ─────────────────────────────────────────────────────────
test('grouped delivered: an invalid date yields a dateless clause (never "Invalid Date")', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'dispatched', seller: { shopName: 'Shop Z' } }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop A' }, deliveredAt: 'not-a-date' }),
    ],
  });
  const line = templates.orderStatusLine(toChatOrder(o), true);
  assert.ok(line.includes("Shop A's package was delivered"), 'delivered package is still present');
  assert.ok(!line.includes('Invalid Date'), 'invalid date never leaks into prose');
  assert.ok(!line.includes('delivered on'), 'no date shown for an unparseable value');
});

// ─────────────────────────────────────────────────────────
// 29 — grouped delivered: dated clauses first, dateless last
// ─────────────────────────────────────────────────────────
test('grouped delivered: dated clauses come before the dateless clause', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'dispatched', seller: { shopName: 'Shop Z' } }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop A' }, deliveredAt: new Date('2026-07-05') }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop B' }, deliveredAt: null }),
    ],
  });
  const line = templates.orderStatusLine(toChatOrder(o), true);
  assert.strictEqual(line,
    "Shop Z's package is on the way. Shop A's package was delivered on 5 Jul. Shop B's package was delivered");
});

// ─────────────────────────────────────────────────────────
// 30 — grouped delivered: 5+ distinct shops stay dateless counts
// ─────────────────────────────────────────────────────────
test('grouped delivered: 5+ distinct shops keep the dateless count form', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'returned',   seller: { shopName: 'Shop A' }, settlement: { refundToCustomer: 100 } }),
      ship({ status: 'dispatched', seller: { shopName: 'Shop B' } }),
      ship({ status: 'dispatched', seller: { shopName: 'Shop C' } }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop D' }, deliveredAt: new Date('2026-07-05') }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop E' }, deliveredAt: new Date('2026-07-10') }),
    ],
  });
  const line = templates.orderStatusLine(toChatOrder(o), true);
  assert.strictEqual(line,
    '1 package was returned and your refund is being processed. 2 packages are on the way. 2 packages were delivered');
  assert.ok(!line.includes('on 5 Jul') && !line.includes('Shop'), 'count mode stays dateless and nameless');
});

// ─────────────────────────────────────────────────────────
// 31 — grouped delivered with a date does not disturb clause ordering
// ─────────────────────────────────────────────────────────
test('grouped delivered: returned clause still leads a returned + dated-delivered order', () => {
  const o = order({
    status: 'delivered',
    shipments: [
      ship({ status: 'delivered', seller: { shopName: 'Shop B' }, deliveredAt: new Date('2026-07-05') }),
      ship({ status: 'returned',  seller: { shopName: 'Shop A' }, settlement: { refundToCustomer: 100 } }),
    ],
  });
  const line = templates.orderStatusLine(toChatOrder(o), true);
  assert.strictEqual(line,
    "Shop A's package was returned and your refund is being processed. Shop B's package was delivered on 5 Jul");
});

// ─────────────────────────────────────────────────────────
// ORDER_FOLLOW_UP assembled reply (chatbotService.js:267)
// ─────────────────────────────────────────────────────────
// The line-267 reply is an inline template literal, not exported. Per the
// prompt, we REPRODUCE it EXACTLY here rather than restructure non-writable
// code to export it. Keep byte-for-byte in sync with chatbotService.js:267:
//   `Your order #${shortId} (${itemSummary}, ${formatRs(total)}) ${predicate}` + trailing period unless predicate already ends with one.
const assembleFollowUp = (target) => {
  const predicate = templates.orderStatusLine(target, true);
  return `Your order #${target.shortId} (${target.itemSummary}, ${templates.formatRs(target.total)}) ${predicate}${predicate.endsWith('.') ? '' : '.'}`;
};

// ─────────────────────────────────────────────────────────
// 32 — single-package assembled reply is byte-identical to pre-change
// ─────────────────────────────────────────────────────────
test('ORDER_FOLLOW_UP single-package reply is byte-identical to the pre-change line, one trailing period', () => {
  const card = toChatOrder(order());
  // Pre-change form: grouped OFF + an always-appended ".".
  const before = `Your order #${card.shortId} (${card.itemSummary}, ${templates.formatRs(card.total)}) ${templates.orderStatusLine(card, false)}.`;
  const after = assembleFollowUp(card);
  assert.strictEqual(after, before, 'single-package assembled reply unchanged by the grouped opt-in');
  assert.ok(after.endsWith('.') && !after.endsWith('..'), 'exactly one trailing period');
});

// ─────────────────────────────────────────────────────────
// 33 — multi-package, all same status: unchanged wording, one period
// ─────────────────────────────────────────────────────────
test('ORDER_FOLLOW_UP multi all-same-status reply keeps today\'s wording and one trailing period', () => {
  const o = order({
    status: 'delivered',
    shipments: [
      ship({ status: 'delivered', seller: { shopName: 'Shop A' } }),
      ship({ status: 'delivered', seller: { shopName: 'Shop B' } }),
    ],
  });
  const card = toChatOrder(o);
  const before = `Your order #${card.shortId} (${card.itemSummary}, ${templates.formatRs(card.total)}) ${templates.orderStatusLine(card, false)}.`;
  const after = assembleFollowUp(card);
  assert.strictEqual(after, before, 'all-same-status collapses to today\'s single predicate');
  assert.ok(after.endsWith('.') && !after.includes('..'), 'exactly one trailing period, no ".."');
});

// ─────────────────────────────────────────────────────────
// 34 — mixed multi-package: grouped sentence appears, no ".."
// ─────────────────────────────────────────────────────────
test('ORDER_FOLLOW_UP mixed multi-package reply shows grouped clauses and contains no ".."', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'returned',   seller: { shopName: 'Shop A' }, settlement: { refundToCustomer: 100 } }),
      ship({ status: 'dispatched', seller: { shopName: 'Shop B' } }),
    ],
  });
  const reply = assembleFollowUp(toChatOrder(o));
  assert.ok(reply.includes("Shop A's package was returned and your refund is being processed"), 'grouped returned clause present');
  assert.ok(reply.includes("Shop B's package is on the way"), 'grouped active clause present');
  assert.ok(!reply.includes('..'), 'no double period despite the internal clause period');
  assert.ok(reply.endsWith('.'), 'still ends with exactly one period');
});

// ─────────────────────────────────────────────────────────
// 35 — mixed multi-package: wrapper (id + items/total) is retained
// ─────────────────────────────────────────────────────────
test('ORDER_FOLLOW_UP mixed reply still opens with "Your order #" and keeps (items, total)', () => {
  const o = order({
    status: 'dispatched',
    total: 3000,
    items: [{ name: 'A' }, { name: 'B' }],
    shipments: [
      ship({ status: 'returned',   seller: { shopName: 'Shop A' }, settlement: { refundToCustomer: 100 } }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop B' }, deliveredAt: new Date('2026-07-05') }),
    ],
  });
  const card = toChatOrder(o);
  const reply = assembleFollowUp(card);
  assert.ok(reply.startsWith(`Your order #${card.shortId} `), 'opens with the order id wrapper');
  assert.ok(reply.includes(`(${card.itemSummary}, ${templates.formatRs(3000)})`), 'retains the (items, total) wrapper');
});

// A Return doc as attachReturns leaves it on a shipment (s.returns[]): only the
// fields toChatPackage reads — status + items[].quantity.
const ret = (status, ...quantities) => ({ status, items: quantities.map((q) => ({ quantity: q })) });

// NOTE (tests 36-41 UPDATED from the step-2 definition): itemsInReturn no longer
// sums shipmentItem.returnedQuantity; it now counts UNITS over a shipment's OPEN
// Return docs, and a new itemsReturned counts UNITS over COMPLETED ('refunded')
// ones. The fixtures inject s.returns instead of item.returnedQuantity.

// ─────────────────────────────────────────────────────────
// 36 — no returns at all → both counts 0
// ─────────────────────────────────────────────────────────
test('return counts: a package with no returns has itemsInReturn 0 and itemsReturned 0', () => {
  const p = toChatOrder(order({ shipments: [ship({ items: [{ name: 'X', quantity: 3 }] })] })).packages[0];
  assert.strictEqual(p.itemsInReturn, 0);
  assert.strictEqual(p.itemsReturned, 0);
});

// ─────────────────────────────────────────────────────────
// 37 — one OPEN return, 2 units → itemsInReturn 2, itemsReturned 0
// ─────────────────────────────────────────────────────────
test('return counts: one open return of 2 units → itemsInReturn 2, itemsReturned 0', () => {
  const p = toChatOrder(order({ shipments: [ship({ returns: [ret('pending', 2)] })] })).packages[0];
  assert.strictEqual(p.itemsInReturn, 2);
  assert.strictEqual(p.itemsReturned, 0);
});

// ─────────────────────────────────────────────────────────
// 38 — one COMPLETED ('refunded') return, 2 units → itemsInReturn 0, itemsReturned 2
// ─────────────────────────────────────────────────────────
test('return counts: one refunded return of 2 units → itemsInReturn 0, itemsReturned 2', () => {
  const p = toChatOrder(order({ shipments: [ship({ returns: [ret('refunded', 2)] })] })).packages[0];
  assert.strictEqual(p.itemsInReturn, 0);
  assert.strictEqual(p.itemsReturned, 2);
});

// ─────────────────────────────────────────────────────────
// 39 — a REJECTED return counts toward NEITHER field
// ─────────────────────────────────────────────────────────
test('return counts: a rejected return is counted in neither field', () => {
  const p = toChatOrder(order({ shipments: [ship({ returns: [ret('rejected', 5)] })] })).packages[0];
  assert.strictEqual(p.itemsInReturn, 0);
  assert.strictEqual(p.itemsReturned, 0);
});

// ─────────────────────────────────────────────────────────
// 40 — OPEN and COMPLETED returns on the same package are independent
// ─────────────────────────────────────────────────────────
test('return counts: open + refunded on the same package are counted independently', () => {
  const p = toChatOrder(order({
    shipments: [ship({ returns: [
      ret('picked_up', 1),          // open, 1 unit
      ret('approved', 2),           // open, 2 units
      ret('refunded', 3),           // completed, 3 units
      ret('rejected', 9),           // neither
    ] })],
  })).packages[0];
  assert.strictEqual(p.itemsInReturn, 3);   // 1 + 2 open units
  assert.strictEqual(p.itemsReturned, 3);   // 3 refunded units
});

// ─────────────────────────────────────────────────────────
// 41 — returns spanning two packages: each package gets only its own counts
// ─────────────────────────────────────────────────────────
test('return counts: two packages each carry only their own return counts', () => {
  const card = toChatOrder(order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'delivered', seller: { shopName: 'Shop A' }, returns: [ret('pending', 2)] }),
      ship({ status: 'delivered', seller: { shopName: 'Shop B' }, returns: [ret('refunded', 4)] }),
    ],
  }));
  assert.strictEqual(card.packages[0].itemsInReturn, 2);
  assert.strictEqual(card.packages[0].itemsReturned, 0);
  assert.strictEqual(card.packages[1].itemsInReturn, 0);
  assert.strictEqual(card.packages[1].itemsReturned, 4);
});

// ─────────────────────────────────────────────────────────
// 42 — no returns and no items array → both 0, no throw
// ─────────────────────────────────────────────────────────
test('return counts: no returns and no items array → both 0, no throw', () => {
  let card;
  assert.doesNotThrow(() => {
    card = toChatOrder(order({ shipments: [ship({ items: undefined })] }));
  });
  assert.strictEqual(card.packages[0].itemsInReturn, 0);
  assert.strictEqual(card.packages[0].itemsReturned, 0);
});

// ─────────────────────────────────────────────────────────
// 43 — packages[] keeps every prior field/value, adding only itemsReturned
// ─────────────────────────────────────────────────────────
test('packages[] keeps every prior field/value and adds _id, payable and itemsReturned', () => {
  const o = order({
    status: 'delivered',
    shipments: [ship({
      status: 'delivered', seller: { shopName: 'Shop A' },
      deliveredAt: new Date('2026-07-05'), sellerSubtotal: 1000, deliveryCharge: 100,
      couponAllocation: 0, settlement: { refundToCustomer: 0 },
      returns: [ret('pending', 1)],
    })],
  });
  const p = toChatOrder(o).packages[0];

  // Prior keys + itemsInReturn + itemsReturned + _id (shipment id) + payable.
  const expectedKeys = [
    '_id', 'index', 'sellerName', 'status', 'itemCount', 'itemSummary', 'deliveredAt',
    'agentName', 'sellerSubtotal', 'deliveryCharge', 'couponAllocation', 'refund',
    'returnMinutesLeft', 'returnWindowLabel', 'itemsInReturn', 'itemsReturned', 'payable',
  ].sort();
  assert.deepStrictEqual(Object.keys(p).sort(), expectedKeys);
  // payable = sellerSubtotal + deliveryCharge − couponAllocation (backend util).
  assert.strictEqual(p.payable, 1100);

  // Prior fields keep their exact values (unchanged by the additions).
  assert.strictEqual(p.index, 1);
  assert.strictEqual(p.sellerName, 'Shop A');
  assert.strictEqual(p.status, 'delivered');
  assert.strictEqual(p.itemCount, 1);      // ship()'s default single item
  assert.strictEqual(p.sellerSubtotal, 1000);
  assert.strictEqual(p.deliveryCharge, 100);
  assert.strictEqual(p.couponAllocation, 0);
  assert.strictEqual(p.refund, 0);
  assert.strictEqual(p.itemsInReturn, 1);
  assert.strictEqual(p.itemsReturned, 0);
});

// ─────────────────────────────────────────────────────────
// Short-id addressing (router + resolver + not-found)
// ─────────────────────────────────────────────────────────
// Minimal order card — the router and resolver read only `shortId`.
const idCard = (shortId) => ({ shortId });
// The 7.75 gate needs orders shown AND an order-related last intent.
const orderCtx = (orders) => ({ lastOrders: orders, lastIntent: 'order_history' });

// Faithful reproduction of the ORDER_FOLLOW_UP not-found decision at
// chatbotService.js:263-272 (that module warms Ollama on import, so we mirror
// the tiny branch instead of booting the service). Kept byte-for-byte in sync.
const NOT_FOUND_ORDINAL = 'Which order do you mean? Say "the first one" or "the second one".';
const followUpReplyFor = (query, lastOrders) => {
  const target = resolveOrderTarget(query, lastOrders);
  if (!target) {
    const idTok = query.split(/\s+/).find((t) => /^#?[0-9a-f]{6}[?.!,]*$/i.test(t));
    if (idTok) return templates.orderNotFound(idTok.replace(/[^0-9a-fA-F]/g, '').toUpperCase());
    return NOT_FOUND_ORDINAL;
  }
  const predicate = templates.orderStatusLine(target, true);
  return `Your order #${target.shortId} (${target.itemSummary}, ${templates.formatRs(target.total)}) ${predicate}${predicate.endsWith('.') ? '' : '.'}`;
};

// ── Router (detectIntent) ────────────────────────────────
test('router: a HASHED id present in lastOrders routes to ORDER_FOLLOW_UP', () => {
  const d = detectIntent('tell me about #1c5159', orderCtx([idCard('1C5159')]));
  assert.strictEqual(d.intent, INTENTS.ORDER_FOLLOW_UP);
});

test('router: a BARE id present in lastOrders routes to ORDER_FOLLOW_UP', () => {
  const d = detectIntent('1c5159', orderCtx([idCard('1C5159')]));
  assert.strictEqual(d.intent, INTENTS.ORDER_FOLLOW_UP);
});

test('router: a HASHED id NOT in lastOrders still routes to ORDER_FOLLOW_UP (handler echoes not-found)', () => {
  const d = detectIntent('where is #9ab123', orderCtx([idCard('1C5159')]));
  assert.strictEqual(d.intent, INTENTS.ORDER_FOLLOW_UP);
});

test('router: a BARE id NOT in lastOrders does NOT hijack — falls through to product search', () => {
  const d = detectIntent('9ab123', orderCtx([idCard('1C5159')]));
  assert.strictEqual(d.intent, INTENTS.PRODUCT_SEARCH);
});

test('router: non-hex 6-char tokens are never treated as ids', () => {
  assert.strictEqual(detectIntent('b550m1', orderCtx([idCard('1C5159')])).intent, INTENTS.PRODUCT_SEARCH);
  assert.strictEqual(detectIntent('27gp85', orderCtx([idCard('1C5159')])).intent, INTENTS.PRODUCT_SEARCH);
});

test('router: an ordinal alongside a hex token → ordinal branch wins (still ORDER_FOLLOW_UP)', () => {
  const d = detectIntent('the first one #9ab123', orderCtx([idCard('1C5159')]));
  assert.strictEqual(d.intent, INTENTS.ORDER_FOLLOW_UP);
  assert.strictEqual(d.statusFilter, undefined); // took the ordinal branch, not status
});

test('router: a hex token with NO lastOrders in context does not hijack (behaves as today)', () => {
  assert.strictEqual(detectIntent('#1c5159', {}).intent, INTENTS.PRODUCT_SEARCH);
  assert.strictEqual(detectIntent('1c5159', {}).intent, INTENTS.PRODUCT_SEARCH);
});

// ── Resolver (resolveOrderTarget) ────────────────────────
test('resolve: "#1c5159" present resolves to that order', () => {
  const card = idCard('1C5159');
  assert.strictEqual(resolveOrderTarget('tell me about #1c5159', [card]), card);
});

test('resolve: bare "1c5159" present resolves to that order', () => {
  const card = idCard('1C5159');
  assert.strictEqual(resolveOrderTarget('1c5159', [card]), card);
});

test('resolve: uppercase "#1C5159" present resolves (case-insensitive)', () => {
  const card = idCard('1C5159');
  assert.strictEqual(resolveOrderTarget('#1C5159', [card]), card);
});

test('resolve: an id not in the list returns null', () => {
  assert.strictEqual(resolveOrderTarget('9ab123', [idCard('1C5159')]), null);
});

test('resolve: an ordinal outranks a matching id (ordinal wins)', () => {
  const a = idCard('1C5159');
  const b = idCard('9AB123');
  // "second" → index 1 (b), even though "#1c5159" matches a.
  assert.strictEqual(resolveOrderTarget('the second one #1c5159', [a, b]), b);
});

test('resolve: a pure ordinal still resolves exactly as before', () => {
  const list = [idCard('AAA111'), idCard('BBB222'), idCard('CCC333')];
  assert.strictEqual(resolveOrderTarget('the second one', list), list[1]);
});

test('resolve: two listed orders sharing a shortId are ambiguous → null (never the first)', () => {
  const dup = [idCard('1C5159'), idCard('1C5159')];
  assert.strictEqual(resolveOrderTarget('1c5159', dup), null);
});

// ── Not-found wording + byte-identical fallback ──────────
test('orderNotFound echoes the typed id and points at the list-first flow', () => {
  const r = templates.orderNotFound('9AB123');
  assert.ok(r.includes('#9AB123'), 'echoes the id');
  assert.ok(r.toLowerCase().includes('show my recent orders'), 'tells the user what to do');
});

test('not-found branch: an unknown HASHED id yields orderNotFound echoing that id', () => {
  const reply = followUpReplyFor('where is #9ab123', [idCard('1C5159')]);
  assert.strictEqual(reply, templates.orderNotFound('9AB123'));
});

test('not-found branch: no id and no ordinal → the original hardcoded reply, byte-identical', () => {
  const reply = followUpReplyFor('what about it', [idCard('1C5159')]);
  assert.strictEqual(reply, 'Which order do you mean? Say "the first one" or "the second one".');
});

// ─────────────────────────────────────────────────────────
// Partial-return wording in grouped (mixed-status) output
// ─────────────────────────────────────────────────────────
// A delivered package with an OPEN return.
test('grouped: a delivered package with itemsInReturn > 0 gets ", and part of it is in return" (date kept)', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'dispatched', seller: { shopName: 'Shop Z' } }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop A' }, deliveredAt: new Date('2026-07-05'), returns: [ret('pending', 2)] }),
    ],
  });
  assert.strictEqual(templates.orderStatusLine(toChatOrder(o), true),
    "Shop Z's package is on the way. Shop A's package was delivered on 5 Jul, and part of it is in return");
});

test('grouped: a delivered package with itemsReturned > 0 gets ", and part of it was returned" (date kept)', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'dispatched', seller: { shopName: 'Shop Z' } }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop A' }, deliveredAt: new Date('2026-07-05'), returns: [ret('refunded', 2)] }),
    ],
  });
  assert.strictEqual(templates.orderStatusLine(toChatOrder(o), true),
    "Shop Z's package is on the way. Shop A's package was delivered on 5 Jul, and part of it was returned");
});

test('grouped: both counts > 0 on one delivered package mentions both', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'dispatched', seller: { shopName: 'Shop Z' } }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop A' }, deliveredAt: new Date('2026-07-05'), returns: [ret('pending', 1), ret('refunded', 2)] }),
    ],
  });
  assert.strictEqual(templates.orderStatusLine(toChatOrder(o), true),
    "Shop Z's package is on the way. Shop A's package was delivered on 5 Jul, and part of it is in return and part was returned");
});

test('grouped: a partial-return delivered package does NOT squash with a plain one on the same date', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'dispatched', seller: { shopName: 'Shop Z' } }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop A' }, deliveredAt: new Date('2026-07-05') }),                       // plain
      ship({ status: 'delivered',  seller: { shopName: 'Shop B' }, deliveredAt: new Date('2026-07-05'), returns: [ret('pending', 1)] }), // partial
    ],
  });
  const line = templates.orderStatusLine(toChatOrder(o), true);
  assert.strictEqual(line,
    "Shop Z's package is on the way. Shop A's package was delivered on 5 Jul. Shop B's package was delivered on 5 Jul, and part of it is in return");
  assert.ok(!line.includes('Shop A and Shop B'), 'partial package did not squash into the plain clause');
});

test('grouped: plain delivered packages still squash with each other on the same date', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'dispatched', seller: { shopName: 'Shop Z' } }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop A' }, deliveredAt: new Date('2026-07-05') }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop B' }, deliveredAt: new Date('2026-07-05') }),
    ],
  });
  assert.strictEqual(templates.orderStatusLine(toChatOrder(o), true),
    "Shop Z's package is on the way. Shop A and Shop B's packages were delivered on 5 Jul");
});

test('grouped: a FULL returned package gets no partial phrase (wording unchanged)', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'dispatched', seller: { shopName: 'Shop B' } }),
      ship({ status: 'returned',   seller: { shopName: 'Shop A' }, settlement: { refundToCustomer: 100 }, returns: [ret('refunded', 3)] }),
    ],
  });
  const line = templates.orderStatusLine(toChatOrder(o), true);
  assert.strictEqual(line,
    "Shop A's package was returned and your refund is being processed. Shop B's package is on the way");
  assert.ok(!line.includes('part of it'), 'no partial phrase on a full-return package');
});

test('grouped: return_assigned / return_in_transit packages get no partial phrase', () => {
  const mk = (st) => order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'dispatched', seller: { shopName: 'Shop B' } }),
      ship({ status: st,           seller: { shopName: 'Shop A' }, returns: [ret('picked_up', 2)] }),
    ],
  });
  for (const st of ['return_assigned', 'return_in_transit']) {
    const line = templates.orderStatusLine(toChatOrder(mk(st)), true);
    assert.ok(line.includes(`has status "${st}"`), `${st} keeps its generic wording`);
    assert.ok(!line.includes('part of it'), `${st} gets no partial phrase`);
  }
});

test('grouped: 5+ distinct shops keep the dateless count form with no partial phrasing', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'returned',   seller: { shopName: 'Shop A' }, settlement: { refundToCustomer: 100 } }),
      ship({ status: 'dispatched', seller: { shopName: 'Shop B' } }),
      ship({ status: 'dispatched', seller: { shopName: 'Shop C' } }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop D' }, deliveredAt: new Date('2026-07-05'), returns: [ret('pending', 2)] }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop E' }, deliveredAt: new Date('2026-07-10') }),
    ],
  });
  const line = templates.orderStatusLine(toChatOrder(o), true);
  assert.strictEqual(line,
    '1 package was returned and your refund is being processed. 2 packages are on the way. 2 packages were delivered');
  assert.ok(!line.includes('part of it') && !line.includes('Shop'), 'count mode stays plain');
});

// ─────────────────────────────────────────────────────────
// Possessive fix ("s"-ending shop names take a bare apostrophe)
// ─────────────────────────────────────────────────────────
test('possessive: a shop name ending in "s" takes a bare apostrophe', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'dispatched', seller: { shopName: 'Shop Z' } }),
      ship({ status: 'delivered',  seller: { shopName: 'Everyday Finds' }, deliveredAt: new Date('2026-07-05') }),
    ],
  });
  const line = templates.orderStatusLine(toChatOrder(o), true);
  assert.ok(line.includes("Everyday Finds' package was delivered on 5 Jul"), 'bare apostrophe on the s-ending name');
  assert.ok(!line.includes("Finds's"), 'no double possessive');
});

test('possessive: a shop name NOT ending in "s" keeps "\'s"', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'dispatched', seller: { shopName: 'Shop Z' } }),
      ship({ status: 'delivered',  seller: { shopName: 'Tech Bazaar' }, deliveredAt: new Date('2026-07-05') }),
    ],
  });
  assert.ok(templates.orderStatusLine(toChatOrder(o), true).includes("Tech Bazaar's package was delivered on 5 Jul"));
});

test('possessive: two shops, last name ends in "s" → bare apostrophe on the last', () => {
  const o = order({
    status: 'dispatched',
    shipments: [
      ship({ status: 'dispatched', seller: { shopName: 'Shop Z' } }),
      ship({ status: 'delivered',  seller: { shopName: 'Shop A' },        deliveredAt: new Date('2026-07-05') }),
      ship({ status: 'delivered',  seller: { shopName: 'Everyday Finds' }, deliveredAt: new Date('2026-07-05') }),
    ],
  });
  const line = templates.orderStatusLine(toChatOrder(o), true);
  assert.ok(line.includes("Shop A and Everyday Finds' packages were delivered on 5 Jul"), 'bare apostrophe on the last name');
  assert.ok(!line.includes("Finds's"), 'no double possessive on the last name');
});

test('single-package and package-arg output are unaffected by partial-return counts', () => {
  // Single-package delivered order with a partial return → switch path, no phrase.
  const single = {
    status: 'delivered', deliveredAt: new Date('2026-07-05'),
    packages: [{ status: 'delivered', sellerName: 'Everyday Finds', itemsInReturn: 2, itemsReturned: 1 }],
  };
  assert.strictEqual(templates.orderStatusLine(single, true),  'was delivered on 5 Jul ✅');
  assert.strictEqual(templates.orderStatusLine(single, false), 'was delivered on 5 Jul ✅');

  // A PACKAGE arg (no .packages) with partial counts → switch path, no phrase.
  const pkg = { status: 'delivered', deliveredAt: new Date('2026-07-05'), itemsInReturn: 3, sellerName: 'Shop A', index: 1 };
  assert.strictEqual(templates.orderStatusLine(pkg), 'was delivered on 5 Jul ✅');
  assert.strictEqual(templates.orderStatusLine(pkg, true), 'was delivered on 5 Jul ✅');
});

// ─────────────────────────────────────────────────────────
// Ordinal resolution against the LAST list shown (orders vs packages)
// ─────────────────────────────────────────────────────────
// Out-of-range copy, reproduced from chatbotService.js ORDER_FOLLOW_UP (that
// module warms Ollama on import, so we mirror the 2-line mapping).
const outOfRangeMsg = (res) => res.kind === 'package'
  ? `That order has ${res.outOfRange} packages.`
  : `You have only ${res.outOfRange} recent orders.`;

const multiCard = toChatOrder(order({
  status: 'dispatched',
  shipments: [
    ship({ status: 'dispatched', seller: { shopName: 'Shop A' } }),
    ship({ status: 'delivered',  seller: { shopName: 'Shop B' }, deliveredAt: new Date('2026-07-05') }),
  ],
}));
const o1 = toChatOrder(order({ _id: '0000000000000000001c5159' })); // shortId 1C5159, single-package
const o2 = toChatOrder(order({ _id: '0000000000000000009ab123' })); // shortId 9AB123, single-package
const pkgCtx  = { lastList: 'packages', lastPackages: multiCard.packages, lastPackageOrder: multiCard, lastOrders: [multiCard] };
const listCtx = { lastList: 'orders',   lastPackages: [], lastPackageOrder: null, lastOrders: [o1, o2] };

test('ordinal inside a multi-package card selects a PACKAGE', () => {
  const r = resolveListTarget('the second one', pkgCtx);
  assert.strictEqual(r.kind, 'package');
  assert.strictEqual(r.target, multiCard.packages[1]);
});

test('ordinal after an order list selects an ORDER', () => {
  const r = resolveListTarget('the second one', listCtx);
  assert.strictEqual(r.kind, 'order');
  assert.strictEqual(r.target, o2);
});

test('explicit "the second order" always means the order list', () => {
  const r = resolveListTarget('the second order', { ...pkgCtx, lastOrders: [o1, o2] });
  assert.strictEqual(r.kind, 'order');
  assert.strictEqual(r.target, o2);
});

test('explicit "the second package" always means a package', () => {
  const ctx = { lastList: 'orders', lastOrders: [o1, o2], lastPackages: multiCard.packages, lastPackageOrder: multiCard };
  const r = resolveListTarget('the second package', ctx);
  assert.strictEqual(r.kind, 'package');
  assert.strictEqual(r.target, multiCard.packages[1]);
});

test('explicit "package" with no package list resolves to nothing (never an order)', () => {
  assert.strictEqual(resolveListTarget('the second package', listCtx), null);
});

test('out-of-range in package context → "That order has N packages."', () => {
  const r = resolveListTarget('the fifth one', pkgCtx);
  assert.strictEqual(r.kind, 'package');
  assert.strictEqual(r.outOfRange, 2);
  assert.strictEqual(outOfRangeMsg(r), 'That order has 2 packages.');
});

test('out-of-range in order context → "You have only N recent orders."', () => {
  const r = resolveListTarget('the fifth one', listCtx);
  assert.strictEqual(r.kind, 'order');
  assert.strictEqual(r.outOfRange, 2);
  assert.strictEqual(outOfRangeMsg(r), 'You have only 2 recent orders.');
});

test('a single-package card is not a list: a bare ordinal falls back to the order list', () => {
  // lastList 'orders' (what listFields sets after a single-package card), with a
  // lingering package list from earlier — a bare ordinal still picks an ORDER.
  const ctx = { lastList: 'orders', lastOrders: [o1, o2], lastPackages: multiCard.packages, lastPackageOrder: multiCard };
  const r = resolveListTarget('the first one', ctx);
  assert.strictEqual(r.kind, 'order');
  assert.strictEqual(r.target, o1);
});

test('shortId still resolves against the order list', () => {
  const r = resolveListTarget('#1c5159', listCtx);
  assert.strictEqual(r.kind, 'order');
  assert.strictEqual(r.target, o1);
});

test('an ordinal still outranks a shortId', () => {
  const r = resolveListTarget('the second one #1c5159', listCtx); // "second" → o2, not #1C5159 (o1)
  assert.strictEqual(r.kind, 'order');
  assert.strictEqual(r.target, o2);
});

test('OLD-shape context (no lastList/lastPackages) degrades to order-only, never throws', () => {
  const old = { lastOrders: [o1, o2] };
  const r = resolveListTarget('the second one', old);
  assert.strictEqual(r.kind, 'order');
  assert.strictEqual(r.target, o2);
  assert.strictEqual(resolveListTarget('the second one', {}), null);
  assert.doesNotThrow(() => resolveListTarget('hello there', undefined));
});

test('packageAsCard wraps a package as a single-package card with total = payable', () => {
  const pkg  = multiCard.packages[1];
  const card = packageAsCard(multiCard, pkg);
  assert.strictEqual(card.total, pkg.payable, 'total is the package payable, not re-summed');
  assert.strictEqual(card.packages.length, 1, 'renders the single-package card');
  assert.strictEqual(card.packages[0], pkg);
  assert.strictEqual(card.shortId, multiCard.shortId, 'keeps the parent order shortId');
  assert.strictEqual(card.status, pkg.status);
});

// ─────────────────────────────────────────────────────────
// Drilling into a package keeps bare ordinals on that order's packages
// ─────────────────────────────────────────────────────────
// Reproductions of chatbotService.js (Ollama-coupled on import):
//   listFieldsRepro    → what listFields sets when rendering order card(s)
//   afterPackageRender → the newContext the ORDER_FOLLOW_UP package branch sets
const listFieldsRepro = (rendered) => {
  const only = rendered.length === 1 ? rendered[0] : null;
  return (only && Array.isArray(only.packages) && only.packages.length > 1)
    ? { lastList: 'packages', lastPackages: only.packages, lastPackageOrder: only }
    : { lastList: 'orders', lastPackages: [], lastPackageOrder: null };
};
const afterPackageRender = (context) => ({ ...context, lastIntent: 'order_follow_up', lastList: 'packages' });

// State after drilling into a package of the 2-package multiCard.
const drilled = afterPackageRender(pkgCtx);

test('drill-in keeps lastList=packages so bare ordinals stay on the packages', () => {
  assert.strictEqual(drilled.lastList, 'packages');
  assert.strictEqual(drilled.lastPackages, multiCard.packages); // package list preserved
});

test('A: inside a package, "the first one" → package 1', () => {
  const r = resolveListTarget('the first one', drilled);
  assert.strictEqual(r.kind, 'package');
  assert.strictEqual(r.target, multiCard.packages[0]);
});

test('A: inside a package, "the third one" → "That order has 2 packages."', () => {
  const r = resolveListTarget('the third one', drilled);
  assert.strictEqual(r.kind, 'package');
  assert.strictEqual(outOfRangeMsg(r), 'That order has 2 packages.');
});

test('A: "the first order" escapes back to the order list even while drilled in', () => {
  const r = resolveListTarget('the first order', drilled);
  assert.strictEqual(r.kind, 'order');
  assert.strictEqual(r.target, multiCard); // drilled.lastOrders === [multiCard]
});

test('A: "the third package" still gives the package out-of-range copy', () => {
  const r = resolveListTarget('the third package', drilled);
  assert.strictEqual(r.kind, 'package');
  assert.strictEqual(outOfRangeMsg(r), 'That order has 2 packages.');
});

test('B: a GENUINE single-package order → bare ordinal falls back to the order list', () => {
  // listFields for a lone single-package card clears the package list.
  const ctx = { lastOrders: [o1, o2], ...listFieldsRepro([o1]) };
  assert.strictEqual(ctx.lastList, 'orders');
  assert.deepStrictEqual(ctx.lastPackages, []);
  const r = resolveListTarget('the third one', ctx);
  assert.strictEqual(r.kind, 'order');
  assert.strictEqual(outOfRangeMsg(r), 'You have only 2 recent orders.');
});

test('B: listFields distinguishes a genuine single-package card from a multi-package one', () => {
  assert.strictEqual(listFieldsRepro([o1]).lastList, 'orders');       // one package → order list
  assert.strictEqual(listFieldsRepro([multiCard]).lastList, 'packages'); // >1 package → package list
});

test('C: drilled context with an OLD-shape client (no lastPackages) degrades to orders, no throw', () => {
  const oldDrilled = { lastList: 'packages', lastOrders: [o1, o2] }; // lastPackages dropped by old client
  let r;
  assert.doesNotThrow(() => { r = resolveListTarget('the first one', oldDrilled); });
  assert.strictEqual(r.kind, 'order');
  assert.strictEqual(r.target, o1);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
