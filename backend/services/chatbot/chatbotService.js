/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Chatbot Service  (backend/services/chatbot/chatbotService.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * The orchestrator: message → intent router → grounded action → template.
 *
 * Layer 2 (grounding) lives here: every fact in a reply comes from a REAL
 * backend call. Slice one grounds exactly one intent — product search — by
 * calling searchProducts() from the existing search adapter DIRECTLY as a
 * function (not over HTTP to /api/search): same grounding, no self-HTTP
 * overhead, and we get the full result object (intent, budget, rescue) to
 * phrase from.
 *
 * Contract with the controller:
 *   handleMessage(user, message, context) → {
 *     intent       string    — what the router decided
 *     reply        string    — the sentence to display
 *     products     array     — product cards to render (may be empty)
 *     suggestions  array     — tappable next-step chips (feature 9)
 *     context      object    — updated conversation state, echoed back by the
 *                              client on its next message (feature 7 memory)
 *   }
 *
 * The server is STATELESS — context lives on the client and round-trips with
 * each message, so Render cold starts / restarts never lose a conversation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { INTENTS, detectIntent } = require('./intentRouter');
const templates                 = require('./templates');
const { searchProducts }        = require('../nepShopSearchAdapter');
const { getTrending }           = require('../nepShopAdapter');
const { getActiveOrders, getRecentOrders, toChatOrder, resolveOrderTarget } = require('./orderActions');
const { getReturnFacts } = require('./returnActions');
const { resolveTarget, extractTopicKeywords, answerFromDescription, fetchProductForQA, fetchProductsForQA, resolveCartTarget } = require('./productQA');
const { answerProductQuestion, answerMultiProductQuestion } = require('./ollamaService');
const { getCartContents } = require('./cartActions');

const { llmDetectIntent } = require('./llmRouter');


// Chat shows fewer results than the search page — it's a conversation, not a grid.
const CHAT_SEARCH_LIMIT = 5;

// Strip cart phrasing to get the item text: "add nike shoes to my cart" → "nike shoes"
// Strip cart phrasing AND selector/superlative words to get the NAMED item
// text: "add nike shoes to my cart" → "nike shoes"; "add the cheapest" → "".
const cleanCartItemText = (msg) =>
  msg.toLowerCase()
    .replace(/\b(please|add|put|to|into|in|my|the|a|an|cart|basket|it|this|that|one|ones|all|both|everything|of|them|these|those|first|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th|cheapest|expensive|priciest|best|top|highest|lowest|most|least|rated|priced|price)\b/gi, ' ')
    .replace(/[?!.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
// Strip heavy/irrelevant fields before sending products into a chat bubble.
const toChatProduct = (p) => ({
  _id:        p._id,
  name:       p.name,
  price:      p.price,
  discount:   p.discount || 0,
  finalPrice: templates.effectivePrice(p),
  category:   p.category,
  rating:     p.rating || 0,
  image:      Array.isArray(p.images) && p.images.length
                ? (p.images[0].url || p.images[0])   // {url, publicId} object, or plain string fallback
                : null,
  stock:      p.stock,
});

// ─────────────────────────────────────────────────────────────────────────────
// handleMessage
// ─────────────────────────────────────────────────────────────────────────────
const handleMessage = async (user, message, context = {}, mode = 'fast') => {
  // ── Routing: rules (fast) or LLM (conversational), same downstream either way.
  // LLM routing falls back to rules on any failure — conversational mode can
  // be slower but never broken. Timing logged for the mode-comparison report.
  let detection = null;
  if (mode === 'conversational') {
    const t0 = Date.now();
    detection = await llmDetectIntent(message, context);
    console.log(`[router:llm] ${Date.now() - t0}ms → ${detection ? detection.intent : 'FALLBACK to rules'}`);
  }
  if (!detection) {
    const t0 = Date.now();
    detection = detectIntent(message, context);
    console.log(`[router:rules] ${Date.now() - t0}ms → ${detection.intent}`);
  }
  const { intent, query, followUp, isSelector, statusFilter } = detection;
  const firstName = user?.firstName || '';

  switch (intent) {
    // ── Small talk (no data needed) ─────────────────────────────────────────
    case INTENTS.GREETING:
      return respond(intent, templates.greetingReply(firstName), [], ['Show trending products', 'Help'], context);

    case INTENTS.THANKS:
      return respond(intent, templates.thanksReply(), [], [], context);

    case INTENTS.GOODBYE:
      return respond(intent, templates.goodbyeReply(firstName), [], [], context);

    case INTENTS.HELP:
      return respond(intent, templates.helpReply(), [], ['Show trending products'], context);

        // ── Order tracking — GROUNDED in real Order documents ───────────────────
    case INTENTS.ORDER_TRACKING: {
      const active = (await getActiveOrders(user._id)).map(toChatOrder);

      let latestOrder = null;
      let everOrdered = active.length > 0;
      if (active.length === 0) {
        const recent = await getRecentOrders(user._id, 1);
        everOrdered  = recent.length > 0;
        latestOrder  = recent.length ? toChatOrder(recent[0]) : null;
      }

      // Cards: active orders, or the latest finished one as context
      const orderCards = active.length ? active : (latestOrder ? [latestOrder] : []);

      // Return-window urgency — surfaced for ANY shown order that has a
      // delivered package still inside its window (single- or multi-package).
      // Only worth the query when a shown card actually has a delivered package;
      // a still-moving single-package order can't be returnable. daysLeft is
      // READ from returnActions, never recomputed.
      const mightReturn = orderCards.some((c) =>
        c.status === 'delivered' ||
        (Array.isArray(c.packages) && c.packages.some((p) => p.status === 'delivered'))
      );
      if (mightReturn) {
        const returnFacts = await getReturnFacts(user._id);
        const daysLeftByOrder = {};
        for (const a of returnFacts.eligible) {
          const oid = a.order._id.toString();
          if (!(oid in daysLeftByOrder) || a.daysLeft < daysLeftByOrder[oid]) {
            daysLeftByOrder[oid] = a.daysLeft;
          }
        }
        for (const c of orderCards) {
          c.returnDaysLeft = daysLeftByOrder[c._id.toString()] ?? null;
        }
      }

      const facts = { activeOrders: active, latestOrder, everOrdered };
      const reply = templates.trackingReply(facts);

      const newContext = {
        ...context,
        lastIntent: INTENTS.ORDER_TRACKING,
        lastOrders: orderCards,
      };

      const suggestions = everOrdered
        ? ['Show my recent orders']
        : ['Show trending products'];

      return respond(intent, reply, [], suggestions, newContext, { orders: orderCards });
    }

    // ── Order history — GROUNDED in real Order documents ────────────────────
    case INTENTS.ORDER_HISTORY: {
      // Fetch one extra to detect truncation (TASK 6) without a count query —
      // show 5, offer the full Orders page via the existing handoff when more
      // exist.
      const fetched   = await getRecentOrders(user._id, 6);
      const truncated = fetched.length > 5;
      const orders    = fetched.slice(0, 5).map(toChatOrder);
      const reply     = templates.historyReply(orders);

      const newContext = {
        ...context,
        lastIntent: INTENTS.ORDER_HISTORY,
        lastOrders: orders,
      };

      const suggestions = orders.length
        ? ['Where is my order?']
        : ['Show trending products'];

      return respond(intent, reply, [], suggestions, newContext, {
        orders,
        handoff: truncated ? 'orders' : null,
      });
    }

    // ── Return/refund — GROUNDED in real orders + the REAL return rules ─────
    case INTENTS.RETURN_REFUND: {
      const facts = await getReturnFacts(user._id, query);

      // Ordinal reference to the shown ORDER list: "return the first one"
      if (Array.isArray(context.lastOrders) && context.lastOrders.length > 0) {
        const ordTarget = resolveOrderTarget(query, context.lastOrders);
        if (ordTarget) {
          if (ordTarget.status !== 'delivered') {
            return respond(
              intent,
              `Order #${ordTarget.shortId} (${ordTarget.itemSummary}) ${templates.orderStatusLine(ordTarget)} — only delivered orders can be returned.`,
              [], ['Show my recent orders'], context, { orders: [ordTarget] }
            );
          }
          const a = facts.annotated.find((x) => x.order._id.toString() === ordTarget._id.toString());
          if (a) facts.matched = [a]; // route into the specific-order reply path
        }
      }

      // Which orders to show as cards
      let cardsSource;
      if (facts.matched.length === 1)              cardsSource = [facts.matched[0].order];
      else if (facts.inProgress.length > 0
               && facts.eligible.length === 0)     cardsSource = facts.inProgress;
      else if (facts.eligible.length > 0)          cardsSource = facts.eligible.map((a) => a.order);
      else                                         cardsSource = [];

      const orderCards = cardsSource.map(toChatOrder);
      const reply      = templates.returnReply(facts, orderCards);

      // Handoff button only when there's actually something to submit
      const canSubmit =
        (facts.matched.length === 1 && facts.matched[0].eligible) ||
        (facts.matched.length !== 1 && facts.eligible.length > 0);

      const newContext = {
        ...context,
        lastIntent: INTENTS.RETURN_REFUND,
        lastOrders: orderCards,
      };

      return respond(intent, reply, [], ['Where is my order?'], newContext, {
        orders:  orderCards,
        handoff: canSubmit ? 'orders' : null,
      });
    }


    // ── Ordinal follow-up on listed orders — "when will the second one
    //    arrive?" (feature 4's example). Answers from conversation memory. ────
    case INTENTS.ORDER_FOLLOW_UP: {
      const orders = context.lastOrders || [];
      // Status question: filter the shown orders by real PACKAGE status, so a
      // delivered package inside a still-moving order is found (TASK 5). Spelling
      // normalisation unchanged.
      if (statusFilter) {
        const norm   = statusFilter.replace(/\s+/g, ' ');
        const wanted = (norm === 'out for delivery' || norm === 'on the way') ? 'dispatched'
                     : norm === 'canceled' ? 'cancelled'
                     : norm;
        const label   = wanted === 'dispatched' ? 'out for delivery' : wanted;

        // An order matches if ANY of its packages is in `wanted` (falling back
        // to the order's own status for orders with no shipments attached).
        const orderHasStatus = (o) =>
          Array.isArray(o.packages) && o.packages.length
            ? o.packages.some((p) => p.status === wanted)
            : o.status === wanted;
        const matches = orders.filter(orderHasStatus);

        if (!matches.length) {
          return respond(intent, `None of the packages in the orders I showed you are ${label} right now.`, [], ['Show my recent orders'], context, { orders: [] });
        }
        const reply = templates.statusFilterReply(matches, wanted, label);
        return respond(intent, reply, [], ['Show my recent orders'], context, { orders: matches });
      }
      const target = resolveOrderTarget(query, orders);

      if (!target) {
        return respond(intent, `Which order do you mean? Say "the first one" or "the second one".`, [], [], context, { orders });
      }

      const reply = `Your order #${target.shortId} (${target.itemSummary}, ${templates.formatRs(target.total)}) ${templates.orderStatusLine(target)}.`;

      return respond(intent, reply, [], ['Show my recent orders'], context, { orders: [target] });
    }

    // ── Trending — GROUNDED in the real recommendation engine ───────────────
    case INTENTS.TRENDING: {
      const trending = await getTrending({ limit: CHAT_SEARCH_LIMIT, windowDays: 30 });
      const cards    = trending.map(toChatProduct);

      const newContext = {
        ...context,
        lastIntent:   INTENTS.TRENDING,
        lastProducts: cards,
        qaFocus: null,
        pendingQAQuestion: null,
      };

      return respond(
        INTENTS.TRENDING,
        templates.trendingReply(cards),
        cards,
        ['Which is the cheapest?', 'Help'],
        newContext
      );
    }

    // ── Follow-up — answered ONLY from conversation memory (feature 7) ──────
    case INTENTS.FOLLOW_UP: {
      const items = context.lastProducts || [];
      if (!items.length) {
        // Router gates on this, but stay defensive against stale clients.
        return respond(intent, templates.helpReply(), [], ['Show trending products'], context);
      }

      let chosen;
      if (followUp === 'cheapest') {
        chosen = items.reduce((a, b) => (b.finalPrice < a.finalPrice ? b : a));
      } else if (followUp === 'expensive') {
        chosen = items.reduce((a, b) => (b.finalPrice > a.finalPrice ? b : a));
      } else {
        chosen = items.reduce((a, b) => ((b.rating || 0) > (a.rating || 0) ? b : a));
      }

      const reply = templates.followUpReply(followUp, chosen, items.length);

      // Keep lastProducts as the FULL list (not just the chosen one) so the
      // user can ask "and the most expensive?" against the same set.
      const nextChip =
        followUp === 'cheapest' ? 'Which is the best rated?' : 'Which is the cheapest?';

      return respond(intent, reply, [chosen], [nextChip], context);
    }

    // ── Product Q&A — quotes the REAL description, or honestly says it's
    //    not mentioned (features 6 + 11). Tracks a FOCUS product so follow-up
    //    questions don't need to re-specify which one. ────────────────────────
    case INTENTS.PRODUCT_QA: {
      const items = context.lastProducts || [];

      // Explicit ordinal/name wins; otherwise fall back to the product already
      // in focus from the previous QA turn.
      const target = resolveTarget(query, items) || context.qaFocus || null;

      if (!target) {
        const askContext = { ...context, pendingQAQuestion: query };
        return respond(intent, templates.qaWhichOne(items.map((p) => p.name)), [], [], askContext);
      }

      const product = await fetchProductForQA(target._id);
      if (!product) {
        return respond(intent, `Hmm — that product isn't available anymore.`, [], ['Show trending products'], context);
      }

      const card = toChatProduct(product);

      // Bare selector with NO pending question → "show me that one":
      // present the product, set focus, invite a question.
      if (isSelector && !context.pendingQAQuestion) {
        const newContext = { ...context, lastIntent: INTENTS.PRODUCT_QA, qaFocus: card, pendingQAQuestion: null };
        return respond(intent, templates.qaDetailReply(product), [card], [], newContext);
      }

      // The question: this message, or the remembered one if this message is
      // just a selector answering "which one?"
      const questionText = (isSelector && context.pendingQAQuestion)
        ? context.pendingQAQuestion
        : query;

      // Strip list-position words ("the fourth one" → "it") BEFORE any answer
      // generation — both the LLM and the semantic pass trip over position
      // words that mean nothing outside the chat UI.
      const cleanQuestion = questionText.replace(
        /\b(the\s)?(first|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th)(\sone)?\b/gi,
        'it'
      );

      // ── Layer 3: LLM answers from the FULL product document (local only).
      // Falls back to extraction + templates when Ollama is off/unavailable —
      // which is also the permanent behavior on Render.
      let reply = await answerProductQuestion(product, cleanQuestion);

      if (!reply) {
        const keywords  = extractTopicKeywords(cleanQuestion, product.name);
        const sentences = await answerFromDescription(product.description, keywords, cleanQuestion);
        reply = sentences.length
          ? templates.qaReply(product.name, sentences)
          : templates.qaMissReply(product.name, keywords);
      }

      // Answered about THIS product → it becomes the focus; pending cleared.
      const newContext = { ...context, lastIntent: INTENTS.PRODUCT_QA, qaFocus: card, pendingQAQuestion: null };

      return respond(intent, reply, [card], [], newContext);
    }

    // ── Multi-product Q&A — extraction-first: the LLM only ever sees listing
    //    sentences that MATCHED the question, so it structurally cannot claim
    //    a feature for a product whose listing doesn't support it. ────────────
    case INTENTS.MULTI_QA: {
      const items    = context.lastProducts || [];
      const products = await fetchProductsForQA(items.map((p) => p._id));

      if (!products.length) {
        return respond(intent, templates.helpReply(), [], ['Show trending products'], context);
      }

      // Per-product extraction — same literal+semantic pass as single QA
      const keywords = extractTopicKeywords(query, '');
      const matches  = [];
      for (const p of products) {
        const sentences = await answerFromDescription(p.description, keywords, query);
        if (sentences.length) matches.push({ product: p, sentences });
      }

      const topic = keywords.join(' ');

      // Nothing matched anywhere → honest miss, no LLM involved at all
      if (!matches.length) {
        const newContext = { ...context, lastIntent: INTENTS.MULTI_QA, pendingQAQuestion: null };
        return respond(intent, templates.multiQaMissReply(topic, products.length), [], [], newContext);
      }

      // LLM phrases ONLY the matched excerpts; template fallback lists them
      let reply = await answerMultiProductQuestion(
        matches.map((m) => ({ name: m.product.name, sentences: m.sentences })),
        query,
        products.length
      );
      if (!reply) {
        reply = templates.multiQaReply(matches.map((m) => m.product.name), topic, products.length);
      }

      const cards = matches.map((m) => toChatProduct(m.product));
      const newContext = { ...context, lastIntent: INTENTS.MULTI_QA, pendingQAQuestion: null };
      return respond(intent, reply, cards, [], newContext);
    }

    // ── Add to cart — backend RESOLVES the product; the WIDGET performs the
    //    add through the existing CartContext. Confirmation only after the
    //    add actually succeeds. ────────────────────────────────────────────────
    case INTENTS.ADD_TO_CART: {
      const items    = context.lastProducts || [];
      const itemText = cleanCartItemText(query);

      // "add all of them" → multi-add directive
      if (/\b(all|both|everything)\b/i.test(query) && items.length > 0) {
        const inStock = items.filter((p) => p.stock > 0);
        if (!inStock.length) {
          return respond(intent, `I'm sorry — none of those are in stock right now.`, [], ['Show trending products'], context);
        }
        const newContext = { ...context, lastIntent: INTENTS.ADD_TO_CART, pendingCartAdd: false };
        return respond(
          intent,
          `Done — added ${inStock.length === items.length ? `all ${inStock.length}` : `the ${inStock.length} in-stock ones`} to your cart ✓`,
          [], ['Show trending products'], newContext,
          { action: { type: 'add_to_cart_all', productIds: inStock.map((p) => p._id) } }
        );
      }

      let target = resolveCartTarget(query, items, context.qaFocus || null);

      // GUARD (bug fix): the focus/only-one-shown fallback must never override
      // an explicitly NAMED item. If the user named something and the resolved
      // target's name doesn't contain any named token, drop the target and
      // search the named item instead.
      if (target && itemText) {
        const tokens  = itemText.split(' ').filter((t) => t.length >= 3);
        const nameHit = tokens.some((t) => target.name.toLowerCase().includes(t));
        if (tokens.length && !nameHit) target = null;
      }

      // No target → search the named item (regardless of what's on screen)
      if (!target) {
        if (itemText) {
          const result = await searchProducts(itemText, { limit: CHAT_SEARCH_LIMIT });
          const cards  = (result.results || []).slice(0, CHAT_SEARCH_LIMIT).map(toChatProduct);
          if (cards.length) {
            const newContext = { ...context, lastIntent: INTENTS.PRODUCT_SEARCH, lastProducts: cards, qaFocus: null, pendingQAQuestion: null, pendingCartAdd: true };
            return respond(intent, templates.cartSearchFirstReply(), cards, [], newContext);
          }
        }
        if (items.length > 0) {
          const askContext = { ...context, pendingCartAdd: true };
          return respond(intent, templates.cartWhichOneReply(), [], [], askContext);
        }
        return respond(intent, templates.helpReply(), [], ['Show trending products'], context);
      }

      // Ground the stock check in the live document
      const product = await fetchProductForQA(target._id);
      if (!product) {
        return respond(intent, `Hmm — that product isn't available anymore.`, [], ['Show trending products'], context);
      }
      if (product.stock <= 0) {
        return respond(intent, templates.cartOutOfStockReply(product.name), [toChatProduct(product)], [], context);
      }

      const card = toChatProduct(product);
      const newContext = { ...context, lastIntent: INTENTS.ADD_TO_CART, qaFocus: card, pendingCartAdd: false };

      return respond(
        intent,
        templates.cartAddedReply(product.name, card.finalPrice),
        [],
        ['Show trending products'],
        newContext,
        { action: { type: 'add_to_cart', productId: card._id, productName: product.name } }
      );
    }

    // ── Product search — GROUNDED in the real BGE semantic search ───────────
    case INTENTS.PRODUCT_SEARCH:
    default: { 
      const result = await searchProducts(query, { limit: CHAT_SEARCH_LIMIT });

      const facts = {
        query,
        products:     result.results || [],
        totalFound:   result.totalFound || 0,
        intent:       result.intent,
        isZeroResult: result.isZeroResult,
        rescue:       result.zeroResultRescue || [],
      };

      const reply       = templates.searchReply(facts);
      const suggestions = templates.searchSuggestions(facts);

      // Zero results → show the rescue products as the cards instead
      const cards = (facts.isZeroResult ? facts.rescue : facts.products)
        .slice(0, CHAT_SEARCH_LIMIT)
        .map(toChatProduct);

      // Conversation memory (feature 7): remember what we just showed so
      // follow-ups like "the cheaper one" can resolve in later slices.
      const newContext = {
        ...context,
        lastIntent:   INTENTS.PRODUCT_SEARCH,
        lastQuery:    query,
        lastProducts: cards,
        qaFocus: null,
        pendingQAQuestion: null,
      };

      return respond(INTENTS.PRODUCT_SEARCH, reply, cards, suggestions, newContext);
    }

    // ── Recall — re-show the products from conversation memory ──────────────
    case INTENTS.SHOW_AGAIN: {
      const items = context.lastProducts || [];
      return respond(intent, `Sure — here's that list again:`, items, [], context);
    }

    // ── View cart — GROUNDED in the real cart summary (same builder the cart
    //    page uses); shows ticked / not-ticked / stale blocks. ────────────────
    case INTENTS.VIEW_CART: {
      const summary = await getCartContents(user._id);
      const reply   = templates.cartViewReply(summary);
      const hasItems =
        (summary.packages?.length || 0) +
        (summary.notSelectedItems?.length || 0) +
        (summary.staleItems?.length || 0) > 0;
      const suggestions = hasItems ? [] : ['Show trending products'];
      // Reuse the existing handoff mechanism to offer a jump to the cart page.
      return respond(intent, reply, [], suggestions, context, { handoff: hasItems ? 'cart' : null });
    }
  }
};

// Uniform response shape (extra carries intent-specific payloads like orders)
const respond = (intent, reply, products, suggestions, context, extra = {}) => ({
  intent,
  reply,
  products,
  suggestions,
  context,
  ...extra,
});

module.exports = { handleMessage };