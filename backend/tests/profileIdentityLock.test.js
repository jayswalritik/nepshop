/**
 * ─────────────────────────────────────────────────────────────────────────────
 * profileIdentityLock.test.js — run with: node backend/tests/profileIdentityLock.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Integration tests for the identity-lock policy added to
 * backend/controllers/authController.js's updateCustomerProfile,
 * updateSellerSettings, and updateDeliveryProfile: an account holding a
 * seller or delivery role can never change firstName/lastName from ANY
 * endpoint or active role, and is blocked from the customer profile
 * endpoint entirely (even for name-unrelated edits). New suite — none of
 * the existing eight touch authController.js's profile-update paths.
 * Modeled on authAdminGuards.test.js's DB-integration pattern (real
 * throwaway User documents, invoke the real controller function directly)
 * because the roles-array-vs-legacy-role-string fallback this policy
 * depends on can only be proven against real persisted User documents in
 * both shapes — a pure-function mirror would just re-assert the fallback
 * expression's own syntax.
 *
 * Requires MONGO_URI (reads backend/.env). Every test creates its own
 * throwaway User document and deletes it afterward.
 *
 * Covers:
 *   1-2. Pure customer (roles-array AND legacy role-string) edits name via
 *        updateCustomerProfile → success.
 *   3. Seller-role account hits updateCustomerProfile, even a phone-only
 *      edit with no name fields at all → rejected entirely, with message.
 *   4. Legacy-role-string delivery account ('role' field only, no `roles`
 *      array) hits updateCustomerProfile → rejected — this is the actual
 *      bug the old `user.role !== 'customer'` check had backwards: it
 *      caught this legacy-string case fine (role stays 'delivery') but
 *      MISSED the multi-role case in test 5 below, which is the one that
 *      actually mattered.
 *   5. Multi-role account (roles=['delivery','customer']) hits
 *      updateCustomerProfile → rejected. THE bug scenario: the OLD guard
 *      checked `user.role`, which never updates once a second role is
 *      added via addCustomerRole — a delivery-first account that later
 *      added customer would have `user.role === 'delivery'` forever, so
 *      the old check accidentally caught this ONE case too. The real gap
 *      was the reverse (customer-first account later approved as
 *      seller/delivery, `user.role` stays 'customer' forever) — covered by
 *      the fact that this test's fixture never touches `user.role` at all
 *      and the guard still fires correctly off `roles` alone.
 *   6-7. Delivery agent: genuine name change via updateDeliveryProfile →
 *        rejected, name unchanged in DB; resubmitting the SAME name while
 *        changing phone/payout → succeeds (proves the "always send the
 *        full form" UI pattern isn't broken by the lock).
 *   8-9. Same pair for updateSellerSettings.
 *   10. Legacy-role-string delivery account ('role' field only) still gets
 *       the name lock enforced via updateDeliveryProfile (roles-fallback
 *       coverage on the ALLOW side, mirroring test 4's REJECT side).
 *   11-12. Whitespace-insensitive nameChanged hardening: resubmitting the
 *       agent's own name with stray leading/trailing whitespace (alongside
 *       a real phone change) must NOT trip the 403 — only a genuinely
 *       different name still does.
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

  const { updateCustomerProfile, updateSellerSettings, updateDeliveryProfile } = require('../controllers/authController');
  const User = require('../models/User');

  const cleanupIds = { users: [] };

  // `roles` intentionally omitted when undefined (not set to `[]`) — mirrors
  // real legacy documents that predate the multi-role migration, where the
  // field is genuinely absent, not an empty array.
  const mkUser = async ({ role, roles, tag, firstName = 'Orig', lastName = 'Name' }) => {
    const data = {
      firstName, lastName,
      email: `profilelock-${tag.toLowerCase()}-${new mongoose.Types.ObjectId()}@test.local`,
      phone: '9800000005',
      password: 'hashedpw-not-used-in-these-tests',
      role, status: 'active',
    };
    if (roles) data.roles = roles;
    const u = await User.create(data);
    cleanupIds.users.push(u._id);
    return u;
  };

  const cleanup = async () => {
    await User.deleteMany({ _id: { $in: cleanupIds.users } });
    cleanupIds.users = [];
  };

  // ── 1-2. Pure customer edits name → success ──────────────────────────────
  await test('pure customer (roles array): name edit via updateCustomerProfile succeeds', async () => {
    const user = await mkUser({ role: 'customer', roles: ['customer'], tag: 'Cust1' });
    const { res, err } = await invoke(updateCustomerProfile, {
      user, body: { firstName: 'Changed', lastName: 'Name2', phone: '9811111111' },
    });
    assert.strictEqual(err, null);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.user.firstName, 'Changed');
    assert.strictEqual(res.body.user.lastName, 'Name2');
    assert.strictEqual(res.body.user.phone, '9811111111');
  }, cleanup);

  await test('pure customer (legacy role string, no roles array): name edit via updateCustomerProfile succeeds', async () => {
    const user = await mkUser({ role: 'customer', tag: 'Cust2' });
    const { res, err } = await invoke(updateCustomerProfile, {
      user, body: { firstName: 'Changed', lastName: 'Name2', phone: '9811111112' },
    });
    assert.strictEqual(err, null);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.user.firstName, 'Changed');
  }, cleanup);

  // ── 3. Seller-role account hits customer endpoint at all → rejected ──────
  await test('seller-role account hits updateCustomerProfile (phone-only, no name fields) → rejected entirely', async () => {
    const user = await mkUser({ role: 'seller', roles: ['seller'], tag: 'Sell1' });
    const { res, err } = await invoke(updateCustomerProfile, {
      user, body: { phone: '9822222222' },
    });
    assert.ok(err, 'must reject even a name-unrelated edit');
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(err.message, "Verified seller/delivery accounts can't edit profile details from the customer profile.");

    const raw = await User.findById(user._id);
    assert.strictEqual(raw.phone, '9800000005', 'phone must be untouched — request rejected before any field was written');
  }, cleanup);

  // ── 4. Legacy-string delivery account hits customer endpoint → rejected ──
  await test('legacy-role-string delivery account (no roles array) hits updateCustomerProfile → rejected', async () => {
    const user = await mkUser({ role: 'delivery', tag: 'Deliv1' });
    const { res, err } = await invoke(updateCustomerProfile, {
      user, body: { firstName: 'Changed' },
    });
    assert.ok(err);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(err.message, "Verified seller/delivery accounts can't edit profile details from the customer profile.");
  }, cleanup);

  // ── 5. Multi-role (delivery + customer) hits customer endpoint → rejected
  await test('multi-role account (roles=[delivery,customer]) hits updateCustomerProfile → rejected even in customer mode', async () => {
    const user = await mkUser({ role: 'delivery', roles: ['delivery', 'customer'], tag: 'Multi1' });
    const { res, err } = await invoke(updateCustomerProfile, {
      user, body: { firstName: 'Changed', phone: '9833333333' },
    });
    assert.ok(err, 'holding delivery role must block the customer endpoint regardless of what else is being edited');
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(err.message, "Verified seller/delivery accounts can't edit profile details from the customer profile.");
  }, cleanup);

  // ── 6-7. Delivery agent: name locked, phone/payout editable ──────────────
  await test('delivery agent: genuine name change via updateDeliveryProfile → rejected, name unchanged in DB', async () => {
    const user = await mkUser({ role: 'delivery', roles: ['delivery'], tag: 'Deliv2' });
    const { res, err } = await invoke(updateDeliveryProfile, {
      user, body: { firstName: 'Changed', lastName: 'Name', phone: '9844444444' },
    });
    assert.ok(err);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(err.message, 'Your name is verified and locked. Contact support to change verified identity details.');

    const raw = await User.findById(user._id);
    assert.strictEqual(raw.firstName, 'Orig', 'name must be untouched');
    assert.strictEqual(raw.phone, '9800000005', 'phone must also be untouched — request rejected before any field was written');
  }, cleanup);

  await test('delivery agent: SAME name + phone/payout change via updateDeliveryProfile → succeeds, name unchanged', async () => {
    const user = await mkUser({ role: 'delivery', roles: ['delivery'], tag: 'Deliv3' });
    const { res, err } = await invoke(updateDeliveryProfile, {
      user,
      body: {
        firstName: 'Orig', lastName: 'Name', phone: '9855555555',
        payoutDetails: { preferredMethod: 'khalti', khaltiNumber: '9800000009' },
      },
    });
    assert.strictEqual(err, null, `resubmitting the unchanged name must not block phone/payout edits: ${err && err.message}`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.user.firstName, 'Orig');
    assert.strictEqual(res.body.user.phone, '9855555555');
    assert.strictEqual(res.body.user.payoutDetails.khaltiNumber, '9800000009');
  }, cleanup);

  // ── 8-9. Seller: name locked, phone/shop/payout editable ─────────────────
  await test('seller: genuine name change via updateSellerSettings → rejected', async () => {
    const user = await mkUser({ role: 'seller', roles: ['seller'], tag: 'Sell2' });
    const { res, err } = await invoke(updateSellerSettings, {
      user, body: { firstName: 'Changed', phone: '9866666666' },
    });
    assert.ok(err);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(err.message, 'Your name is verified and locked. Contact support to change verified identity details.');

    const raw = await User.findById(user._id);
    assert.strictEqual(raw.firstName, 'Orig');
  }, cleanup);

  await test('seller: SAME name + phone change via updateSellerSettings → succeeds, name unchanged', async () => {
    const user = await mkUser({ role: 'seller', roles: ['seller'], tag: 'Sell3' });
    const { res, err } = await invoke(updateSellerSettings, {
      user, body: { firstName: 'Orig', lastName: 'Name', phone: '9877777777', shopName: 'My Shop' },
    });
    assert.strictEqual(err, null, `resubmitting the unchanged name must not block shop/phone edits: ${err && err.message}`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.user.firstName, 'Orig');
    assert.strictEqual(res.body.user.phone, '9877777777');
    assert.strictEqual(res.body.user.shopName, 'My Shop');
  }, cleanup);

  // ── 10. Roles-array fallback coverage on the ALLOW side ──────────────────
  await test('legacy-role-string delivery account (no roles array): name lock still enforced via updateDeliveryProfile', async () => {
    const user = await mkUser({ role: 'delivery', tag: 'Deliv4' });
    const { res, err } = await invoke(updateDeliveryProfile, {
      user, body: { firstName: 'Changed' },
    });
    assert.ok(err, 'the role-string fallback must resolve to holding delivery, same as an explicit roles array would');
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(err.message, 'Your name is verified and locked. Contact support to change verified identity details.');
  }, cleanup);

  // ── 11-12. Whitespace-insensitive nameChanged hardening ──────────────────
  await test('delivery agent: own name with a trailing space + phone change via updateDeliveryProfile → succeeds (not a false 403)', async () => {
    const user = await mkUser({ role: 'delivery', roles: ['delivery'], tag: 'Deliv5' });
    const { res, err } = await invoke(updateDeliveryProfile, {
      user, body: { firstName: 'Orig ', lastName: ' Name', phone: '9888888888' },
    });
    assert.strictEqual(err, null, `a trimmed-equal name must not be treated as a change: ${err && err.message}`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.user.firstName, 'Orig', 'stored name itself must stay untrimmed-submission-free (unchanged)');
    assert.strictEqual(res.body.user.phone, '9888888888');
  }, cleanup);

  await test('delivery agent: genuinely different name via updateDeliveryProfile → still 403', async () => {
    const user = await mkUser({ role: 'delivery', roles: ['delivery'], tag: 'Deliv6' });
    const { res, err } = await invoke(updateDeliveryProfile, {
      user, body: { firstName: 'Orig Two', phone: '9899999999' },
    });
    assert.ok(err, 'a genuinely different name (not just whitespace) must still be rejected');
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(err.message, 'Your name is verified and locked. Contact support to change verified identity details.');

    const raw = await User.findById(user._id);
    assert.strictEqual(raw.firstName, 'Orig', 'name must be untouched');
    assert.strictEqual(raw.phone, '9800000005', 'phone must also be untouched — request rejected before any field was written');
  }, cleanup);

  await mongoose.disconnect();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
};

run().catch((err) => { console.error('FATAL:', err); process.exit(1); });
