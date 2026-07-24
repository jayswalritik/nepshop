/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Chatbot Intent Router  (backend/services/chatbot/intentRouter.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Layer 1 of the chatbot: rule-based, instant, no model.
 *
 * Classifies a raw chat message into an intent + a cleaned query. The router
 * is COMPLETE from day one — it recognizes every planned intent. Intents whose
 * action layer isn't built yet get an honest "coming soon" template, and each
 * new slice only adds an action function; the router never changes shape.
 *
 * Design choice: anything that doesn't match a specific intent defaults to
 * PRODUCT_SEARCH. In a shop, "gaming laptop" with no verb is a search — and
 * the search engine already handles nonsense honestly (zero results + rescue),
 * so there is no risk in routing leftovers there.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Intent constants ──────────────────────────────────────────────────────────
const INTENTS = {
  GREETING:       'greeting',
  THANKS:         'thanks',
  GOODBYE:        'goodbye',
  HELP:           'help',
  ORDER_TRACKING: 'order_tracking',   // action in a later slice (stubbed now)
  ORDER_HISTORY:  'order_history',    // action in a later slice (stubbed now)
  RETURN_REFUND:  'return_refund',    // action in a later slice (stubbed now)
  TRENDING:       'trending',         // grounded in recommendation engine
  PRODUCT_SEARCH: 'product_search',   // LIVE in slice one
  FOLLOW_UP:      'follow_up',        // question about the products just shown
  PRODUCT_QA:     'product_qa',       // question about a product already shown
  MULTI_QA:       'multi_qa',         // question across the shown product list
  ADD_TO_CART:    'add_to_cart',      // conversational cart add
  ORDER_FOLLOW_UP:'order_follow_up',  // ordinal question about listed orders
  SHOW_AGAIN:     'show_again',       // re-show what was listed before
  VIEW_CART:      'view_cart',        // "what's in my cart?"
};

// Optional dictionary guard (same package the search engine uses)
let ENGLISH_WORDS = null;
try { ENGLISH_WORDS = new Set(require('an-array-of-english-words')); } catch (e) { ENGLISH_WORDS = null; }

// The bot's own command vocabulary — typos in THESE words break routing
// ("reent orders" → search instead of history). Linguistic, not catalog.
const INTENT_KEYWORDS = [
  'order', 'orders', 'return', 'refund', 'track', 'tracking', 'status',
  'recent', 'history', 'arrive', 'deliver', 'delivery', 'cart', 'basket',
  'trending', 'popular', 'cheapest', 'expensive', 'rated', 'help',
];

const editDistance1 = (a, b) => {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};

// Adjacent-letter swap ("retrun" → "return") — Levenshtein counts a swap as 2
// edits, so plain distance-1 misses this very common typo class.
const isTransposition1 = (a, b) => {
  if (a.length !== b.length) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (i >= a.length - 1) return false;
  return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
};

const correctIntentTypos = (msg) =>
  msg.split(/\s+/).map((tok) => {
    if (tok.length < 4) return tok;
    if (INTENT_KEYWORDS.includes(tok)) return tok;
    if (ENGLISH_WORDS && ENGLISH_WORDS.has(tok)) return tok;   // real word — leave it
    for (const kw of INTENT_KEYWORDS) {
      if (editDistance1(tok, kw) || isTransposition1(tok, kw)) return kw;
    }
    return tok;
  }).join(' ');

// ── Conversational filler to strip before searching ──────────────────────────
// Chat messages carry filler that search-bar queries don't:
// "can you show me gaming laptops" → "gaming laptops".
// Stripped repeatedly so stacked prefixes ("hey can you please find me…") die.
const SEARCH_PREFIXES = [
  'hey', 'hi', 'hello', 'please', 'can you', 'could you', 'would you',
  'will you', 'i want to', 'i want', 'i need', 'i would like', "i'd like",
  'i am looking for', "i'm looking for", 'im looking for', 'looking for',
  'show me', 'show', 'find me', 'find', 'search for', 'search',
  'do you have any', 'do you have', 'do you sell', 'get me', 'give me',
  'suggest me', 'suggest', 'recommend me', 'recommend', 'any', 'some',
  'to buy', 'buy',
];

const cleanSearchQuery = (message) => {
  let q = message.toLowerCase().trim()
    .replace(/[?!.]+$/g, '')        // trailing punctuation
    .replace(/\s+/g, ' ');

  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of SEARCH_PREFIXES) {
      if (q === prefix) { q = ''; changed = false; break; }
      if (q.startsWith(prefix + ' ')) {
        q = q.slice(prefix.length + 1).trim();
        changed = true;
      }
    }
  }
  return q;
};

