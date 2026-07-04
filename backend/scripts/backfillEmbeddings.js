// backend/scripts/backfillEmbeddings.js  (CommonJS)
//
// Run ONCE to give every existing product a vector (the in-Node way).
// This is the Node alternative to the Colab notebook — either one works,
// both produce compatible vectors.
//
//   cd backend
//   node scripts/backfillEmbeddings.js
//
// Re-run any time you want to refresh all vectors in bulk.

require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');                 // <-- adjust path if needed
const { embed, buildProductText } = require('../services/embeddingService');

async function run() {
  const uri = process.env.MONGO_URI || process.env.MONGO_URI_LOCAL;
  if (!uri) throw new Error('No MONGO_URI (or MONGO_URI_LOCAL) in .env');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  console.log('Connected. Loading model (first run downloads ~23MB)...');

  const products = await Product.find({}).select('+embedding');
  console.log(`Found ${products.length} products.`);

  let done = 0;
  for (const product of products) {
    const vector = await embed(buildProductText(product));
    if (vector) {
      product.embedding = vector;
      await product.save();
    }
    done++;
    if (done % 10 === 0 || done === products.length) {
      console.log(`Embedded ${done}/${products.length}`);
    }
  }

  console.log('Backfill complete.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});