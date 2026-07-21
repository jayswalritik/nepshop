// backend/scripts/wipeDemoProducts.js
//
// Removes everything backend/scripts/seedDemoProducts.js created: all
// products owned by a seller whose email ends in @seed.nepshop.demo, then
// the demo sellers themselves.
//
// HERO PRODUCTS: backend/data/heroProducts.js products are seeded to the SAME
// @seed.nepshop.demo demo sellers (each hero is assigned to the demo seller
// anchored to its category), so the seller-ownership match below already
// deletes them — confirmed. As a belt-and-suspenders safety net for any
// orphaned seed product (e.g. a hero whose seller was somehow removed first),
// a SECOND pass also deletes any product whose image publicId starts with the
// `seed-demo-` sentinel (covers both bulk `seed-demo-<category>-*` and hero
// `seed-demo-hero-*` ids), regardless of current ownership.
//
// DIRECT DB DELETION ONLY — deliberately does NOT go through the
// deleteProduct controller (backend/controllers/productController.js), which
// calls cloudinary.uploader.destroy() on each image's publicId. Seeded
// images are hotlinked (loremflickr / Wikimedia) with a sentinel,
// non-Cloudinary publicId — running them through that controller would be
// pointless (no real Cloudinary asset to delete) and needlessly slow.
//
// Usage:
//   cd backend
//   node scripts/wipeDemoProducts.js
//
// NOT run automatically by anything — this only runs when you invoke it
// directly, and it is NOT run as part of the seeding session.

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');

const SEED_EMAIL_DOMAIN = '@seed.nepshop.demo';

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('Connected to DB.\n');

  const demoSellers = await User.find({ email: { $regex: `${SEED_EMAIL_DOMAIN}$`, $options: 'i' } }).select('_id email shopName');
  if (demoSellers.length === 0) {
    console.log('No demo sellers found — nothing to wipe.');
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(`Found ${demoSellers.length} demo seller(s):`);
  demoSellers.forEach((s) => console.log(`  ${s.shopName || '(no shop name)'} <${s.email}>`));

  const sellerIds = demoSellers.map((s) => s._id);

  const productCountBefore = await Product.countDocuments({ seller: { $in: sellerIds } });
  console.log(`\nDeleting ${productCountBefore} product(s)...`);
  const productDeleteResult = await Product.deleteMany({ seller: { $in: sellerIds } });
  console.log(`  Deleted ${productDeleteResult.deletedCount} product(s).`);

  // Belt-and-suspenders: also catch any orphaned seed product by its sentinel
  // publicId (covers seed-demo-<category>-* bulk AND seed-demo-hero-* heroes),
  // independent of seller ownership. Normally deletes 0 after the pass above.
  const orphanCount = await Product.countDocuments({ 'images.publicId': { $regex: '^seed-demo-' } });
  if (orphanCount > 0) {
    const orphanResult = await Product.deleteMany({ 'images.publicId': { $regex: '^seed-demo-' } });
    console.log(`\nOrphan safety pass: deleted ${orphanResult.deletedCount} product(s) by seed-demo-* publicId.`);
  } else {
    console.log('\nOrphan safety pass: 0 orphaned seed products (all caught by seller ownership).');
  }

  console.log(`\nDeleting ${demoSellers.length} demo seller(s)...`);
  const userDeleteResult = await User.deleteMany({ _id: { $in: sellerIds } });
  console.log(`  Deleted ${userDeleteResult.deletedCount} seller(s).`);

  console.log('\nDone.');
  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error('FATAL:', err.message, err.stack);
  process.exit(1);
});
