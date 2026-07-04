// backend/scripts/checkEmbeddings.js
//
// Diagnostic: how many products actually have a semantic vector?
//   cd backend
//   node scripts/checkEmbeddings.js

require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });

    const total    = await Product.countDocuments();
    // 'embedding.0' exists  ⇒  the array is present AND non-empty
    const withEmb  = await Product.countDocuments({ 'embedding.0': { $exists: true } });

    console.log('──────────────────────────────');
    console.log(`Total products      : ${total}`);
    console.log(`With embedding      : ${withEmb}`);
    console.log(`Missing embedding   : ${total - withEmb}`);
    console.log('──────────────────────────────');
    if (withEmb === 0) {
      console.log('⚠️  No embeddings found — semantic search cannot work.');
      console.log('    Fix: re-run your seed (new embedding version) OR: node scripts/backfillEmbeddings.js');
    } else if (withEmb < total) {
      console.log('⚠️  Some products lack embeddings. Run: node scripts/backfillEmbeddings.js');
    } else {
      console.log('✅ All products have embeddings. Semantic search has data to work with.');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Check failed:', err.message);
    process.exit(1);
  }
})();