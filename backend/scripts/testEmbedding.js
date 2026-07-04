// backend/scripts/testEmbedding.js  (CommonJS)
//
// Throwaway smoke test. Confirms the model loads, embeds a string,
// and prints how much memory it used. No database needed.
//
//   cd backend
//   node scripts/testEmbedding.js

const { embed } = require('../services/embeddingService');

async function run() {
  const t0 = Date.now();
  const vec = await embed('gaming laptop under 50000');
  const t1 = Date.now();

  console.log('Vector length:', vec.length);       // expect 384
  console.log('First 5 numbers:', vec.slice(0, 5));
  console.log(`Took ${t1 - t0} ms (first run includes model download).`);

  const mb = (n) => Math.round(n / 1024 / 1024);
  const m = process.memoryUsage();
  console.log(`Memory — rss: ${mb(m.rss)}MB, heapUsed: ${mb(m.heapUsed)}MB`);
  process.exit(0);
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});