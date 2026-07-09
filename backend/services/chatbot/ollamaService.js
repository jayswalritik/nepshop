/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Ollama Service  (backend/services/chatbot/ollamaService.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Layer 3 of the chatbot: natural-language answers via a LOCAL LLM.
 *
 * Anti-hallucination by architecture: the LLM never fetches or knows facts —
 * every call hands it the grounded data (fetched from Mongo by the action
 * layer) and instructs it to answer ONLY from that data. It composes language,
 * not knowledge.
 *
 * Graceful degradation: if Ollama isn't running (or on Render, where 512MB
 * can't hold the model), every function returns null and callers fall back to
 * the template/extraction path. Availability is checked at most once a minute
 * so a down Ollama doesn't add latency to every message.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const axios = require('axios');

const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';
const TIMEOUT_MS   = 40000;  // warm-model generation headroom; cold load is handled by warmUp
const RECHECK_MS   = 60000;   // availability cache

// ── Groq (free tier, no card) — priority LLM when the key is set ─────────────
// OpenAI-compatible endpoint. 70B-class model: far more natural than local 3b
// and ~1s responses vs 8-15s on CPU. Chain: Groq → Ollama → templates.
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_KEY   = process.env.GROQ_API_KEY || null;

let groqHealthy    = true;      // flips false on failure, retried after cooldown
let groqFailedAt   = 0;
const GROQ_RETRY_MS = 60000;

const groqGenerate = async (systemPrompt, userPrompt) => {
  if (!GROQ_KEY) {
    console.log('[llm] groq skipped (no API key) -> trying ollama');
    return null;
  }
  if (!groqHealthy && Date.now() - groqFailedAt < GROQ_RETRY_MS) {
    console.log(`[llm] groq skipped (cooldown, ${GROQ_RETRY_MS - (Date.now() - groqFailedAt)}ms remaining) -> trying ollama`);
    return null;
  }

  const t0 = Date.now();
  try {
    const { data } = await axios.post(
      GROQ_URL,
      {
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 200,
      },
      {
        headers: { Authorization: `Bearer ${GROQ_KEY}` },
        timeout: 8000,   // Groq is fast; a slow response means trouble — fall through
      }
    );
    groqHealthy = true;
    const text = data?.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch (err) {
    // 429 = rate limit; anything else = outage/misconfig. Either way: cool down
    // and let the chain fall through to Ollama/templates.
    groqHealthy  = false;
    groqFailedAt = Date.now();
    const reason = err.response?.status || err.message;
    console.warn(`Groq failed (${reason}) — falling back to Ollama/templates`);
    console.warn(`[llm] groq failed (${reason}) after ${Date.now() - t0}ms -> falling back to ollama`);
    return null;
  }
};

let availableCache = null;
let lastCheckedAt  = 0;

const isAvailable = async () => {
  const now = Date.now();
  if (availableCache !== null && now - lastCheckedAt < RECHECK_MS) {
    return availableCache;
  }
  const wasDown = availableCache === false;
  try {
    await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 1500 });
    availableCache = true;
    // Ollama just came BACK after being down → model is cold; re-warm it in
    // the background so the next user question doesn't pay the load cost.
    if (wasDown) setTimeout(() => warmUp(), 0);
  } catch {
    availableCache = false;
  }
  lastCheckedAt = now;
  return availableCache;
};

// Core call. Returns the generated text, or null on ANY failure.
const ollamaGenerate = async (systemPrompt, userPrompt) => {
  const t0 = Date.now();
  if (!(await isAvailable())) {
    console.log(`[llm] ollama unavailable (skipped) after ${Date.now() - t0}ms -> falling back to none`);
    return null;
  }
  try {
    const { data } = await axios.post(
      `${OLLAMA_URL}/api/chat`,
      {
        model: OLLAMA_MODEL,
        stream: false,
         keep_alive: '60m',   // keep the model in RAM between questions
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        options: {
          temperature: 0.2,   // low — we want faithful phrasing, not creativity
          num_predict: 120,   // chat answers, not essays
        },
      },
      { timeout: TIMEOUT_MS }
    );
    const text = data?.message?.content?.trim();
    return text || null;
  } catch (err) {
    const reason = err.message || 'empty/invalid response';
    console.warn('Ollama generate failed (falling back to templates):', reason);
    console.warn(`[llm] ollama failed (${reason}) after ${Date.now() - t0}ms -> falling back to none`);
    availableCache = null; // force a recheck next time
    return null;
  }
};

// ── Unified LLM entry: Groq (fast, 70B) → Ollama (local 3b) → null ───────────
// Callers unchanged: null still means "use the template fallback". Each call
// logs exactly one [llm] provider=... summary line showing which link in the
// chain actually served (or "none" if both failed) — logging only, the chain
// order/timeouts/retries/models/prompts below are unchanged.
const generate = async (systemPrompt, userPrompt) => {
  const tStart = Date.now();

  const tGroq0 = Date.now();
  const fromGroq = await groqGenerate(systemPrompt, userPrompt);
  if (fromGroq) {
    console.log(`[llm] provider=groq model=${GROQ_MODEL} latency=${Date.now() - tGroq0}ms`);
    return fromGroq;
  }

  const tOllama0 = Date.now();
  const fromOllama = await ollamaGenerate(systemPrompt, userPrompt);
  if (fromOllama) {
    console.log(`[llm] provider=ollama model=${OLLAMA_MODEL} latency=${Date.now() - tOllama0}ms`);
    return fromOllama;
  }

  console.log(`[llm] provider=none latency=${Date.now() - tStart}ms`);
  return null;
};

