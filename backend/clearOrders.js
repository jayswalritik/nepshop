// ─────────────────────────────────────────────────────────────────────────────
// clearOrders.js — canonical data-reset script (backend/clearOrders.js)
// ─────────────────────────────────────────────────────────────────────────────
// Supersedes the original orders+returns-only version (commit 04e7ff1). That
// version predates the Shipment model and never touched shipments, coupon
// usage counters, review-derived product ratings, or the stock these orders
// decremented — all of which go stale once orders are gone. See WIPE_PLAN.md
// (repo root) for the full investigation this script implements.
//
// Wipes ALL historical order/earnings data — orders, shipments, returns,
// reviews — and repairs the derived state that lives OUTSIDE those
// collections so nothing is left stale:
//   - product stock       (restored to pre-order levels, computed live)
//   - product rating/numReviews (reset for every product that had a review)
//   - coupon usedCount AND usedBy (per-customer ledger) — both reset, since
//                          no real order will back a nonzero count or a
//                          per-customer redemption once orders are gone
// Carts are also cleared (this is a fresh-slate reset, not a partial one).
// Users and products themselves (everything except stock/rating/numReviews)
// are left untouched.
//
// SAFE BY DEFAULT:
//   node backend/clearOrders.js             → DRY RUN. Connects, prints the
//                                              database name, current counts,
//                                              and exactly what WOULD change.
//                                              Modifies NOTHING.
//   node backend/clearOrders.js --confirm    → Executes the wipe.
//
// Idempotent — running --confirm a second time finds empty collections,
// restores/deletes/resets nothing new, and errors nowhere.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
// Load .env by an ABSOLUTE path derived from this script's own location — a
// destructive script must not behave differently depending on the directory
// it's launched from. (Previously `require('dotenv').config()` resolved
// relative to process.cwd(): ran fine from backend/, but "uri parameter must
// be a string, got undefined" when launched from the repo root, because
// dotenv silently found no .env there and MONGO_URI stayed unset.)
require('dotenv').config({ path: path.join(__dirname, '.env') });

const dns = require('dns');
// Some ISP/router DNS resolvers refuse SRV/TXT queries from Node's resolver
// even though the network path is fine (confirmed via CONNECTION_DIAGNOSIS.md
// Phase 2: this machine's system resolver returns "querySrv ECONNREFUSED" for
// _mongodb._tcp.<cluster>, while 8.8.8.8/1.1.1.1 resolve it correctly).
// server.js already works around this for the running app; this script needs
// the same fix since it connects standalone, outside that process.
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
const Order    = require('./models/Order');
const Shipment = require('./models/Shipment');
const Return   = require('./models/Return');
const Review   = require('./models/Review');
const Coupon   = require('./models/Coupon');
const Product  = require('./models/Product');
const Cart     = require('./models/Cart');

const CONFIRM = process.argv.includes('--confirm');

// Statuses whose stock decrement has ALREADY been reversed by existing
// cancellation logic (orderController.cancelOrder / updateOrderStatus both
// restore stock the moment a shipment — or, pre-Shipment-model, the whole
// order — reaches 'cancelled'). Everything else (delivered, or stuck at any
// other in-progress status) still holds its original decrement and must be
// reversed here before the source orders are deleted.
//
// NOTE — aggregated at the ORDER level (see STEP 1). This is exactly right
// for every order in the current database (0 shipments exist — see
// WIPE_PLAN.md — so every historical order here was cancelled, if at all,
// as a single whole-order action under the pre-Shipment model). If this
// script is ever run after orders exist that were PARTIALLY cancelled via
// per-shipment cancellation (one seller's shipment cancelled, another
// seller's still active on the same multi-seller order), this order-level
// aggregation would over-restore that order's already-restored portion —
// re-check against `shipments` before trusting this on such a database.
const STOCK_ALREADY_RESTORED_STATUSES = ['cancelled'];

// Returns are currently empty in the live database (WIPE_PLAN.md section 1),
// so return-driven stock reversal (returnController.completeReturn restocks
// on customer-fault returns) is assumed to be a non-factor here. If this
// script is ever run against a database that DOES have returns, re-check
// that logic before trusting the stock-restoration numbers below.

