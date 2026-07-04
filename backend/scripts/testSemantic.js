// backend/scripts/testSemantic.js
//
// Diagnostic: shows the RAW cosine similarity between a query and every product,
// straight from the stored embeddings (no Atlas, no thresholds, no pipeline).
// This tells us whether the semantic signal is good and where thresholds belong.
//
//   cd backend
//   node scripts/testSemantic.js "something to keep drinks cold"
//   node scripts/testSemantic.js "laptop"
//   node scripts/testSemantic.js "something to read"

require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { embedQuery } = require('../services/embeddingService');

function cosine(a, b) {
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; ma += a[i]*a[i]; mb += b[i]*b[i]; }
  if (ma === 0 || mb === 0) return 0;
  return dot / (Math.sqrt(ma) * Math.sqrt(mb));
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });

    const query = process.argv[2] || 'something to keep drinks cold';
    console.log(`\nQuery: "${query}"\nEmbedding query (first run loads model)...`);
    const qv = await embedQuery(query);

    const products = await Product.find({ isActive: true, stock: { $gt: 0 } })
      .select('+embedding name category').lean();

    const scored = products
      .filter(p => p.embedding && p.embedding.length)
      .map(p => ({ name: p.name, category: p.category, score: cosine(qv, p.embedding) }))
      .sort((a, b) => b.score - a.score);

    console.log(`\nTop 12 products by similarity:`);
    scored.slice(0, 12).forEach(p =>
      console.log(`  ${p.score.toFixed(3)}   ${p.name}  [${p.category}]`));

    console.log(`\nProducts scored     : ${scored.length}`);
    console.log(`Score >= 0.50       : ${scored.filter(p => p.score >= 0.50).length}`);
    console.log(`Score >= 0.40       : ${scored.filter(p => p.score >= 0.40).length}`);
    console.log(`Score >= 0.30       : ${scored.filter(p => p.score >= 0.30).length}`);
    console.log(`Highest score       : ${scored[0]?.score.toFixed(3)}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err.message);
    process.exit(1);
  }
})();