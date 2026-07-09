/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Query Understanding  (backend/services/queryUnderstanding.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Last-resort interpreter for a query the literal/semantic search engine
 * genuinely can't make sense of on its own. Asks the LLM (via the existing
 * Groq → Ollama → null fallback chain in ollamaService.generate) to translate
 * the customer's words into a handful of generic product nouns, then hands
 * those back to the caller to re-run through the SAME search pipeline.
 *
 * No product/category knowledge lives here — the LLM supplies understanding,
 * this file only validates the shape of what comes back. On ANY failure
 * (LLM down, bad JSON, junk terms) it returns null so the caller can fall
 * back to today's behavior unchanged.
 *
 * EXPORTS
 *   understandQuery(rawQuery) -> Promise<{ terms: string[], reason } | null>
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { generate } = require('./chatbot/ollamaService');

const SYSTEM_PROMPT =
  `You are a shopping search interpreter for an e-commerce store. Given a ` +
  `customer's search query, reply with ONLY a JSON object of the form ` +
  `{"terms": ["..."]} containing 2-5 generic product words the store's ` +
  `search should look for. Rules:\n` +
  `- Terms must be common nouns for the KIND of product (e.g. "computer", ` +
  `"laptop", "television") — never brand names, never invented specifics.\n` +
  `- If the query is meaningless gibberish or you can't tell what product ` +
  `it refers to, reply {"terms": []}.\n` +
  `- Reply with ONLY the JSON object. No prose, no markdown, no code fences.`;

const MAX_TERMS = 6;
const MAX_WORDS_PER_TERM = 3;
const TERM_PATTERN = /^[a-z][a-z\s-]{0,29}$/; // letters/spaces/hyphens, <=30 chars

const isValidTerm = (t) =>
  typeof t === 'string' &&
  t.trim().split(/\s+/).length <= MAX_WORDS_PER_TERM &&
  TERM_PATTERN.test(t.trim().toLowerCase());

// Extract the first {...} block — the LLM occasionally wraps JSON in prose
// or a code fence despite instructions.
const extractJsonObject = (text) => {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
};

const understandQuery = async (rawQuery) => {
  const query = (rawQuery || '').trim();
  if (!query) return null;

  let raw;
  try {
    raw = await generate(SYSTEM_PROMPT, `CUSTOMER QUERY: ${query}`);
  } catch (e) {
    return null;
  }
  if (!raw) return null;

  const jsonText = extractJsonObject(raw);
  if (!jsonText) return null;

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return null;
  }

  if (!parsed || !Array.isArray(parsed.terms)) return null;
  if (parsed.terms.length > MAX_TERMS) return null;
  if (!parsed.terms.every(isValidTerm)) return null;

  const terms = [...new Set(parsed.terms.map(t => t.trim().toLowerCase()))].filter(Boolean);
  if (!terms.length) return null;

  return { terms, reason: 'llm-query-understanding' };
};

module.exports = { understandQuery };
