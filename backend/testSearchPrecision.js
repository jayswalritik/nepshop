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
 * NOTE ON SCOPE (historical): an earlier version of this file noted that
 * "ac" used to trigger the LLM rescue (which sometimes guessed "accessory"/
 * "adapter" rather than "air conditioner") because the engine found zero
 * matches on the bare 2-char token. That's superseded by the deterministic
 * abbreviation expansion added in searchConfig.js (see the [Task: Abbreviation
 * expansion] section below) — "ac" now resolves to "air conditioner" before
 * either the literal matcher or the embedder ever sees it, so the LLM
 * shouldn't need to guess at it anymore. The "asdfgh" LLM mis-interpretation
 * note still applies — verified via git stash that it pre-dates all of this
 * file's fixes; Groq response drift, not caused by this code.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();
const mongoose = require('mongoose');
// wordMatch itself isn't exported, so its short-token behavior is exercised
// indirectly through partitionMatches (which IS exported and calls it).
const { partitionMatches, parseQuery, buildCatalogVocabulary } = require('./services/searchEngine');

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
  // failing — a single transient miss here isn't a code regression. (With
  // abbreviation expansion, "cam" now usually resolves directly without ever
  // reaching the LLM — retried here only to absorb rare embedding hiccups.)
  let cam = await searchProducts('cam', { limit: 20 });
  if (!cam.results.some(p => /camera/i.test(p.name))) {
    cam = await searchProducts('cam', { limit: 20 });
  }
  check('"cam" → still finds real cameras',
    cam.results.some(p => /camera/i.test(p.name)), JSON.stringify(cam.results.map(p => p.name)));

  // ── [Task: Abbreviation expansion] ──────────────────────────────────────
  console.log('\n[Abbreviations] Deterministic expansion (searchConfig.abbreviations)');

  // Unit-level: parseQuery produces the expected expandedQuery, and a query
  // with NO abbreviation is byte-for-byte unchanged (expandedQuery === raw).
  const vocab = buildCatalogVocabulary(await Product.find({ isActive: true, stock: { $gt: 0 } }).select('name category').lean());
  const pcIntent  = parseQuery('pc', config, vocab);
  const tvIntent  = parseQuery('tv', config, vocab);
  const acIntent  = parseQuery('ac', config, vocab);
  const camIntent = parseQuery('cam', config, vocab);
  const laptopIntent = parseQuery('laptop', config, vocab);
  check('"pc" expands to "computer"',  pcIntent.expandedQuery === 'computer',  pcIntent.expandedQuery);
  check('"tv" expands to "television"', tvIntent.expandedQuery === 'television', tvIntent.expandedQuery);
  check('"ac" expands to "air conditioner"', acIntent.expandedQuery === 'air conditioner', acIntent.expandedQuery);
  check('"cam" expands to "camera"', camIntent.expandedQuery === 'camera', camIntent.expandedQuery);
  check('non-abbreviation query unchanged (expandedQuery === raw)',
    laptopIntent.expandedQuery === 'laptop' && laptopIntent.abbreviationsApplied.length === 0,
    laptopIntent.expandedQuery);

  // E2E: "tv" → honest zero (no catalog TV, and the expansion must not
  // reintroduce a leak of its own).
  const tvE2E = await searchProducts('tv', { limit: 20 });
  check('"tv" (expanded "television") → honest zero-result',
    tvE2E.isZeroResult === true, JSON.stringify(tvE2E.results.map(p => p.name)));

  // E2E: "pc" → expect MORE than the previous single-result baseline now
  // that the embedder sees "computer" instead of the compressed-score
  // abbreviation "pc" (see summary for the actual before/after numbers).
  const pcE2E = await searchProducts('pc', { limit: 20 });
  check('"pc" (expanded "computer") → more than 1 result, still laptops/computers only',
    pcE2E.results.length > 1 && pcE2E.results.every(n => !/ssd|headphone|speaker/i.test(n.name)),
    JSON.stringify(pcE2E.results.map(p => p.name)));

  // E2E: "cam" → report what the catalog actually returns (informational,
  // not a strict allow-list — see summary for discussion).
  const camE2E = await searchProducts('cam', { limit: 20 });
  console.log(`  INFO  "cam" (expanded "camera") catalog results: ${JSON.stringify(camE2E.results.map(p => p.name))}`);
  check('"cam" (expanded "camera") → at least one real camera, no non-electronics leak',
    camE2E.results.some(p => /camera/i.test(p.name)) &&
    camE2E.results.every(p => p.category === 'Electronics'),
    JSON.stringify(camE2E.results.map(p => `${p.name} [${p.category}]`)));

  // E2E: "ac" → substring-to-"Acer" regression check (hard requirement, must
  // pass) plus an INFORMATIONAL report of whatever else surfaces. The
  // catalog has no air conditioners, so the honest-zero target can only be
  // reached if nothing else in the catalog clears the (untouched, per this
  // task's constraints) semantic floor for the phrase "air conditioner" —
  // see summary for a real case where that floor is not tight enough.
  const acE2E = await searchProducts('ac', { limit: 20 });
  check('"ac" (expanded "air conditioner") → no substring match to "Acer"',
    !acE2E.results.some(p => p.name === 'Acer Nitro V15'),
    JSON.stringify(acE2E.results.map(p => p.name)));
  console.log(`  INFO  "ac" (expanded "air conditioner") catalog results: ${JSON.stringify(acE2E.results.map(p => p.name))}` +
    (acE2E.isZeroResult ? ' (honest zero)' : ' (NOT zero — see summary)'));

  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail > 0 ? 1 : 0);
};

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
