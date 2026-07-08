/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Chatbot LLM Router  (backend/services/chatbot/llmRouter.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * EXPERIMENTAL "conversational mode" router: uses the LLM to classify a
 * message into the SAME intent set the rule router uses, and to extract the
 * same reference fields. The action layer, grounding, templates, and context
 * system are IDENTICAL in both modes — only the classification step differs.
 *
 * Safety-by-construction:
 *   • Output is validated against the known intent set; anything malformed,
 *     unknown, or timed out returns null → caller falls back to the rule
 *     router. Conversational mode can be slower but never broken.
 *   • Deterministic parameter validation: the LLM proposes parameters
 *     (followUp, isSelector, statusFilter), but the user's OWN WORDS must
 *     confirm them — kills the observed "right intent, hallucinated params"
 *     failure mode.
 *   • The LLM never touches facts here either — it only names an intent and
 *     extracts a reference from the user's own words.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { INTENTS } = require('./intentRouter');
const { generate } = require('./ollamaService');

const VALID_INTENTS = new Set(Object.values(INTENTS));

const ROUTER_SYSTEM_PROMPT =
  `You classify a customer's message in a shopping chat into exactly one intent. ` +
  `Reply with ONLY a JSON object, no other text, no markdown.\n\n` +
  `Intents:\n` +
  `- product_search: wants to find/browse products. Set "query" to the clearest common product words — ` +
  `expand abbreviations, acronyms, and colloquial terms into what they most likely mean ` +
  `(e.g. "pc" -> "computer laptop", "tv" -> "television", "kicks" -> "shoes sneakers"), ` +
  `keeping any budget/color/brand words from the original message (e.g. "gaming laptop under 200000").\n` +
  `- trending: asks what's popular/trending/best-selling.\n` +
  `- product_qa: question about ONE specific product already shown (uses "it", a name, or an ordinal like "the second one").\n` +
  `- multi_qa: question ACROSS the shown products ("which of these has X?").\n` +
  `- follow_up: asks which shown product is cheapest/most expensive/best rated. Set "followUp".\n` +
  `- add_to_cart: wants to add something to the cart.\n` +
  `- view_cart: asks what's in their cart.\n` +
  `- order_tracking: where is my order / delivery status (general).\n` +
  `- order_history: show my orders / what did I buy.\n` +
  `- order_follow_up: question about ONE of the orders just listed (ordinal or status word). Set "statusFilter" if they ask by status (e.g. "which is delivered?").\n` +
  `- return_refund: wants to return something or asks about refunds.\n` +
  `- show_again: asks to re-show the previous product list.\n` +
  `- help: asks what you can do.\n` +
  `- greeting / thanks / goodbye: small talk.\n\n` +
  `JSON format (omit fields that don't apply):\n` +
  `{"intent":"...", "query":"...", "followUp":"cheapest|expensive|best_rated", ` +
  `"isSelector":true, "statusFilter":"delivered"}\n\n` +
  `Rules: "isSelector":true only when the message is JUST a pick like "the third one" ` +
  `answering a previous question. Prefer product_qa/multi_qa/follow_up ONLY when ` +
  `products are shown; prefer order_follow_up ONLY when orders are shown.`;

const buildContextSummary = (context = {}) => {
  const parts = [];
  if (Array.isArray(context.lastProducts) && context.lastProducts.length) {
    parts.push(`Products currently shown: ${context.lastProducts.map((p, i) => `${i + 1}. ${p.name}`).join('; ')}`);
  }
  if (Array.isArray(context.lastOrders) && context.lastOrders.length) {
    parts.push(`Orders currently shown: ${context.lastOrders.map((o, i) => `${i + 1}. #${o.shortId} (${o.status})`).join('; ')}`);
  }
  if (context.qaFocus) parts.push(`Product in focus: ${context.qaFocus.name}`);
  if (context.lastIntent) parts.push(`Previous intent: ${context.lastIntent}`);
  if (context.pendingQAQuestion) parts.push(`Awaiting: which product their question "${context.pendingQAQuestion}" is about`);
  if (context.pendingCartAdd) parts.push(`Awaiting: which product to add to cart`);
  return parts.length ? parts.join('\n') : 'No products or orders shown yet.';
};

// llmDetectIntent → { intent, query, followUp, isSelector, statusFilter } or null
const llmDetectIntent = async (message, context = {}) => {
  const userPrompt =
    `CONTEXT:\n${buildContextSummary(context)}\n\n` +
    `CUSTOMER MESSAGE: ${message}`;

  const raw = await generate(ROUTER_SYSTEM_PROMPT, userPrompt);
  if (!raw) {
    console.warn('[router:llm] no LLM output at all (Groq and Ollama both null)');
    return null;
  }


  try {
    // Tolerate stray text/fences around the JSON
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[router:llm] rejected (no JSON in output):', raw.slice(0, 160));
      return null;
    }
    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.intent || !VALID_INTENTS.has(parsed.intent)) {
      console.warn('[router:llm] rejected (unknown intent):', JSON.stringify(parsed).slice(0, 160));
      return null;
    }

    const msgLower = message.toLowerCase();

    // ── Deterministic parameter validation ──────────────────────────────────
    // The LLM proposes parameters; the user's OWN WORDS must confirm them.

    // statusFilter only if the message actually contains that status word
    let statusFilter;
    if (typeof parsed.statusFilter === 'string') {
      const sf = parsed.statusFilter.toLowerCase();
      const sfPattern = sf === 'dispatched' ? /(dispatched|out\s?for\s?delivery|on\s?the\s?way)/ : new RegExp(`\\b${sf}\\b`);
      if (sfPattern.test(msgLower)) statusFilter = sf;
    }

    // isSelector only if the message really is a bare pick
    const isSelector =
      parsed.isSelector === true &&
      /^(the\s)?(first|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th)(\sone)?[\s?.!]*$/i.test(msgLower);

    // followUp only if the corresponding words are present; else derive; else reject
    let followUp;
    const FOLLOW_WORDS = {
      cheapest:   /(cheap|lowest|least\s?expensive)/,
      expensive:  /(expensive|priciest|highest\s?price)/,
      best_rated: /(rated|rating|best)/,
    };
    if (FOLLOW_WORDS[parsed.followUp]?.test(msgLower)) {
      followUp = parsed.followUp;
    } else {
      for (const [kind, re] of Object.entries(FOLLOW_WORDS)) {
        if (re.test(msgLower)) { followUp = kind; break; }
      }
    }
    if (parsed.intent === 'follow_up' && !followUp) {
      console.warn('[router:llm] rejected (follow_up without confirmable kind):', JSON.stringify(parsed).slice(0, 160));
      return null;
    }

    // order_follow_up needs an ordinal, "that one", or a status word in the message
    if (parsed.intent === 'order_follow_up') {
      const hasOrdinal = /\b((the\s)?(first|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th)|(that|this)\s?one)\b/i.test(msgLower);
      if (!hasOrdinal && !statusFilter) {
        console.warn('[router:llm] rejected (order_follow_up without ordinal/status):', JSON.stringify(parsed).slice(0, 160));
        return null;
      }
    }

    return {
      intent:       parsed.intent,
      query:        (parsed.query || message).toString().toLowerCase().trim(),
      followUp,
      isSelector,
      statusFilter,
    };
  } catch (err) {
    console.warn('[router:llm] unparseable output → rule fallback:', raw.slice(0, 120));
    return null;
  }
};

module.exports = { llmDetectIntent };