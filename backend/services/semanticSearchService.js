// backend/services/semanticSearchService.js  (CommonJS)
//
// Computes semantic (meaning-based) scores for a search query and returns
// { productId: cosineSimilarity } for products above the threshold. The
// adapter feeds this into runSearch's semanticScores hook.
//
// SCALE-READY: two paths, chosen automatically per query.
//   1. PRIMARY  -> MongoDB Atlas Vector Search ($vectorSearch aggregation).
//                  Uses a real ANN index — scales to very large catalogs, no
//                  Node-side looping over every vector.
//   2. FALLBACK -> in-Node brute-force cosine over stored embeddings.
//                  Used only if the Atlas vector index isn't built yet or the
//                  aggregation errors. Fine for small/medium catalogs.
//
// Query embedding itself is separate and also has a fallback:
//   HF Space (if HF_SPACE_URL set) -> in-Node embed().
//
// Atlas returns a cosine score remapped to (1 + cosine)/2; we convert it back
// to raw cosine so thresholds/weights behave identically on both paths.

const Product = require('../models/Product');
const { embedQuery } = require('./embeddingService');

const HF_SPACE_URL  = process.env.HF_SPACE_URL || '';
const HF_TOKEN      = process.env.HF_TOKEN || '';
const VECTOR_INDEX  = process.env.VECTOR_INDEX_NAME || 'product_embedding_index';

let warnedAtlasFallback = false;

// ---------- vector math (fallback path) ----------

function normalize(vec) {
  let mag = 0;
  for (const x of vec) mag += x * x;
  mag = Math.sqrt(mag);
  return mag === 0 ? vec : vec.map((x) => x / mag);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ---------- query embedding (HF Space primary, Node fallback) ----------

async function embedViaHFSpace(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(HF_SPACE_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : {}),
      },
      body: JSON.stringify({ inputs: query }),
    });
    if (!res.ok) throw new Error(`HF Space returned ${res.status}`);

    let data = await res.json();
    if (Array.isArray(data) && Array.isArray(data[0])) {
      if (data.length === 1) data = data[0];
      else throw new Error('Space returned unpooled vectors');
    }
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Space returned unexpected shape');
    }
    return normalize(data.map(Number));
  } finally {
    clearTimeout(timer);
  }
}

async function getQueryVector(query) {
  if (HF_SPACE_URL) {
    try {
      return await embedViaHFSpace(query);
    } catch (err) {
      console.warn('HF Space failed, using local embedding:', err.message);
    }
  }
  return await embedQuery(query); // BGE query prefix applied inside
}

// ---------- semantic scoring paths ----------

// PRIMARY: Atlas Vector Search. `$vectorSearch` must be the first pipeline
// stage. We don't pre-filter by isActive/stock here (that would need those
// fields indexed as filters) — the engine already restricts scoring to the
// active pool, so inactive hits are harmlessly ignored downstream.
async function atlasVectorScores(queryVector, threshold) {
  const rows = await Product.aggregate([
    {
      $vectorSearch: {
        index: VECTOR_INDEX,
        path: 'embedding',
        queryVector,
        numCandidates: 200, // ANN breadth; safe for small and large catalogs
        limit: 100,         // top matches to consider (merged with literal later)
      },
    },
    { $project: { _id: 1, score: { $meta: 'vectorSearchScore' } } },
  ]);

  const scores = {};
  for (const r of rows) {
    const cosine = 2 * r.score - 1; // Atlas cosine score = (1 + cosine)/2
    if (cosine >= threshold) scores[r._id.toString()] = cosine;
  }
  return scores;
}

// FALLBACK: brute-force cosine over stored embeddings.
async function bruteForceScores(queryVector, threshold) {
  const products = await Product.find({ isActive: true, stock: { $gt: 0 } })
    .select('+embedding')
    .lean();

  const scores = {};
  for (const p of products) {
    if (!p.embedding || p.embedding.length === 0) continue;
    const sim = cosineSimilarity(queryVector, p.embedding);
    if (sim >= threshold) scores[p._id.toString()] = sim;
  }
  return scores;
}

// ---------- the function the adapter calls ----------

async function computeSemanticScores(query, config = {}) {
  const queryVector = await getQueryVector(query);
  if (!queryVector) return {};

  const threshold = config.semanticThreshold != null ? config.semanticThreshold : 0.4;

  try {
    return await atlasVectorScores(queryVector, threshold);
  } catch (err) {
    if (!warnedAtlasFallback) {
      console.warn(
        'Atlas Vector Search unavailable, using in-Node cosine fallback ' +
        '(create the vector index to enable Atlas path):',
        err.message
      );
      warnedAtlasFallback = true;
    }
    return await bruteForceScores(queryVector, threshold);
  }
}

module.exports = { computeSemanticScores };