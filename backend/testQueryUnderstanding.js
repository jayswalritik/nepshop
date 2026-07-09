/**
 * ─────────────────────────────────────────────────────────────────────────────
 * testQueryUnderstanding.js — run with: node backend/testQueryUnderstanding.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Exercises Layer 1 (2-char product terms) and Layer 2 (LLM query
 * understanding rescue) against the LIVE catalog. Requires MONGO_URI (and
 * ideally GROQ_API_KEY) in backend/.env.
 *
 * Instruments ollamaService.generate() with a call counter (by patching the
 * cached module's export BEFORE anything else requires it) so "no LLM call"
 * claims are actually verified, not assumed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']); // see server.js — some networks block SRV lookups

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const { execFileSync } = require('child_process');

// ── Patch ollamaService.generate with a call counter BEFORE anything else
// requires it, so every downstream require (queryUnderstanding -> adapter)
// picks up the instrumented version.
const ollamaService = require('./services/chatbot/ollamaService');
let llmCallCount = 0;
const realGenerate = ollamaService.generate;
ollamaService.generate = async (...args) => {
  llmCallCount++;
  return realGenerate(...args);
};

const { searchProducts } = require('./services/nepShopSearchAdapter');

let pass = 0, fail = 0;
const check = (label, condition, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}  ${detail}`); }
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log('Connected to DB.\n');

  // ── 1. "laptop" — must stay fast, correct, and NOT touch the LLM ────────
  // A throwaway first call pays the one-time embedding-model cold-start
  // cost (unrelated to the LLM chain) so the timed call reflects steady
  // -state speed.
  console.log('[1] "laptop" — must be unaffected, no LLM call');
  await searchProducts('laptop', { limit: 20 }); // warm-up, not measured
  llmCallCount = 0;
  const t0 = Date.now();
  const laptop = await searchProducts('laptop', { limit: 20 });
  const laptopMs = Date.now() - t0;
  check('finds laptops', laptop.results.some(p => /laptop|macbook|zenbook|yoga|matebook/i.test(p.name)),
    JSON.stringify(laptop.results.map(p => p.name)));
  check('no LLM call', llmCallCount === 0, `calls=${llmCallCount}`);
  check('fast once warm (<3s, no LLM round-trip)', laptopMs < 3000, `${laptopMs}ms`);
  console.log(`  totalFound=${laptop.totalFound} time=${laptopMs}ms llmCalls=${llmCallCount}\n`);

  // ── 2. "pc" — short-token fix should already resolve this via Layer 1 ───
  console.log('[2] "pc" — Layer 1 alone should find laptops/computers');
  llmCallCount = 0;
  const pc = await searchProducts('pc', { limit: 20 });
  check('finds laptops', pc.results.some(p => /laptop|macbook|zenbook|yoga|matebook/i.test(p.name)),
    JSON.stringify(pc.results.map(p => p.name)));
  console.log(`  totalFound=${pc.totalFound} llmCalls=${llmCallCount} interpretedAs=${JSON.stringify(pc.interpretedAs)}`);
  console.log('  NOTE: in this catalog "pc" already resolves via the existing synonym group +');
  console.log('  the Layer 1 fix, so the LLM is never needed — that is the guard working as');
  console.log('  intended (only ask the LLM when the engine is actually stuck). "cam" below');
  console.log('  demonstrates the LLM path firing for real.\n');

  // ── 2b. "cam" — a real query this catalog cannot resolve without the LLM
  console.log('[2b] "cam" — no synonym group, no literal/semantic hit -> should trigger LLM');
  llmCallCount = 0;
  const cam = await searchProducts('cam', { limit: 20 });
  check('LLM was called', llmCallCount > 0, `calls=${llmCallCount}`);
  check('interpretedAs present', !!cam.interpretedAs, JSON.stringify(cam.interpretedAs));
  check('finds camera products', cam.results.some(p => /camera/i.test(p.name)),
    JSON.stringify(cam.results.map(p => p.name)));
  console.log(`  totalFound=${cam.totalFound} interpretedAs=${JSON.stringify(cam.interpretedAs)}\n`);

  // ── 3. "tv" / "ac" — sensible or honest zero, never random-popular ──────
  console.log('[3] "tv", "ac" — must not fall into random-popular browse mode');
  for (const q of ['tv', 'ac']) {
    llmCallCount = 0;
    const r = await searchProducts(q, { limit: 20 });
    const looksLikeRandomBrowse = r.intent && r.intent.productTerms && r.intent.productTerms.length === 0;
    check(`"${q}" did not fall into browse mode`, !looksLikeRandomBrowse,
      `productTerms=${JSON.stringify(r.intent && r.intent.productTerms)}`);
    console.log(`  "${q}": totalFound=${r.totalFound} results=${JSON.stringify(r.results.map(p => p.name))} interpretedAs=${JSON.stringify(r.interpretedAs)}`);
  }
  console.log();

  // ── 4. "asdfgh" — gibberish: honest zero + trending rescue, no invented terms
  console.log('[4] "asdfgh" — gibberish must stay an honest zero-result');
  llmCallCount = 0;
  const gibberish = await searchProducts('asdfgh', { limit: 20 });
  check('zero results', gibberish.isZeroResult === true, `isZeroResult=${gibberish.isZeroResult}`);
  check('no interpretedAs (LLM found nothing usable, or said terms:[])', !gibberish.interpretedAs,
    JSON.stringify(gibberish.interpretedAs));
  check('trending rescue present', Array.isArray(gibberish.zeroResultRescue) && gibberish.zeroResultRescue.length > 0,
    `rescue.length=${gibberish.zeroResultRescue.length}`);
  console.log(`  llmCalls=${llmCallCount} rescueCount=${gibberish.zeroResultRescue.length}\n`);

  // ── 5. "gaming laptop under 200000" — budget parsing unchanged, no LLM ──
  console.log('[5] "gaming laptop under 200000" — must be unaffected, no LLM call');
  llmCallCount = 0;
  const budget = await searchProducts('gaming laptop under 200000', { limit: 20 });
  check('budget applied (all <= 220000)', budget.results.every(p => {
    const eff = p.discount > 0 ? Math.round(p.price - p.price * p.discount / 100) : p.price;
    return eff <= 220000;
  }), JSON.stringify(budget.results.map(p => p.price)));
  check('no LLM call', llmCallCount === 0, `calls=${llmCallCount}`);
  console.log(`  totalFound=${budget.totalFound} llmCalls=${llmCallCount}\n`);

  await mongoose.disconnect();

  // ── 6. Kill GROQ_API_KEY — degraded gracefully, no crash ────────────────
  // Run in a FRESH child process so the typo'd key is the only thing that
  // changes (module-level consts in ollamaService read process.env once at
  // require time, so this can't be simulated in-process after the fact).
  // Also point OLLAMA_URL at an unreachable port — this machine happens to
  // have a real local Ollama running, so killing Groq alone would just
  // fall through to Ollama (the fallback chain working correctly, but not
  // what this test needs to prove). This simulates the full "no LLM
  // anywhere" case, e.g. production without Ollama and a broken Groq key.
  console.log('[6] GROQ_API_KEY typo\'d + Ollama unreachable — "cam" must degrade to Layer-1-only, no crash');
  const childScript = `
    const dns = require('dns');
    dns.setDefaultResultOrder('ipv4first');
    dns.setServers(['8.8.8.8', '1.1.1.1']);
    require('dotenv').config();
    const mongoose = require('mongoose');
    (async () => {
      await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
      const { searchProducts } = require('./services/nepShopSearchAdapter');
      const r = await searchProducts('cam', { limit: 20 });
      console.log(JSON.stringify({ totalFound: r.totalFound, isZeroResult: r.isZeroResult, interpretedAs: r.interpretedAs }));
      process.exit(0);
    })().catch(e => { console.error('CHILD_ERROR:', e.message); process.exit(1); });
  `;
  try {
    const out = execFileSync(
      process.execPath,
      ['-e', childScript],
      {
        cwd: __dirname,
        env: { ...process.env, GROQ_API_KEY: 'gsk_typo_broken_key_xxx', OLLAMA_URL: 'http://127.0.0.1:19999' },
        timeout: 60000,
        encoding: 'utf8',
      }
    );
    const lastLine = out.trim().split('\n').pop();
    const parsed = JSON.parse(lastLine);
    check('no crash, valid JSON back', true);
    check('no interpretedAs (LLM chain unavailable -> null -> unchanged behavior)', !parsed.interpretedAs,
      JSON.stringify(parsed));
    console.log(`  child result: ${lastLine}\n`);
  } catch (e) {
    check('no crash, valid JSON back', false, e.message);
  }

  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail > 0 ? 1 : 0);
};

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
