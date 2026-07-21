// backend/scripts/compareSearchBranches.js
//
// Branch A/B search diagnostic (read-only). Reads queries from
// docs/search-queries.txt, runs each TWICE through the real search pipeline
// (searchProducts via nepShopSearchAdapter — no server needed, no DB
// writes), flags nondeterminism when the two runs' result ID-order differs,
// and writes a compact per-query report to
// docs/compare-results-<branch>.txt (overwritten each run).
//
// Branch is detected by reading .git/HEAD directly — never shells out to
// git, so this script and its output survive a branch switch untouched
// (both files are intentionally untracked).
//
// Usage:
//   cd backend
//   node scripts/compareSearchBranches.js
//
// Reads:  ../docs/search-queries.txt   (one query per line, blanks skipped)
// Writes: ../docs/compare-results-<branch>.txt

const fs = require('fs');
const path = require('path');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config();
const mongoose = require('mongoose');

const REPO_ROOT     = path.join(__dirname, '..', '..');
const QUERIES_FILE  = path.join(REPO_ROOT, 'docs', 'search-queries.txt');
const RATE_LIMIT_RE = /429|rate.?limit/i;

// ── Branch detection — read .git/HEAD directly, never shell out to git ──────
function detectBranch() {
  try {
    const head = fs.readFileSync(path.join(REPO_ROOT, '.git', 'HEAD'), 'utf8').trim();
    if (head.startsWith('ref: refs/heads/')) {
      return head.slice('ref: refs/heads/'.length);
    }
    return `detached-${head.slice(0, 12)}`; // detached HEAD: use the short SHA
  } catch (e) {
    return 'unknown-branch';
  }
}

const safeName = (name) => name.replace(/[^a-zA-Z0-9._-]/g, '-');
const sleep    = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── console.log capture — the pipeline already logs [search:rescue]/
// [search:filter] lines; reading those (forwarded to the real console.log
// too, so the run is still visible live) is how we detect firing without
// touching any source file to expose it as a return value. ─────────────────
async function runQueryOnce(searchProducts, query) {
  const lines = [];
  const realLog = console.log;
  console.log = (...args) => { const line = args.join(' '); lines.push(line); realLog(line); };
  try {
    const result = await searchProducts(query, { limit: 20 });
    return { result, lines };
  } finally {
    console.log = realLog;
  }
}

// One retry after a 30s wait on a rate-limit-shaped error; any other error
// (or a second rate-limit) is reported and the caller moves on.
async function runQueryWithRetry(searchProducts, query) {
  try {
    return await runQueryOnce(searchProducts, query);
  } catch (err) {
    if (RATE_LIMIT_RE.test(err.message || '')) {
      console.error(`  [rate-limit] "${query}" — waiting 30s and retrying once...`);
      await sleep(30000);
      try {
        return await runQueryOnce(searchProducts, query);
      } catch (err2) {
        if (RATE_LIMIT_RE.test(err2.message || '')) return { rateLimited: true };
        return { error: err2 };
      }
    }
    return { error: err };
  }
}

// Compact score-component summary — prints whatever the pipeline happens to
// attach (_searchParts / _scoreParts); degrades gracefully if a field or the
// whole breakdown is absent (e.g. a different branch's shape).
const fmtParts = (p) => {
  const bits = [];
  if (p._searchParts) {
    const sp = p._searchParts;
    bits.push(`text=${sp.textMatch ?? '-'}`, `sem=${sp.semantic ?? '-'}`, `budget=${sp.budget ?? '-'}`, `color=${sp.color ?? '-'}`);
  }
  if (p._scoreParts) {
    const qp = p._scoreParts;
    const quality = (qp.rating || 0) + (qp.popularity || 0) + (qp.recency || 0);
    bits.push(`cat=${qp.category ?? '-'}`, `price=${qp.price ?? '-'}`, `quality=${quality.toFixed ? quality.toFixed(1) : quality}`);
  }
  return bits.length ? bits.join(' ') : '(no component breakdown available)';
};

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('Connected to DB.\n');
  const { searchProducts } = require('../services/nepShopSearchAdapter');

  const branch = detectBranch();
  console.log(`Detected branch: ${branch}`);

  const queries = fs.readFileSync(QUERIES_FILE, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const outLines = [
    `Branch: ${branch}`,
    `Generated: ${new Date().toISOString()}`,
    `Queries: ${queries.length}`,
    '='.repeat(80),
  ];

  for (const query of queries) {
    outLines.push('', `QUERY: "${query}"`);
    try {
      const run1 = await runQueryWithRetry(searchProducts, query);
      if (run1.rateLimited) { outLines.push('  RATE_LIMITED (gave up after one retry)'); continue; }
      if (run1.error)       { outLines.push(`  ERROR: ${run1.error.message}`); continue; }

      const run2 = await runQueryWithRetry(searchProducts, query);
      if (run2.rateLimited) { outLines.push('  RATE_LIMITED on second run (gave up after one retry)'); continue; }
      if (run2.error)       { outLines.push(`  ERROR on second run: ${run2.error.message}`); continue; }

      const r1 = run1.result, r2 = run2.result;
      const ids1 = r1.results.map((p) => p._id?.toString());
      const ids2 = r2.results.map((p) => p._id?.toString());
      const nondeterministic = JSON.stringify(ids1) !== JSON.stringify(ids2);

      const rescueFired = run1.lines.some((l) => l.startsWith('[search:rescue] fired'));
      const filterFired = run1.lines.some((l) => /\[search:filter\] \S+ fired /.test(l));

      outLines.push(
        `  totalFound=${r1.totalFound}  isZeroResult=${r1.isZeroResult}  rescueFired=${rescueFired}  filterFired=${filterFired}  NONDETERMINISTIC=${nondeterministic}`
      );
      if (r1.interpretedAs) outLines.push(`  interpretedAs: ${JSON.stringify(r1.interpretedAs)}`);
      if (r1.understanding && r1.understanding.wasSpellFixed) {
        outLines.push(`  spellCorrected: "${r1.understanding.originalQuery}" -> "${r1.understanding.query}"`);
      }
      if (nondeterministic) {
        outLines.push(`  run1 ids: ${JSON.stringify(ids1)}`);
        outLines.push(`  run2 ids: ${JSON.stringify(ids2)}`);
      }
      if (r1.results.length === 0 && r1.zeroResultRescue && r1.zeroResultRescue.length) {
        outLines.push(`  zeroResultRescue (${r1.zeroResultRescue.length}): ${r1.zeroResultRescue.slice(0, 8).map((p) => p.name).join(', ')}`);
      }

      const top = r1.results.slice(0, 8);
      if (top.length === 0) {
        outLines.push('  (no results)');
      } else {
        top.forEach((p, i) => {
          outLines.push(
            `  ${i + 1}. ${(p.name || '').padEnd(45)} [${(p.category || '').padEnd(20)}] price=${p.price ?? '-'} score=${p._score ?? '-'}  ${fmtParts(p)}`
          );
        });
      }
    } catch (err) {
      // Belt-and-suspenders: a single query must never take down the whole run.
      outLines.push(`  UNEXPECTED ERROR: ${err.message}`);
      console.error(`UNEXPECTED ERROR on "${query}": ${err.message}`);
    }
  }

  const outFile = path.join(REPO_ROOT, 'docs', `compare-results-${safeName(branch)}.txt`);
  fs.writeFileSync(outFile, outLines.join('\n') + '\n');
  console.log(`\nWritten: ${outFile}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL:', err.message, err.stack);
  process.exit(1);
});
