/**
 * ─────────────────────────────────────────────────────────────────────────────
 * orderFetchExtraction.test.js — run with:
 *   node backend/tests/orderFetchExtraction.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for backend/utils/orderFetch.js's attachShipments — the shipment
 * fetch-and-attach extracted verbatim from orderController.getMyOrders. NO DB
 * connection: the Shipment model's `find` static is stubbed on its singleton
 * export with a chainable that mimics a Mongoose query (.populate() returns
 * itself, awaiting resolves to the stubbed array).
 *
 * Covers: grouping shipments to the right orders, an empty array for an order
 * with no shipments, no mutation of a plain-object input, and correct handling
 * of a Mongoose-document input (.toObject()).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const assert = require('assert');
const Shipment = require('../models/Shipment');
const { attachShipments } = require('../utils/orderFetch');

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

// Chainable query stub: attachShipments does
//   await Shipment.find({...}).populate('seller', ...).populate('deliveryAgent', ...)
// so .populate() must return the same thenable, and awaiting it resolves the array.
const stubShipments = (arr) => {
  const q = {
    populate: () => q,
    then: (resolve, reject) => Promise.resolve(arr).then(resolve, reject),
  };
  Shipment.find = () => q;
};

const run = async () => {
  // ── 1. groups shipments to the right orders ──────────────────────────────
  await test('groups shipments to their parent orders by _id', async () => {
    stubShipments([
      { _id: 's1', order: 'o1' },
      { _id: 's2', order: 'o1' },
      { _id: 's3', order: 'o2' },
    ]);

    const out = await attachShipments([{ _id: 'o1' }, { _id: 'o2' }]);

    assert.strictEqual(out.length, 2);
    assert.strictEqual(out[0].shipments.length, 2);
    assert.deepStrictEqual(out[0].shipments.map((s) => s._id), ['s1', 's2']);
    assert.strictEqual(out[1].shipments.length, 1);
    assert.strictEqual(out[1].shipments[0]._id, 's3');
  });

  // ── 2. empty array for an order with no shipments ────────────────────────
  await test('order with no shipments → empty shipments array', async () => {
    stubShipments([{ _id: 's1', order: 'o1' }]);

    const out = await attachShipments([{ _id: 'o1' }, { _id: 'oNone' }]);

    assert.strictEqual(out[0].shipments.length, 1);
    assert.deepStrictEqual(out[1].shipments, []);
  });

  // ── 3. does not mutate a plain-object input ──────────────────────────────
  await test('plain-object input is not mutated; fields preserved on output', async () => {
    stubShipments([{ _id: 's1', order: 'o1' }]);

    const input = [{ _id: 'o1', foo: 'bar' }];
    const out = await attachShipments(input);

    // Input untouched — no `shipments` leaked onto the original object.
    assert.strictEqual(input[0].shipments, undefined);
    // Output carries the original fields plus the attached array.
    assert.strictEqual(out[0].foo, 'bar');
    assert.strictEqual(out[0].shipments.length, 1);
  });

  // ── 4. Mongoose-document input uses .toObject() ──────────────────────────
  await test('Mongoose-document input is converted via toObject()', async () => {
    stubShipments([{ _id: 's9', order: 'o5' }]);

    let toObjectCalled = false;
    const doc = {
      _id: 'o5',
      a: 1,
      toObject() {
        toObjectCalled = true;
        return { _id: 'o5', a: 1 };
      },
    };

    const out = await attachShipments([doc]);

    assert.strictEqual(toObjectCalled, true);
    assert.strictEqual(out[0].a, 1);
    assert.strictEqual(out[0].shipments.length, 1);
    // Result is the plain object from toObject(), not the doc itself.
    assert.strictEqual(typeof out[0].toObject, 'undefined');
  });

  // ── 5. empty / undefined input is tolerated ──────────────────────────────
  await test('empty input array → empty output; undefined tolerated', async () => {
    stubShipments([]);
    assert.deepStrictEqual(await attachShipments([]), []);
    assert.deepStrictEqual(await attachShipments(undefined), []);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
};

run();