// ── Product Q&A: answer from the FULL product document ───────────────────────
const QA_SYSTEM_PROMPT =
  `You are NepShop's friendly shopping assistant. Answer the customer's ` +
  `question using the PRODUCT DATA provided. Rules:\n` +
  `- Answer from what the data states OR clearly implies. Example: a nail ` +
  `polish described as giving "a glossy red hue for polished nails" IS for ` +
  `painting nails — say so naturally.\n` +
  `- If asked generally about the product ("tell me about it"), give a short ` +
  `friendly summary of the data.\n` +
  `- NEVER invent specific specs, numbers, features, or availability that are ` +
  `neither stated nor clearly implied. If something truly isn't covered, say ` +
  `it isn't mentioned in the listing.\n` +
  `- 1-3 short sentences. No markdown, no lists.`;

const answerProductQuestion = async (product, question) => {
  const finalPrice = product.discount > 0
    ? Math.round(product.price * (1 - product.discount / 100))
    : product.price;

  const userPrompt =
    `PRODUCT DATA:\n` +
    `Name: ${product.name}\n` +
    `Category: ${product.category}\n` +
    `Price: Rs ${finalPrice}${product.discount > 0 ? ` (${product.discount}% off Rs ${product.price})` : ''}\n` +
    `In stock: ${product.stock > 0 ? `yes (${product.stock} units)` : 'no'}\n` +
    `Rating: ${product.rating > 0 ? `${product.rating.toFixed(1)}/5` : 'not rated yet'}\n` +
    `Description: ${product.description || '(none)'}\n\n` +
    `CUSTOMER QUESTION: ${question}`;

  return generate(QA_SYSTEM_PROMPT, userPrompt);
};

// ── Warm-up: load the model into RAM at backend start ────────────────────────
// The FIRST generation after Ollama starts includes loading ~2GB into memory
// (20–60s on CPU) — far past TIMEOUT_MS. So we fire one tiny request with a
// long timeout when the backend boots; by the time a user asks a question the
// model is warm and answers in a few seconds. Fire-and-forget, non-fatal:
// where Ollama doesn't exist (Render), isAvailable fails fast and this no-ops.
const warmUp = async () => {
  if (!(await isAvailable())) return;
  try {
    console.log('🔥 Warming up Ollama model…');
    await axios.post(
      `${OLLAMA_URL}/api/chat`,
      {
        model: OLLAMA_MODEL,
        stream: false,
        keep_alive: '60m',
        messages: [{ role: 'user', content: 'hi' }],
        options: { num_predict: 5 },
      },
      { timeout: 120000 }
    );
    console.log('✅ Ollama model warm — LLM answers ready');
  } catch (err) {
    console.warn('Ollama warm-up failed (template fallback will be used):', err.message);
  }
};

warmUp(); // fire-and-forget on module load


// ── Multi-product Q&A: answer from MATCHED EXCERPTS only ─────────────────────
// The model receives ONLY listing sentences that matched the question (found
// by the same literal+semantic extraction as single QA). Products with no
// matching sentence aren't shown to it at all — so it structurally cannot
// claim they have the feature. Restriction beats instruction for small models.
const MULTI_QA_SYSTEM_PROMPT =
  `You are NepShop's friendly shopping assistant. The customer asked a ` +
  `question across several products. Below are the ONLY listing excerpts ` +
  `related to their question. Rules:\n` +
  `- Answer using ONLY these excerpts. Name the product(s) whose excerpt ` +
  `answers the question.\n` +
  `- If an excerpt only relates loosely, say the listing "mentions" or ` +
  `"suggests" it — do not upgrade it to a definite fact.\n` +
  `- NEVER add specs, numbers, or features not in the excerpts.\n` +
  `- 1-3 short sentences. No markdown, no lists.`;

const answerMultiProductQuestion = async (matches, question, totalShown) => {
  // matches: [{ name, sentences: [...] }] — only products whose listing matched
  const blocks = matches.map((m) =>
    `${m.name}:\n"${m.sentences.join('. ')}"`
  ).join('\n\n');

  const userPrompt =
    `The customer is looking at ${totalShown} products. These are the only ` +
    `listing excerpts related to their question:\n\n${blocks}\n\n` +
    `CUSTOMER QUESTION: ${question}`;

  return generate(MULTI_QA_SYSTEM_PROMPT, userPrompt);
};

module.exports = { 
    isAvailable, 
    generate, 
    answerProductQuestion,
    warmUp,
    answerMultiProductQuestion,
};