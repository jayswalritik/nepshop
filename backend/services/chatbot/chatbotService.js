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
const { getActiveOrders, getRecentOrders, toChatOrder, resolveOrderTarget, resolveListTarget, packageAsCard } = require('./orderActions');
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
      // a still-moving single-package order can't be returnable. minutesLeft is
      // READ from returnActions, never recomputed.
      const mightReturn = orderCards.some((c) =>
        c.status === 'delivered' ||
        (Array.isArray(c.packages) && c.packages.some((p) => p.status === 'delivered'))
      );
      if (mightReturn) {
        const returnFacts = await getReturnFacts(user._id);
        const minutesLeftByOrder = {};
        for (const a of returnFacts.eligible) {
          const oid = a.order._id.toString();
          if (!(oid in minutesLeftByOrder) || a.minutesLeft < minutesLeftByOrder[oid]) {
            minutesLeftByOrder[oid] = a.minutesLeft;
          }
        }
        for (const c of orderCards) {
          c.returnMinutesLeft = minutesLeftByOrder[c._id.toString()] ?? null;
        }
      }

      const facts = { activeOrders: active, latestOrder, everOrdered };
      const reply = templates.trackingReply(facts);

      const newContext = {
        ...context,
        lastIntent: INTENTS.ORDER_TRACKING,
        lastOrders: orderCards,
        ...listFields(orderCards),
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
        ...listFields(orders),
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

      // Ordinal/package/shortId reference to what was last shown: "return the
      // first one", "return the second package". A resolved package matches its
      // shipment directly; a single-package order matches its sole shipment.
      if (Array.isArray(context.lastOrders) && context.lastOrders.length > 0) {
        const res = resolveListTarget(query, context);
        const t   = res && res.target;
        if (t) {
          if (res.kind === 'order' && t.status !== 'delivered') {
            return respond(
              intent,
              `Order #${t.shortId} (${t.itemSummary}) ${templates.orderStatusLine(t)} — only delivered orders can be returned.`,
              [], ['Show my recent orders'], context, { orders: [t] }
            );
          }
          // Match the annotated return-fact entry by SHIPMENT id (chatView.shipmentId).
          const shipmentId = res.kind === 'package'
            ? t._id
            : (Array.isArray(t.packages) && t.packages.length === 1 ? t.packages[0]._id : null);
          if (shipmentId) {
            const a = facts.annotated.find((x) => String(x.order.shipmentId) === String(shipmentId));
            if (a) facts.matched = [a]; // route into the specific-package reply path
          }
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
        ...listFields(orderCards),
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
      // Ordinal resolves against the LAST list shown — a multi-package card's
      // packages, else the order list (single-package card degrades to orders).
      const res = resolveListTarget(query, context);

      if (!res) {
        // If the message carried a short-id token (6 hex, optional '#') that
        // resolved to nothing — unknown OR ambiguous — echo it and point at the
        // list-first flow. With NO id token, the original reply fires unchanged.
        const idTok = query.split(/\s+/).find((t) => /^#?[0-9a-f]{6}[?.!,]*$/i.test(t));
        if (idTok) {
          const id = idTok.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
          return respond(intent, templates.orderNotFound(id), [], ['Show my recent orders'], context, { orders });
        }
        return respond(intent, `Which order do you mean? Say "the first one" or "the second one".`, [], [], context, { orders });
      }

      if (res.outOfRange != null) {
        const msg = res.kind === 'package'
          ? `That order has ${res.outOfRange} packages.`
          : `You have only ${res.outOfRange} recent orders.`;
        return respond(intent, msg, [], ['Show my recent orders'], context, { orders: [] });
      }

      // A resolved PACKAGE renders on the EXISTING single-package card. The user
      // has DRILLED INTO a multi-package order, so bare ordinals keep counting
      // THAT ORDER'S packages (lastList stays 'packages') until they leave it —
      // "the first order" is the escape hatch back to the order list. A genuine
      // one-package order never reaches here (it has no package list to drill).
      if (res.kind === 'package') {
        const parent    = context.lastPackageOrder || {};
        const pkg       = res.target;
        const predicate = templates.orderStatusLine(pkg, true);
        const reply = `Package ${pkg.index} (${pkg.sellerName}) of order #${parent.shortId} ${predicate}${predicate.endsWith('.') ? '' : '.'}`;
        const newContext = { ...context, lastIntent: INTENTS.ORDER_FOLLOW_UP, lastList: 'packages' };
        return respond(intent, reply, [], ['Show my recent orders'], newContext, { orders: [packageAsCard(parent, pkg)] });
      }

      // A resolved ORDER — ORDER_FOLLOW_UP opts INTO grouped clauses so a mixed-
      // status order can't hide a returned package behind one derived status.
      // Grouped predicates carry internal periods and never end with one; append
      // the closing period only when the predicate doesn't already, avoiding "..".
      const target = res.target;
      const predicate = templates.orderStatusLine(target, true);
      const reply = `Your order #${target.shortId} (${target.itemSummary}, ${templates.formatRs(target.total)}) ${predicate}${predicate.endsWith('.') ? '' : '.'}`;

      const newContext = { ...context, lastIntent: INTENTS.ORDER_FOLLOW_UP, ...listFields([target]) };
      return respond(intent, reply, [], ['Show my recent orders'], newContext, { orders: [target] });
    }

    // ── Cancel an order/package — with a MANDATORY confirm step. The cancel
    //    itself happens ONLY through the existing PUT endpoint (client action);
    //    this layer never calls cancelShipment or touches documents. ──────────
    case INTENTS.CANCEL_ORDER: {
      const CANCELLABLE = ['pending', 'confirmed'];

      // ── Confirm turn: a pendingCancel staged last turn awaits a yes/no.
      // pendingCancel is stripped at the respond() chokepoint, so whatever we
      // return here it never survives past this single turn (no leak).
      if (context.pendingCancel) {
        const said = (message || '').trim();
        const YES  = /^(yes|yeah|yep|yup|confirm|do it|go ahead|sure|please do)\b[\s!.]*$/i;
        if (YES.test(said)) {
          return respond(
            intent, templates.cancelInProgressReply(), [], [], context,
            { action: { type: 'cancel_order', shipmentId: context.pendingCancel.shipmentId } }
          );
        }
        const NO = /^(no|nope|nah|don'?t|do not|stop|leave it|keep it|never\s?mind)\b[\s!.]*$/i;
        if (NO.test(said)) {
          return respond(intent, templates.cancelAbortedReply(), [], ['Show my recent orders'], context);
        }
        // Neither yes nor no → abandon the pending cancel silently and handle
        // the message as a brand-new turn. pendingCancel is already gone via the
        // chokepoint, and detection re-runs without it (rule 0 won't re-fire).
        const fresh = { ...context };
        delete fresh.pendingCancel;
        return handleMessage(user, message, fresh, mode);
      }

      // ── A pick answering a cancel ask-step (which-order list / package
      //    picker). pendingCancelPick lives ONE turn (respond() chokepoint); the
      //    router only routes here when the message is a genuine pick. ─────────
      let res;
      if (context.pendingCancelPick) {
        const pick = context.pendingCancelPick;

        if (pick.kind === 'package') {
          // The packages actually offered, in the order shown (by shipmentIds).
          const offered = (pick.shipmentIds || [])
            .map((id) => (context.lastPackages || []).find((p) => String(p._id) === String(id)))
            .filter(Boolean);
          const parent = context.lastPackageOrder || {};

          // Ordinal by position among the offered packages (reuse resolveListTarget's
          // package path). Out of range → the existing copy, verbatim.
          const r = resolveListTarget(query, { lastList: 'packages', lastPackages: offered, lastPackageOrder: parent, lastOrders: context.lastOrders });
          if (r && r.outOfRange != null) {
            // N counts only the CANCELLABLE packages (the list the pick indexes
            // into), so say so — the customer may see more packages than N.
            return respond(intent, `That order has ${r.outOfRange} package${r.outOfRange === 1 ? '' : 's'} that can still be cancelled.`, [], ['Show my recent orders'], context, { orders: [] });
          }
          let pkg = r && r.kind === 'package' ? r.target : null;
          // No ordinal → shop-name match among the offered packages.
          if (!pkg) {
            const hits = offered.filter((p) => shopMatches(query, p.sellerName));
            if (hits.length === 1) pkg = hits[0]; // exactly one → resolve; else ambiguous
          }
          if (pkg) {
            // Resolved → straight to the CONFIRM step (mandatory), same staging
            // as the existing single-cancellable path.
            return respond(
              intent, templates.cancelConfirmReply(pkg.sellerName, pkg.payable), [], ['Show my recent orders'], context,
              { orders: [packageAsCard(parent, pkg)], pendingCancel: { shipmentId: pkg._id, orderId: parent._id } }
            );
          }
          // Ambiguous (shared shop name) or no match → re-ask, never guess, and
          // re-stage the pick for one more turn.
          return respond(intent, templates.cancelRepickReply(parent, offered), [], ['Show my recent orders'], context, { orders: [parent], pendingCancelPick: pick });
        }

        // kind 'order' → resolve the ordinal against the listed orders, then fall
        // THROUGH to the existing order-resolved logic below (no duplication).
        const r = resolveListTarget(query, { lastList: 'orders', lastOrders: context.lastOrders || [], lastPackages: [], lastPackageOrder: null });
        if (r && r.outOfRange != null) {
          return respond(intent, `You have only ${r.outOfRange} recent orders.`, [], ['Show my recent orders'], context, { orders: [] });
        }
        if (!r || r.kind !== 'order') {
          return respond(intent, templates.cancelWhichOrderReply(), [], ['Show my recent orders'], context, { orders: context.lastOrders || [], pendingCancelPick: pick });
        }
        res = r;
      } else {
        // ── Fresh cancel request: which order/package do they mean? ──────────
        res = resolveListTarget(query, context);
      }

      // No order identified (or an out-of-range ordinal) → show the recent-orders
      // list and ask which, the same path ORDER_HISTORY uses. Stage the pick so
      // the user's next reply routes back into cancel (one turn only).
      if (!res || res.outOfRange != null) {
        const fetched    = await getRecentOrders(user._id, 6);
        const orders     = fetched.slice(0, 5).map(toChatOrder);
        const newContext = { ...context, lastIntent: INTENTS.CANCEL_ORDER, lastOrders: orders, ...listFields(orders) };
        return respond(
          intent,
          orders.length ? templates.cancelWhichOrderReply() : templates.cancelNoOrdersReply(),
          [],
          orders.length ? ['Show my recent orders'] : ['Show trending products'],
          newContext,
          orders.length ? { orders, pendingCancelPick: { kind: 'order' } } : { orders }
        );
      }

      // Explicit package reference ("cancel the second package") → skip the
      // picker, go straight to confirm (or an honest block if not cancellable).
      if (res.kind === 'package') {
        const pkg    = res.target;
        const parent = context.lastPackageOrder || {};
        if (!CANCELLABLE.includes(pkg.status)) {
          return respond(intent, templates.cancelBlockedReply(parent, [pkg]), [], ['Show my recent orders'], context, { orders: [packageAsCard(parent, pkg)] });
        }
        return respond(
          intent, templates.cancelConfirmReply(pkg.sellerName, pkg.payable), [], ['Show my recent orders'], context,
          { orders: [packageAsCard(parent, pkg)], pendingCancel: { shipmentId: pkg._id, orderId: parent._id } }
        );
      }

      // A whole order was named — inspect its packages by real per-package status.
      const order       = res.target;
      const pkgs        = Array.isArray(order.packages) ? order.packages : [];
      const cancellable = pkgs.filter((p) => CANCELLABLE.includes(p.status));

      // Nothing cancellable → one honest sentence per package, chosen by state.
      if (cancellable.length === 0) {
        return respond(intent, templates.cancelBlockedReply(order, pkgs), [], ['Show my recent orders'], context, { orders: [order] });
      }

      // Exactly one cancellable package (single-package order OR only one still
      // eligible) → straight to confirm, no guess.
      if (cancellable.length === 1) {
        const pkg = cancellable[0];
        return respond(
          intent, templates.cancelConfirmReply(pkg.sellerName, pkg.payable), [], ['Show my recent orders'], context,
          { orders: [order], pendingCancel: { shipmentId: pkg._id, orderId: order._id } }
        );
      }

      // 2+ still cancellable → picker, never auto-pick. lastPackages carries the
      // FULL package list so a follow-up ordinal lines up with the shown index;
      // shipmentIds records exactly which packages were offered, in order.
      const newContext = { ...context, lastIntent: INTENTS.CANCEL_ORDER, lastOrders: [order], ...listFields([order]) };
      return respond(
        intent, templates.cancelPickerReply(order, cancellable), [], ['Show my recent orders'], newContext,
        { orders: [order], pendingCancelPick: { kind: 'package', orderId: order._id, shipmentIds: cancellable.map((p) => String(p._id)) } }
      );
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
// What ordinals should address AFTER this reply renders `rendered` (order cards).
// A lone MULTI-package card makes its packages the addressable list; a real list
// OR a single-package card makes orders the list (and clears any package list).
const listFields = (rendered) => {
  const only = rendered.length === 1 ? rendered[0] : null;
  if (only && Array.isArray(only.packages) && only.packages.length > 1) {
    return { lastList: 'packages', lastPackages: only.packages, lastPackageOrder: only };
  }
  return { lastList: 'orders', lastPackages: [], lastPackageOrder: null };
};

// Case-insensitive, whitespace-tolerant shop-name match — mirrors the router's
// pick detector (intentRouter.shopNameMatch) so a shop reply the router accepts
// as a pick resolves to the same package here. Substring either direction.
const normShop = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const shopMatches = (msg, shopName) => {
  const m = normShop(msg);
  const n = normShop(shopName);
  return n.length > 0 && (m.includes(n) || (m.length >= 3 && n.includes(m)));
};

// Uniform response shape + the SINGLE pendingCancel clearing chokepoint.
// pendingCancel must survive EXACTLY ONE turn: any value arriving on the inbound
// context is always stripped here, and it is re-staged on the outgoing context
// ONLY when THIS turn explicitly passes `pendingCancel` in `extra` (the confirm
// ask). Because clearing lives here and nowhere else, no downstream handler can
// leak it — the defect pendingCartAdd has, deliberately not copied.
const respond = (intent, reply, products, suggestions, context, extra = {}) => {
  const { pendingCancel, pendingCancelPick, ...rest } = extra;
  const cleaned = { ...(context || {}) };
  // BOTH one-turn cancel keys travel through this single mechanism: always
  // stripped from the inbound context, and re-staged ONLY when THIS turn passes
  // them in `extra` (the confirm ask stages pendingCancel; the two cancel
  // ask-steps stage pendingCancelPick). No per-branch clearing, so neither can
  // leak past its single turn — the defect pendingCartAdd has, not copied.
  delete cleaned.pendingCancel;
  delete cleaned.pendingCancelPick;
  const outContext = cleaned;
  if (pendingCancel)     outContext.pendingCancel = pendingCancel;
  if (pendingCancelPick) outContext.pendingCancelPick = pendingCancelPick;
  return {
    intent,
    reply,
    products,
    suggestions,
    context: outContext,
    ...rest,
  };
};

module.exports = { handleMessage };