// ── Word-boundary test helper (same philosophy as search: no substring hits) ──
const hasWord = (text, word) =>
  new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);

const hasAnyWord = (text, words) => words.some((w) => hasWord(text, w));

// A short-id token: exactly 6 HEXADECIMAL chars with an optional leading '#'.
// Hex-only (not general alphanumeric) so real product queries like "b550m1" or
// "27gp85" are never mistaken for an order id. Returns { hashed, id } or null.
const shortIdToken = (msg) => {
  for (const tok of (msg || '').split(/\s+/)) {
    const m = tok.match(/^(#?)([0-9a-f]{6})[?.!,]*$/i);
    if (m) return { hashed: m[1] === '#', id: m[2].toUpperCase() };
  }
  return null;
};

// ── Follow-up patterns (feature 7 — conversation memory) ─────────────────────
// Anchored to the WHOLE message so a fresh search like "cheapest laptop"
// (superlative + product noun) never matches — only pure follow-up questions
// about the items already on screen do.
const FOLLOW_UP_PATTERNS = [
  { kind: 'cheapest',   re: /^(which|what)?\s*(one\s*)?(is\s*)?(the\s*)?(cheapest|lowest\s?priced?|least\s?expensive)\s*(one)?\s*\??$/i },
  { kind: 'expensive',  re: /^(which|what)?\s*(one\s*)?(is\s*)?(the\s*)?(most\s?expensive|priciest|highest\s?priced?)\s*(one)?\s*\??$/i },
  { kind: 'best_rated', re: /^(which|what)?\s*(one\s*)?(is\s*)?(the\s*)?((best|highest|top)\s?rated|best)\s*(one)?\s*\??$/i },
];

// ── Product Q&A patterns (context-gated, like follow-ups) ────────────────────
// Fires only when products are already on screen. Without context, the same
// words fall through to search — which finds the product, after which the QA
// flow works ("tell me about the predator" → search → "does it have a GPU?").
const QA_STARTERS  = /^(does|do|is|are|has|have|can|will|what|whats|what's|which|how|tell me|what about)\b/i;
const QA_PRONOUNS  = /\b(it|this|that one|these|those|(the\s)?(first|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th)\sone)\b/i;

const QA_NAME_STOP = new Set(['does','do','is','are','has','have','can','will','what','which','how','the','a','an','one','it','this','that','with','of','in','on','for','to','and','or','any','about','tell','me','much','many','come','comes']);

// Does any meaningful word in the message appear in a shown product's name?
const matchesShownProductName = (msg, lastProducts) => {
  const tokens = msg.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
    .filter((t) => t.length >= 3 && !QA_NAME_STOP.has(t));
  return lastProducts.some((p) =>
    tokens.some((t) => p.name.toLowerCase().includes(t))
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// detectIntent(message) → { intent, query }
//   intent  one of INTENTS
//   query   cleaned text to pass to the action layer (search query, etc.)
// Rules are ORDERED — first match wins. Specific intents before generic ones.
// All intent rules test msgFixed (intent-keyword typos corrected); rules 1-3
// use raw msg (exact short forms), and the search default uses rawMessage so
// product-word typos stay the search engine's catalog-aware job.
// ─────────────────────────────────────────────────────────────────────────────
const detectIntent = (rawMessage, context = {}) => {
  const msg = (rawMessage || '').toLowerCase().trim();
  const msgFixed = correctIntentTypos(msg);

  if (!msg) return { intent: INTENTS.HELP, query: '' };

  const wordCount = msg.split(/\s+/).length;

  // ── 1. Greeting — short messages that are ONLY a greeting ──────────────────
  if (
    wordCount <= 4 &&
    /^(hi+|hello+|hey+|namaste|good\s(morning|afternoon|evening|day))[\s!,.]*$/i.test(msg)
  ) {
    return { intent: INTENTS.GREETING, query: '' };
  }

  // ── 2. Thanks ───────────────────────────────────────────────────────────────
  if (wordCount <= 5 && hasAnyWord(msg, ['thanks', 'thank', 'thx', 'dhanyabad'])) {
    return { intent: INTENTS.THANKS, query: '' };
  }

  // ── 3. Goodbye ──────────────────────────────────────────────────────────────
  if (wordCount <= 4 && /^(bye+|goodbye|see\s?(you|ya)|ok\s?bye)[\s!,.]*$/i.test(msg)) {
    return { intent: INTENTS.GOODBYE, query: '' };
  }

  // ── 4. Help / capabilities ──────────────────────────────────────────────────
  if (
    hasAnyWord(msgFixed, ['help']) ||
    /what (can|do) you (do|help)/.test(msgFixed) ||
    /how (do|does) (you|this) work/.test(msgFixed)
  ) {
    return { intent: INTENTS.HELP, query: '' };
  }

  // ── 4.6 Reply to a pending "which one should I add?" ───────────────────────
  if (context.pendingCartAdd && Array.isArray(context.lastProducts) && context.lastProducts.length > 0) {
    const SEL = /^(the\s)?(first|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th)(\sone)?[\s?.!]*$/i;
    if (SEL.test(msgFixed) || /\b(all|both|everything)\b/i.test(msgFixed) || matchesShownProductName(msgFixed, context.lastProducts)) {
      return { intent: INTENTS.ADD_TO_CART, query: msgFixed };
    }
  }

  // ── 4.65 Bare "all of them" with products shown → add all to cart ──────────
  // Guarded against pendingQAQuestion so "all of them" answering a QA "which
  // one?" doesn't trigger a cart add.
  if (
    Array.isArray(context.lastProducts) && context.lastProducts.length > 0 &&
    !context.pendingQAQuestion &&
    /^(add\s)?(all|both|everything)(\sof\s(them|these|those))?[\s?.!]*$/i.test(msgFixed)
  ) {
    return { intent: INTENTS.ADD_TO_CART, query: msgFixed };
  }

  // ── 4.7 Add to cart — "add the cheapest to my cart", "put it in the cart" ──
  if (/\b(add|put)\b/i.test(msgFixed) && /\b(cart|basket)\b/i.test(msgFixed)) {
    return { intent: INTENTS.ADD_TO_CART, query: msgFixed };
  }

  // ── 4.8 View cart — any cart/basket mention that isn't an add ──────────────
  // "what's in my cart", "show my cart", "items in my cart page", "is my cart
  // empty". Runs AFTER 4.7, so add/put phrasings are already taken.
  if (/\b(cart|basket)\b/i.test(msgFixed)) {
    return { intent: INTENTS.VIEW_CART, query: '' };
  }

  // ── 5. Return / refund — check BEFORE order tracking ───────────────────────
  if (hasAnyWord(msgFixed, ['return', 'refund', 'exchange']) || /money\s?back/.test(msgFixed)) {
    return { intent: INTENTS.RETURN_REFUND, query: msgFixed };
  }

  // ── 7.75 Follow-up on the ORDER list just shown ─────────────────────────────
  // Gated on the LAST intent being order-related, so the same words after a
  // product search still mean products.
  if (
    Array.isArray(context.lastOrders) && context.lastOrders.length > 0 &&
    ['order_tracking', 'order_history', 'order_follow_up', 'return_refund'].includes(context.lastIntent)
  ) {
    // (a) Ordinal / "that one" — "when will the second one arrive?"
    if (/\b((the\s)?(first|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th)(\s(one|order))?|(that|this)\s?one)\b/i.test(msgFixed)) {
      return { intent: INTENTS.ORDER_FOLLOW_UP, query: msgFixed };
    }
    // (b) Status question — "which is the delivered one?", "any out for delivery?"
    const STATUS_WORDS = /\b(delivered|cancelled|canceled|confirmed|pending|packed|dispatched|returned|out\s?for\s?delivery|on\s?the\s?way)\b/i;
    if (STATUS_WORDS.test(msgFixed) && /\b(which|what|any|is|are)\b/i.test(msgFixed)) {
      return { intent: INTENTS.ORDER_FOLLOW_UP, query: msgFixed, statusFilter: msgFixed.match(STATUS_WORDS)[0].toLowerCase() };
    }
    // (c) Short-id reference — "#1C5159" / "1C5159". Ordinal (a) and status (b)
    // are checked first, so an ordinal always wins over a stray hex token. A
    // HASHED id is an explicit order reference → route regardless of match (the
    // handler echoes a not-found when it isn't in the list). A BARE id is only a
    // reliable intent when it actually matches a shown order — otherwise a plain
    // 6-hex string could be a product query, so we let it fall through to search
    // exactly as today.
    const idTok = shortIdToken(msgFixed);
    if (idTok) {
      const known = context.lastOrders.some((o) => (o.shortId || '').toUpperCase() === idTok.id);
      if (idTok.hashed || known) {
        return { intent: INTENTS.ORDER_FOLLOW_UP, query: msgFixed };
      }
    }
  }

  // ── 6. Order tracking ───────────────────────────────────────────────────────
  if (
    /where('s| is)?\s.*\b(order|package|parcel|delivery)\b/.test(msgFixed) ||
    /\btrack\b/.test(msgFixed) ||
    /\b(order|delivery)\s?status\b/.test(msgFixed) ||
    /when (will|does|is)\s.*\b(arrive|come|deliver)/.test(msgFixed) ||
    /\bmy (package|parcel)\b/.test(msgFixed)
  ) {
    return { intent: INTENTS.ORDER_TRACKING, query: msgFixed };
  }

  // ── 7. Order history ────────────────────────────────────────────────────────
  if (
    /\b(my|recent|last|previous)\s(recent\s)?orders?\b/.test(msgFixed) ||
    /order history/.test(msgFixed) ||
    /what (did|have) i (buy|bought|order|ordered)/.test(msgFixed)
  ) {
    return { intent: INTENTS.ORDER_HISTORY, query: msgFixed };
  }

  

  // ── 7.7 Recall — "show me the previous products again", "show them again" ──
  if (
    Array.isArray(context.lastProducts) && context.lastProducts.length > 0 &&
    (
      /\b(previous|earlier)\b.*\b(products?|items?|ones?|results?)\b/.test(msgFixed) ||
      /\bshow\b.*\b(them|those|these|it)\b.*\bagain\b/.test(msgFixed) ||
      /\b(again|go back)\b[\s?.!]*$/.test(msgFixed) && /\bshow\b/.test(msgFixed)
    )
  ) {
    return { intent: INTENTS.SHOW_AGAIN, query: '' };
  }

  // ── 7.5 Trending / popular — grounded in the recommendation engine ─────────
  if (
    hasAnyWord(msgFixed, ['trending', 'popular']) ||
    /best\s?sell(ing|ers?)/.test(msgFixed) ||
    /what'?s (hot|new|good)/.test(msgFixed)
  ) {
    return { intent: INTENTS.TRENDING, query: '' };
  }

  // ── 7.8 Follow-up about products just shown — needs memory to exist ────────
  if (Array.isArray(context.lastProducts) && context.lastProducts.length > 0) {
    for (const p of FOLLOW_UP_PATTERNS) {
      if (p.re.test(msgFixed)) {
        return { intent: INTENTS.FOLLOW_UP, query: msgFixed, followUp: p.kind };
      }
    }
  }

  // ── 7.85 Bare selector referring to the shown list ──────────────────────────
  if (Array.isArray(context.lastProducts) && context.lastProducts.length > 0) {
    const SELECTOR_RE = /^(the\s)?(first|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th)(\sone)?[\s?.!]*$/i;
    if (SELECTOR_RE.test(msgFixed)) {
      return { intent: INTENTS.PRODUCT_QA, query: msgFixed, isSelector: true };
    }
    if (context.pendingQAQuestion && matchesShownProductName(msgFixed, context.lastProducts)) {
      return { intent: INTENTS.PRODUCT_QA, query: msgFixed, isSelector: true };
    }
  }

  // ── 7.87 Cross-product question about the shown list ───────────────────────
  if (Array.isArray(context.lastProducts) && context.lastProducts.length > 1) {
    if (
      (/\bwhich\b/i.test(msgFixed) && QA_STARTERS.test(msgFixed)) ||
      /\b(do|does)\s+(any|one)(\s+of\s+(these|them|those))?\s+(has|have|come|comes|support|supports)\b/i.test(msgFixed) ||
      /\bany\s+of\s+(these|them|those)\b/i.test(msgFixed)
    ) {
      return { intent: INTENTS.MULTI_QA, query: msgFixed };
    }
  }

  // ── 7.9 Product Q&A about something already shown ──────────────────────────
  if (
    Array.isArray(context.lastProducts) && context.lastProducts.length > 0 &&
    QA_STARTERS.test(msgFixed) &&
    (
      QA_PRONOUNS.test(msgFixed) ||
      matchesShownProductName(msgFixed, context.lastProducts) ||
      context.lastIntent === INTENTS.PRODUCT_QA
    )
  ) {
    return { intent: INTENTS.PRODUCT_QA, query: msgFixed };
  }

  // ── 8. Default: product search ─────────────────────────────────────────────
  // Product-word typos are deliberately NOT corrected here — the search engine
  // has its own catalog-aware correction.
  const query = cleanSearchQuery(rawMessage);

  if (!query) return { intent: INTENTS.HELP, query: '' };

  return { intent: INTENTS.PRODUCT_SEARCH, query };
};

module.exports = { INTENTS, detectIntent, cleanSearchQuery };