const line = () => console.log('='.repeat(70));

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error(`❌ MONGO_URI not found — expected in ${path.join(__dirname, '.env')}`);
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const dbName = mongoose.connection.db.databaseName;

  line();
  console.log(`DATABASE: "${dbName}"`);
  console.log(`MODE: ${CONFIRM ? '⚠️  --confirm — THIS WILL WRITE TO THE DATABASE ABOVE' : 'DRY RUN — read-only, nothing will change'}`);
  line();

  // ── Current ("before") counts ─────────────────────────────────────────
  const [orderCount, shipmentCount, returnCount, reviewCount, cartCount, couponCount] =
    await Promise.all([
      Order.countDocuments(),
      Shipment.countDocuments(),
      Return.countDocuments(),
      Review.countDocuments(),
      Cart.countDocuments(),
      Coupon.countDocuments(),
    ]);

  console.log('\nCurrent counts:');
  console.log(`  orders:     ${orderCount}`);
  console.log(`  shipments:  ${shipmentCount}`);
  console.log(`  returns:    ${returnCount}`);
  console.log(`  reviews:    ${reviewCount}`);
  console.log(`  carts:      ${cartCount}`);
  console.log(`  coupons:    ${couponCount}`);

  // ── STEP 1 — stock restoration (computed BEFORE any deletion) ─────────
  const stockImpact = await Order.aggregate([
    { $match: { status: { $nin: STOCK_ALREADY_RESTORED_STATUSES } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        totalQuantity: { $sum: '$items.quantity' },
        orders: { $addToSet: '$_id' },
      },
    },
    { $project: { totalQuantity: 1, orderCount: { $size: '$orders' } } },
    { $sort: { totalQuantity: -1 } },
  ]);

  console.log(`\nSTEP 1 — Stock restoration (${CONFIRM ? 'APPLYING' : 'would apply'}):`);
  if (stockImpact.length === 0) {
    console.log('  Nothing to restore — no non-cancelled orders with items.');
  } else {
    const totalUnits = stockImpact.reduce((s, r) => s + r.totalQuantity, 0);
    console.log(`  ${stockImpact.length} product(s), ${totalUnits} unit(s) total:`);
    for (const r of stockImpact) {
      console.log(`    product=${r._id}  +${r.totalQuantity}  (from ${r.orderCount} order(s))`);
      if (CONFIRM) {
        await Product.findByIdAndUpdate(r._id, { $inc: { stock: r.totalQuantity } });
      }
    }
  }

  // ── STEP 2 — collect product IDs referenced by reviews, BEFORE deleting them ──
  const reviewedProductIds = await Review.distinct('product');
  console.log(`\nSTEP 2 — ${reviewedProductIds.length} distinct product(s) referenced by existing reviews (queued for rating reset in step 5).`);

  // ── STEP 3 — deletions, child-before-parent ────────────────────────────
  console.log(`\nSTEP 3 — Deletions (${CONFIRM ? 'APPLYING' : 'would apply'}):`);
  const deletionTargets = [
    ['shipments', Shipment],
    ['returns', Return],
    ['orders', Order],
    ['reviews', Review],
    ['carts', Cart],
  ];
  for (const [name, Model] of deletionTargets) {
    const count = await Model.countDocuments();
    console.log(`  ${name}: ${count} document(s) ${CONFIRM ? 'deleted' : 'would be deleted'}`);
    if (CONFIRM) await Model.deleteMany({});
  }

  // ── STEP 4 — coupon usage reset (global count + per-customer ledger) ────
  console.log(`\nSTEP 4 — Coupon usage reset (${CONFIRM ? 'APPLYING' : 'would apply'}):`);
  const couponsToReset = await Coupon.countDocuments({
    $or: [{ usedCount: { $ne: 0 } }, { 'usedBy.0': { $exists: true } }],
  });
  console.log(`  ${couponsToReset} coupon(s) with nonzero usedCount and/or usedBy entries ${CONFIRM ? 'reset' : 'would be reset'} (usedCount -> 0, usedBy -> [])`);
  if (CONFIRM) await Coupon.updateMany({}, { $set: { usedCount: 0, usedBy: [] } });

  // ── STEP 5 — product rating/numReviews reset ────────────────────────────
  // Product schema defaults (backend/models/Product.js): rating -> 0, numReviews -> 0.
  console.log(`\nSTEP 5 — Product rating/numReviews reset (${CONFIRM ? 'APPLYING' : 'would apply'}):`);
  if (reviewedProductIds.length === 0) {
    console.log('  No products had reviews — nothing to reset.');
  } else {
    console.log(`  ${reviewedProductIds.length} product(s) ${CONFIRM ? 'reset' : 'would be reset'} to rating=0, numReviews=0`);
    if (CONFIRM) {
      await Product.updateMany(
        { _id: { $in: reviewedProductIds } },
        { $set: { rating: 0, numReviews: 0 } }
      );
    }
  }

  // ── STEP 6 — summary ─────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70));
  if (!CONFIRM) {
    console.log('DRY RUN COMPLETE — nothing was modified.');
    console.log('Review the output above, then run:  node backend/clearOrders.js --confirm');
  } else {
    const [afterOrders, afterShipments, afterReturns, afterReviews, afterCarts] = await Promise.all([
      Order.countDocuments(),
      Shipment.countDocuments(),
      Return.countDocuments(),
      Review.countDocuments(),
      Cart.countDocuments(),
    ]);
    console.log('WIPE COMPLETE.');
    console.log(`  orders:     ${orderCount} -> ${afterOrders}`);
    console.log(`  shipments:  ${shipmentCount} -> ${afterShipments}`);
    console.log(`  returns:    ${returnCount} -> ${afterReturns}`);
    console.log(`  reviews:    ${reviewCount} -> ${afterReviews}`);
    console.log(`  carts:      ${cartCount} -> ${afterCarts}`);
    console.log(`  coupons reset (usedCount -> 0, usedBy -> []): ${couponsToReset}`);
    console.log(`  products rating-reset (rating/numReviews -> 0): ${reviewedProductIds.length}`);
  }
  line();

  await mongoose.disconnect();
  process.exit(0);
};

run().catch(async (err) => {
  console.error('❌ Failed:', err.message);
  try { await mongoose.disconnect(); } catch (_) { /* already closed */ }
  process.exit(1);
});
