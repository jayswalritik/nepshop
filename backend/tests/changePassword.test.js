/**
 * ─────────────────────────────────────────────────────────────────────────────
 * changePassword.test.js — run with: node backend/tests/changePassword.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Integration tests for the net-new authenticated change-password endpoint
 * (changePassword in backend/controllers/authController.js,
 *  PUT /api/auth/change-password).
 *
 * Covers: wrong current password rejected (401); too-weak new password
 * rejected (400); new password identical to current rejected (400); missing
 * fields rejected (400); and the happy path — the change succeeds (200) and
 * afterwards the NEW password verifies while the OLD one no longer does.
 *
 * Requires MONGO_URI (reads backend/.env). Every test creates its own
 * throwaway User and deletes it afterward. Handlers are invoked directly with
 * a fabricated req.user (bypassing the protect middleware), matching the
 * approach in authAdminGuards.test.js.
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

const fakeRes = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return this; },
});

// Controller-style handler: (req, res) => Promise, errors thrown/rejected.
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

  const { changePassword } = require('../controllers/authController');
  const User = require('../models/User');

  const cleanupIds = { users: [] };

  const OLD_PASSWORD = 'OldPass123';

  // Create a throwaway user with a known password. User.create runs the
  // pre('save') hook, so the stored password is properly hashed.
  const mkUser = async (tag) => {
    const u = await User.create({
      firstName: 'PwDiag', lastName: tag,
      email: `pwdiag-${tag.toLowerCase()}-${new mongoose.Types.ObjectId()}@test.local`,
      phone: '9800000004',
      password: OLD_PASSWORD,
      role: 'customer', status: 'active',
    });
    cleanupIds.users.push(u._id);
    return u;
  };

  const cleanup = async () => {
    await User.deleteMany({ _id: { $in: cleanupIds.users } });
    cleanupIds.users = [];
  };

  // ── Wrong current password ───────────────────────────────────────────────
  await test('rejects a wrong current password with 401 and does not change the password', async () => {
    const user = await mkUser('WrongCurrent');
    const { res, err } = await invoke(changePassword, {
      user: { _id: user._id },
      body: { currentPassword: 'NotMyPassword1', newPassword: 'BrandNew123' },
    });
    assert.ok(err, 'must throw for a wrong current password');
    assert.strictEqual(res.statusCode, 401);

    // Password must be unchanged — old one still verifies.
    const fresh = await User.findById(user._id).select('+password');
    assert.ok(await fresh.matchPassword(OLD_PASSWORD), 'old password must still work');
  }, cleanup);

  // ── Too-weak new password ────────────────────────────────────────────────
  for (const [label, weak] of [
    ['too short',        'Ab1'],
    ['no uppercase',     'lowercase123'],
    ['no number',        'NoNumbersHere'],
  ]) {
    await test(`rejects a too-weak new password (${label}) with 400`, async () => {
      const user = await mkUser(`Weak${label.replace(/\s/g, '')}`);
      const { res, err } = await invoke(changePassword, {
        user: { _id: user._id },
        body: { currentPassword: OLD_PASSWORD, newPassword: weak },
      });
      assert.ok(err, `must throw for weak new password (${label})`);
      assert.strictEqual(res.statusCode, 400);

      const fresh = await User.findById(user._id).select('+password');
      assert.ok(await fresh.matchPassword(OLD_PASSWORD), 'old password must still work');
    }, cleanup);
  }

  // ── New password identical to current ────────────────────────────────────
  await test('rejects a new password identical to the current one with 400', async () => {
    const user = await mkUser('SameAsCurrent');
    const { res, err } = await invoke(changePassword, {
      user: { _id: user._id },
      body: { currentPassword: OLD_PASSWORD, newPassword: OLD_PASSWORD },
    });
    assert.ok(err, 'must throw when new === current');
    assert.strictEqual(res.statusCode, 400);
  }, cleanup);

  // ── Missing fields ───────────────────────────────────────────────────────
  await test('rejects a missing newPassword with 400', async () => {
    const user = await mkUser('MissingField');
    const { res, err } = await invoke(changePassword, {
      user: { _id: user._id },
      body: { currentPassword: OLD_PASSWORD },
    });
    assert.ok(err, 'must throw when a field is missing');
    assert.strictEqual(res.statusCode, 400);
  }, cleanup);

  // ── Happy path ───────────────────────────────────────────────────────────
  await test('happy path: succeeds (200), new password verifies, old password no longer works', async () => {
    const user = await mkUser('HappyPath');
    const NEW_PASSWORD = 'FreshPass456';

    const { res, err } = await invoke(changePassword, {
      user: { _id: user._id },
      body: { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD },
    });
    assert.strictEqual(err, null, `happy path must not throw: ${err && err.message}`);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body && res.body.success === true, 'response must report success');

    // Re-query with the hash selected and confirm the swap took effect.
    const fresh = await User.findById(user._id).select('+password');
    assert.ok(await fresh.matchPassword(NEW_PASSWORD), 'new password must verify after change');
    assert.ok(!(await fresh.matchPassword(OLD_PASSWORD)), 'old password must no longer verify');
  }, cleanup);

  await mongoose.disconnect();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
};

run().catch((err) => { console.error('FATAL:', err); process.exit(1); });
