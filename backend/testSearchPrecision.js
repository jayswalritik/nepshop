/**
 * ─────────────────────────────────────────────────────────────────────────────
 * testSearchPrecision.js — run with: node backend/testSearchPrecision.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies the two precision fixes against the LIVE catalog:
 *
 *   FIX 1 — wordMatch's plural/prefix tolerance (+2 extra letters) is now
 *   disabled for terms under 3 chars, so "ac" no longer matches "Acer" and
 *   "tv" no longer matches the plural "TVs".
 *
 *   FIX 2 — a weak (description-only) literal match must now ALSO clear the
 *   same relative semantic cutoff already used to rescue semantic-only
 *   matches, so an accessory whose description merely says "compatible with
 *   laptops/PCs" no longer rides along on a bare keyword mention.
 *
 * Also prints the raw semantic scores behind FIX 2 so the threshold choice
 * (no config numbers changed — the existing semanticFloor/semanticTopMargin
 * are now just applied to weak matches too) is auditable against real data.
 *
 * NOTE ON SCOPE: two LLM-rescue behaviors observed during testing are NOT
 * addressed here because they are unrelated to these two fixes and
 * queryUnderstanding.js/its trigger must stay untouched per this task's
 * constraints:
 *   - "ac" now correctly finds ZERO literal/semantic catalog matches (the
 *     substring bug is gone), which legitimately triggers the existing LLM
 *     rescue. The LLM's own interpretation of the ambiguous abbreviation
 *     "ac" is imperfect (guesses "accessory"/"adapter" rather than "air
 *     conditioner"), so the end result is an LLM-assisted set rather than a
 *     hard zero. Verified this is a NEW EXPOSURE of existing, unmodified LLM
 *     behavior, not something these fixes get wrong.
 *   - "asdfgh" occasionally gets mis-interpreted by the LLM as tech terms
 *     instead of {"terms":[]}. Verified via git stash that this ALSO happens
 *     on the pre-fix code — pre-existing Groq response drift, not caused by
 *     this change.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();
const mongoose = require('mongoose');
// wordMatch itself isn't exported, so its short-token behavior is exercised
// indirectly through partitionMatches (which IS exported and calls it).
const { partitionMatches } = require('./services/searchEngine');

let pass = 0, fail = 0;
const check = (label, condition, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}  ${detail}`); }
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log('Connected to DB.\n');

  const { searchProducts } = require('./services/nepShopSearchAdapter');
  const { computeSemanticScores } = require('./services/semanticSearchService');
  const config = require('./services/searchConfig');
  const Product = require('./models/Product');

  // ── Unit-level: FIX 1 — "ac" must not literal-match "Acer" via substring ──
  console.log('[Unit] wordMatch short-token precision');
  const acer = partitionMatches([{ _id: '1', name: 'Acer Nitro V15', category: 'Electronics', description: '' }], ['ac']);
  check('"ac" does not match "Acer Nitro V15"', acer.all.length === 0, JSON.stringify(acer.all.map(p => p.name)));

  const tvPlural = partitionMatches([{ _id: '2', name: 'Random Gadget', category: 'Electronics', description: 'Compatible with smart TVs' }], ['tv']);
  check('"tv" does not match plural "TVs" in description', tvPlural.all.length === 0, JSON.stringify(tvPlural.all.map(p => p.name)));

  const longTermStillTolerant = partitionMatches([{ _id: '3', name: 'Wireless Headphones', category: 'Audio', description: '' }], ['headphone']);
  check('longer terms keep plural tolerance ("headphone" still matches "Headphones")', longTermStillTolerant.all.length === 1);
  console.log();

  // ── Print raw semantic scores behind FIX 2 ──────────────────────────────
  console.log('[Data] Top semantic scores (for auditing the FIX 2 threshold)');
  const all = await Product.find({ isActive: true, stock: { $gt: 0 } }).select('name category').lean();
  for (const q of ['laptop', 'pc']) {
    const scores = await computeSemanticScores(q, config);
    const rows = all
      .map(p => ({ name: p.name, score: scores[p._id.toString()] || 0 }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    console.log(`  "${q}" (semanticFloor=${config.semanticFloor}, semanticTopMargin=${config.semanticTopMargin}):`);
    rows.forEach(r => console.log(`    ${r.score.toFixed(4)}  ${r.name}`));
  }
  console.log();

  // ── End-to-end: target behavior ─────────────────────────────────────────
  console.log('[E2E] Target behavior against the live catalog');

  const laptop = await searchProducts('laptop', { limit: 20 });
  const laptopNames = laptop.results.map(p => p.name);
  check('"laptop" → laptops only, no headphones/speakers',
    laptopNames.every(n => !/headphone|speaker/i.test(n)) && laptopNames.length > 0,
    JSON.stringify(laptopNames));

  const pc = await searchProducts('pc', { limit: 20 });
  const pcNames = pc.results.map(p => p.name);
  check('"pc" → only laptops/computers, no SSD/headphones/speakers',
    pcNames.length > 0 && pcNames.every(n => !/ssd|headphone|speaker/i.test(n)),
    JSON.stringify(pcNames));

  const tv = await searchProducts('tv', { limit: 20 });
  check('"tv" → honest zero-result (no catalog TV, no speaker leak)',
    tv.isZeroResult === true, JSON.stringify(tv.results.map(p => p.name)));
  check('"tv" → trending rescue attached',
    Array.isArray(tv.zeroResultRescue) && tv.zeroResultRescue.length > 0,
    `rescue.length=${tv.zeroResultRescue.length}`);

  const ac = await searchProducts('ac', { limit: 20 });
  check('"ac" → no substring match to "Acer" (Acer Nitro V15 absent, or present only via a separate legitimate path)',
    !ac.results.some(p => p.name === 'Acer Nitro V15' && !ac.interpretedAs),
    JSON.stringify({ names: ac.results.map(p => p.name), interpretedAs: ac.interpretedAs }));

  const shoes = await searchProducts('black shoes', { limit: 20 });
  const expectedShoeNames = ['Nike Air Jordan 1 Red And Black', 'Sports Sneakers Off White Red', 'Sports Sneakers Off White & Red'];
  check('"black shoes" unaffected (same 3 results as the established baseline)',
    shoes.results.length === 3 && expectedShoeNames.every(n => shoes.results.some(p => p.name === n)),
    JSON.stringify(shoes.results.map(p => p.name)));

  const budget = await searchProducts('gaming laptop under 200000', { limit: 20 });
  check('"gaming laptop under 200000" budget parsing unaffected (all <= 220000)',
    budget.results.length > 0 && budget.results.every(p => {
      const eff = p.discount > 0 ? Math.round(p.price - p.price * p.discount / 100) : p.price;
      return eff <= 220000;
    }), JSON.stringify(budget.results.map(p => p.price)));

  // The LLM call has inherent network/model variance, so retry once before
  // failing — a single transient miss here isn't a code regression.
  let cam = await searchProducts('cam', { limit: 20 });
  if (!cam.results.some(p => /camera/i.test(p.name))) {
    cam = await searchProducts('cam', { limit: 20 });
  }
  check('"cam" → LLM path still finds real cameras',
    cam.results.some(p => /camera/i.test(p.name)), JSON.stringify(cam.results.map(p => p.name)));

  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail > 0 ? 1 : 0);
};

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
