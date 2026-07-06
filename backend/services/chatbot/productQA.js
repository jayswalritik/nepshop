/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Chatbot Product Q&A  (backend/services/chatbot/productQA.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Feature 6: answers questions from the product's REAL description — by
 * extracting the matching sentences VERBATIM. No match → honest "not
 * mentioned" (feature 11).
 *
 * FULLY CATALOG-AGNOSTIC — no product or category knowledge is hardcoded:
 *   1. Literal pass: question keywords matched against description sentences.
 *   2. Semantic pass (only if literal misses): the question and each sentence
 *      are embedded with the SAME BGE model as search; the closest sentence
 *      above threshold is quoted. BGE supplies the synonym knowledge
 *      ("graphics card" ≈ "RTX 4070") for ANY category — including products
 *      added in the future.
 *   3. Still nothing → honest miss. The bot never guesses a spec.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const Product = require('../../models/Product');
const { embedQuery, embedDocument } = require('../embeddingService');

// Sentence-level similarity threshold — CALIBRATED from measured scores:
// answerable question ("does it have a screen?" vs a touchscreen sentence)
// scored 0.491; unanswerable opinion ("is it good?") scored 0.424.
// 0.46 sits between them with ~0.03 clearance each way. Sentence-level scores
// run lower than the product-level search thresholds — different granularity,
// deliberately a separate constant.
const QA_SEMANTIC_THRESHOLD = 0.46;

// Question scaffolding — generic English only, never topic/product words
const QA_STOPWORDS = new Set([
  'does', 'do', 'is', 'are', 'has', 'have', 'can', 'will', 'what', 'whats',
  "what's", 'which', 'how', 'much', 'many', 'tell', 'me', 'about', 'the',
  'a', 'an', 'it', 'this', 'that', 'one', 'with', 'of', 'in', 'on', 'for',
  'to', 'and', 'or', 'any', 'there', 'its', 'come', 'comes', 'good', 'ok',
  'first', 'second', 'third', 'fourth', 'fifth', 'last',
  '1st', '2nd', '3rd', '4th', '5th','used', 'use', 'using','these', 'them', 'those',
]);

const ORDINALS = {
  first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2,
  fourth: 3, '4th': 3, fifth: 4, '5th': 4,
};

// ── Which shown product is the question about? ────────────────────────────────
// Priority: explicit ordinal → name-word match → only-one-shown → null (ask).
const resolveTarget = (msg, lastProducts) => {
  const lower = msg.toLowerCase();

  for (const [word, idx] of Object.entries(ORDINALS)) {
    if (new RegExp(`\\b(the\\s)?${word}(\\sone)?\\b`).test(lower) && idx < lastProducts.length) {
      return lastProducts[idx];
    }
  }
  if (/\b(the\s)?last(\sone)?\b/.test(lower) && lastProducts.length) {
    return lastProducts[lastProducts.length - 1];
  }

  const tokens = lower.replace(/[^a-z0-9\s]/g, '').split(/\s+/)
    .filter((t) => t.length >= 3 && !QA_STOPWORDS.has(t));
  // Score each product by HOW MANY meaningful tokens hit its name; best wins.
  // (Was first-any-hit, which made "Dolce Shine Eau de" resolve to
  // "Chanel ... Eau De" because "eau" hit the Chanel first in the list.)
  let bestByName = null, bestHits = 0;
  for (const p of lastProducts) {
    const nameLower = p.name.toLowerCase();
    const hits = tokens.filter((t) => nameLower.includes(t)).length;
    if (hits > bestHits) { bestHits = hits; bestByName = p; }
  }
  if (bestByName) return bestByName;

  if (lastProducts.length === 1) return lastProducts[0];
  return null; // ambiguous — service will ask which one
};

// ── What is the question about? ───────────────────────────────────────────────
const extractTopicKeywords = (msg, productName = '') => {
  const nameWords = new Set(
    productName.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
  );
  return msg.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
    .filter((t) => t.length >= 3 && !QA_STOPWORDS.has(t) && !nameWords.has(t));
};

// ── Cosine similarity (same math as the search fallback path) ────────────────
const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
};

// ── Extract the matching sentence(s) from the real description ───────────────
// ASYNC: the semantic pass embeds on demand.
const answerFromDescription = async (description, keywords, rawQuestion) => {
  if (!description) return [];

  const sentences = description.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
  if (!sentences.length) return [];

  // Pass 1 — literal keyword match (fast, exact, free)
  if (keywords.length) {
    const literalHits = sentences.filter((s) =>
      keywords.some((k) => new RegExp(`\\b${k}`, 'i').test(s))
    );
    if (literalHits.length) return literalHits.slice(0, 2);
  }

  // Pass 2 — semantic sentence match via the SAME BGE model as search.
  // Non-fatal: if embedding hiccups, we fall through to the honest miss.
  try {
    const qVec = await embedQuery(rawQuestion);
    let best = null, bestScore = -1;
    for (const s of sentences) {
      const sVec  = await embedDocument(s);
      const score = cosine(qVec, sVec);
      if (score > bestScore) { bestScore = score; best = s; }
    }

    if (best && bestScore >= QA_SEMANTIC_THRESHOLD) return [best];
  } catch (err) {
    console.warn('QA semantic pass failed (falling back to honest miss):', err.message);
  }

  return []; // honest miss
};

const fetchProductForQA = (id) =>
  Product.findById(id)
    .select('name description price discount category images rating stock')
    .lean();

// Fetch full documents for a set of shown products, PRESERVING list order
// (ordinals in the chat refer to display order, not Mongo's return order).
const fetchProductsForQA = async (ids) => {
  const docs = await Product.find({ _id: { $in: ids } })
    .select('name description price discount category images rating stock')
    .lean();
  const byId = new Map(docs.map((d) => [d._id.toString(), d]));
  return ids.map((id) => byId.get(id.toString())).filter(Boolean);
};

// ── Cart target resolution ────────────────────────────────────────────────────
// Superlatives ("the cheapest") resolve against prices/ratings of the shown
// list; ordinals and names reuse resolveTarget; then the focused product; then
// a single shown product. Null → caller asks which one.
const resolveCartTarget = (msg, lastProducts, qaFocus) => {
  const lower = msg.toLowerCase();
  if (lastProducts.length > 0) {
    if (/\b(cheapest|least\s?expensive|lowest\s?priced?)\b/.test(lower)) {
      return lastProducts.reduce((a, b) => (b.finalPrice < a.finalPrice ? b : a));
    }
    if (/\b(most\s?expensive|priciest|highest\s?priced?)\b/.test(lower)) {
      return lastProducts.reduce((a, b) => (b.finalPrice > a.finalPrice ? b : a));
    }
    if (/\b(best|top|highest)\s?rated\b/.test(lower)) {
      return lastProducts.reduce((a, b) => ((b.rating || 0) > (a.rating || 0) ? b : a));
    }
  }
  const byPosition = resolveTarget(msg, lastProducts);
  if (byPosition) return byPosition;
  if (qaFocus) return qaFocus;
  if (lastProducts.length === 1) return lastProducts[0];
  return null;
};

module.exports = { 
  resolveTarget, 
  extractTopicKeywords, 
  answerFromDescription, 
  fetchProductForQA, 
  fetchProductsForQA,
  resolveCartTarget,
};