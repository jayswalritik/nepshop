// backend/services/embeddingService.js  (CommonJS)
//
// Turns text into a 384-dim meaning-vector. Hybrid, environment-agnostic:
//
//   • If HF_SPACE_URL is set  → embed via the HF Space (BGE), keeping the heavy
//     model OUT of this process (important on Render's 512MB free tier).
//   • Otherwise, or if the Space errors/times out → embed IN-NODE (BGE via
//     @huggingface/transformers).
//
// Same behaviour for BOTH sides, with the BGE asymmetry preserved:
//   • embedQuery(text)    → adds the BGE query prefix   (search queries)
//   • embedDocument(text) → no prefix                   (products)
//
// Locally (HF_SPACE_URL unset) everything runs in-Node exactly as before.
// Deployed (HF_SPACE_URL set) everything routes to the Space, with Node as a
// safety fallback. No code changes between environments — just the env var.

const MODEL_NAME   = 'Xenova/bge-small-en-v1.5';
const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';

const HF_SPACE_URL = process.env.HF_SPACE_URL || '';
const HF_TOKEN     = process.env.HF_TOKEN || '';

let transformersPromise = null;
let extractorPromise = null;
let warnedSpaceFallback = false;

// ── in-Node model (fallback / local) ─────────────────────────────────────────
function getTransformers() {
  if (!transformersPromise) transformersPromise = import('@huggingface/transformers');
  return transformersPromise;
}

async function getExtractor() {
  if (!extractorPromise) {
    const { pipeline } = await getTransformers();
    extractorPromise = pipeline('feature-extraction', MODEL_NAME);
  }
  return extractorPromise;
}

async function embedInNode(text) {
  const clean = (text || '').trim();
  if (!clean) return null;
  const extractor = await getExtractor();
  const output = await extractor(clean, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// ── HF Space (preferred when configured) ─────────────────────────────────────
function normalizeVec(vec) {
  let mag = 0;
  for (const x of vec) mag += x * x;
  mag = Math.sqrt(mag);
  return mag === 0 ? vec : vec.map((x) => x / mag);
}

async function embedViaSpace(text, isQuery) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000); // products can be longer → 6s
  try {
    const res = await fetch(HF_SPACE_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : {}),
      },
      body: JSON.stringify({ inputs: text, is_query: isQuery }),
    });
    if (!res.ok) throw new Error(`HF Space returned ${res.status}`);
    let data = await res.json();
    if (Array.isArray(data) && Array.isArray(data[0])) {
      if (data.length === 1) data = data[0];
      else throw new Error('Space returned unpooled vectors');
    }
    if (!Array.isArray(data) || data.length === 0) throw new Error('Space returned unexpected shape');
    return normalizeVec(data.map(Number));
  } finally {
    clearTimeout(timer);
  }
}

// ── the shared path: Space first (if set), Node fallback always ──────────────
async function embedText(text, isQuery) {
  const clean = (text || '').trim();
  if (!clean) return null;

  if (HF_SPACE_URL) {
    try {
      return await embedViaSpace(clean, isQuery);
    } catch (err) {
      if (!warnedSpaceFallback) {
        console.warn('HF Space embedding failed, falling back to in-Node:', err.message);
        warnedSpaceFallback = true;
      }
      // fall through to Node
    }
  }
  return embedInNode(isQuery ? (QUERY_PREFIX + clean) : clean);
}

// ── public API ───────────────────────────────────────────────────────────────

// QUERY embedding — WITH the BGE prefix. Used at search time.
async function embedQuery(text) {
  return embedText(text, true);
}

// PRODUCT / document embedding — NO prefix. Used by controller, seed, backfill.
async function embedDocument(text) {
  return embedText(text, false);
}

// Back-compat alias: existing callers of embed() get document behaviour.
async function embed(text) {
  return embedDocument(text);
}

// The text we embed for a product.
function buildProductText(product) {
  return [product.name, product.category, product.description]
    .filter(Boolean)
    .join('. ');
}

module.exports = { embed, embedQuery, embedDocument, buildProductText };