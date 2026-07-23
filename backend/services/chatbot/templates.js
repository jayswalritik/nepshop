/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Chatbot Templates  (backend/services/chatbot/templates.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Layer 3 of the chatbot, template edition. Turns STRUCTURED FACTS from the
 * action layer into a human sentence. No data access happens here — templates
 * only phrase what they're given, so they can never invent a fact.
 *
 * When Ollama is added later, it becomes an alternative implementation of this
 * same job (facts in → sentence out) with these templates as the fallback.
 *
 * Small random variation between phrasings keeps repeated demo interactions
 * from sounding robotic — cheap, zero risk.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Shared TIME phrasing — remaining-window ("22 min") and window-length ("5
// minutes") copy, rounded DOWN. Never re-implement duration formatting here.
const { formatRemaining, formatLength } = require('../../utils/returnWindow');

const formatRs = (n) => `Rs ${Number(n).toLocaleString('en-IN')}`;

// Effective price shown in chat = discounted price when a discount exists
// (same rule the search budget filter uses).
const effectivePrice = (p) =>
  p.discount > 0 ? Math.round(p.price * (1 - p.discount / 100)) : p.price;

// ── Small talk ────────────────────────────────────────────────────────────────
const thanksReply = () =>
  pick([
    "You're welcome! Anything else I can help with?",
    'Happy to help! Let me know if you need anything else.',
    'Anytime! 😊',
  ]);

const goodbyeReply = (firstName) =>
  pick([
    `Bye${firstName ? `, ${firstName}` : ''}! Happy shopping 👋`,
    'See you! Come back anytime.',
  ]);

const greetingReply = (firstName) =>
  pick([
    `Hi${firstName ? ` ${firstName}` : ''} 👋 What are you looking for today?`,
    `Hello${firstName ? ` ${firstName}` : ''}! How can I help — find a product, or something else?`,
  ]);

const helpReply = () =>
  'Here\'s what I can do:\n' +
  '• 🔍 Find products — "gaming laptop under 200000", "black shoes"\n' +
  '• ❓ Answer product questions — "does it have a warranty?", "which of these has a graphics card?"\n' +
  '• 📦 Track orders — "where is my order?", "which one is delivered?"\n' +
  '• ↩️ Returns & refunds — "can I return my airpods?"\n' +
  '• 🛒 Cart — "add the cheapest to my cart", "what\'s in my cart?"\n' +
  '• 🔥 "Show trending products"\n\n' +
  'Just ask naturally — I\'ll figure it out!';

// ── Honest stubs for intents whose action layer isn't built yet ──────────────
const comingSoonReply = (what) =>
  `I can't ${what} just yet — that's coming very soon! For now, I can help you find products. Try something like "wireless earbuds under 5000".`;

// ── Product search ────────────────────────────────────────────────────────────
// facts: { query, products, totalFound, intent (search intent), isZeroResult, rescue }
const searchReply = (facts) => {
  const { products, totalFound, intent, isZeroResult, rescue } = facts;

  // Zero results → honest, with rescue if we have one
  if (isZeroResult || products.length === 0) {
    const base = `I couldn't find anything matching "${facts.query}" right now — I won't show you random stuff and pretend it matches.`;
    if (rescue && rescue.length > 0) {
      return `${base} Here's what's popular instead — maybe something catches your eye:`;
    }
    return `${base} Try different words, or ask me for a category like "electronics" or "shoes".`;
  }

  const top      = products[0];
  const topPrice = formatRs(effectivePrice(top));

  // Budget acknowledgment — proves the bot actually understood the constraint
  const budgetBit = intent?.budget
    ? ` within your ${formatRs(intent.budget)} budget`
    : '';

  if (products.length === 1) {
    return `I found exactly one match${budgetBit}: the ${top.name} at ${topPrice}.`;
  }

  const opener = pick([
    `I found ${totalFound} matches${budgetBit}.`,
    `Good news — ${totalFound} products fit${budgetBit ? budgetBit : ' your search'}.`,
  ]);

  const shown = products.length;
  const tail  = totalFound > shown
    ? `Here are the top ${shown} — the search page has all ${totalFound}:`
    : 'Here are the best ones:';

  return `${opener} The top pick is the ${top.name} at ${topPrice}. ${tail}`;
};

// Proactive next-step suggestions (feature 9) — every chip here MUST point at
// an intent that actually works. No aspirational chips.
const searchSuggestions = (facts) => {
  if (facts.isZeroResult || facts.products.length === 0) {
    return ['Show trending products', 'Help'];
  }
  if (facts.products.length > 1) {
    return ['Which is the cheapest?', 'Which is the best rated?'];
  }
  return ['Show trending products'];
};

// ── Trending ──────────────────────────────────────────────────────────────────
const trendingReply = (products) => {
  if (!products.length) return "Nothing is trending right now — the shop's a bit quiet. Try searching for something specific!";
  const top = products[0];
  return pick([
    `Here's what's hot right now 🔥 The ${top.name} is leading at ${formatRs(effectivePrice(top))}:`,
    `These are trending with shoppers right now — the ${top.name} tops the list:`,
  ]);
};

// ── Follow-up answers (grounded in the products already shown) ───────────────
const followUpReply = (kind, product, count) => {
  const price = formatRs(product.finalPrice);
  if (kind === 'cheapest') {
    return `Of the ${count} I showed you, the ${product.name} is the cheapest at ${price}.`;
  }
  if (kind === 'expensive') {
    return `The ${product.name} is the priciest of the ${count} at ${price}.`;
  }
  // best_rated
  if (!product.rating || product.rating === 0) {
    return `Honestly, none of those ${count} have customer ratings yet, so I can't rank them by rating. By price, the ${product.name} is a solid pick at ${price}.`;
  }
  return `The ${product.name} is the best rated of the ${count} — ★ ${product.rating.toFixed(1)} at ${price}.`;
};

// ── Orders ────────────────────────────────────────────────────────────────────
const shortDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

// One honest sentence per status — every fact comes from the order document.
// Deliberately NO invented ETAs: the schema has no ETA, so the bot never
// promises one.
const orderStatusLine = (o) => {
  switch (o.status) {
    case 'pending':
      return `is placed and waiting for the seller to confirm`;
    case 'confirmed':
      return `is confirmed — the seller is preparing it`;
    case 'packed':
      return `is packed and ready for pickup`;
    case 'dispatched':
      return o.agentName
        ? `is out for delivery with ${o.agentName} 🚚`
        : `is out for delivery 🚚`;
    case 'delivered':
      return `was delivered${o.deliveredAt ? ` on ${shortDate(o.deliveredAt)}` : ''} ✅`;
    case 'cancelled':
      return `was cancelled`;
    case 'returned':
      return returnedLine(o);
    default:
      return `has status "${o.status}"`;
  }
};

// Phrasing for a 'returned' state. Three shapes, no arithmetic anywhere:
//   • package row (no `.packages`) → bare "was returned"; the amount lives on
//     the card row, so multi-package prose carries no money.
//   • multi-package ORDER → names the seller(s) whose package(s) came back
//     (first two + "and N other package(s)" beyond that; N from array lengths,
//     not money) and says a refund is being processed — NO figure.
//   • single-package ORDER → UNCHANGED: keeps its sole shipment's refund amount.
const returnedLine = (o) => {
  if (!Array.isArray(o.packages)) return `was returned`;

  if (isMultiPackage(o)) {
    const names = o.packages.filter((p) => p.status === 'returned').map((p) => p.sellerName);
    if (names.length === 0) return `was returned`; // defensive; a 'returned' order has ≥1 returned package
    // Each branch builds a COMPLETE noun-phrase (article + names + "package(s)"),
    // so the count that pluralises "other" and the count that pluralises the noun
    // are the same number — no separate trailing suffix that can disagree.
    let who;
    if (names.length === 1)      who = `the ${names[0]} package`;
    else if (names.length === 2) who = `the ${names[0]} and ${names[1]} packages`;
    else {
      const n = names.length - 2;
      who = `the ${names[0]}, ${names[1]} and ${n} other package${n === 1 ? '' : 's'}`;
    }
    return `had ${who} returned — a refund is being processed`;
  }

  // Single-package (or degraded) order — byte-identical to the original branch.
  return `was returned${o.refund > 0 ? ` — your refund of ${formatRs(o.refund)} is being processed` : ''}`;
};

// A card is "multi-package" only when it carries more than one shipment. Single
// (or zero) package orders take the ORIGINAL, unchanged phrasing everywhere.
const isMultiPackage = (o) => !!o && Array.isArray(o.packages) && o.packages.length > 1;

// One line per package — reuses orderStatusLine so a package's sentence reads
// exactly like the single-order sentence. `•` + `\n` render fine in the widget
// (whitespace-pre-line), same as helpReply/cartViewReply already rely on.
const packageLine = (pkg) => `• Package ${pkg.index} (${pkg.sellerName}) ${orderStatusLine(pkg)}`;

// Return-window nudge — appended as an ADDITIONAL line for any order (single-
// or multi-package) with a delivered package still inside its window. The
// minutes-remaining value is read from returnActions by the service and stashed
// on the card as `returnMinutesLeft`; never recomputed here. formatRemaining
// phrases it (rounded DOWN — "22 min", "6 days"). Returns '' when there's no
// returnable package, so a base sentence stays byte-identical when no note applies.
const returnNote = (o) => {
  if (!o || o.returnMinutesLeft == null || o.returnMinutesLeft <= 0) return '';
  const what = isMultiPackage(o) ? 'a delivered package' : 'it';
  return `\nYou can still return ${what} — ${formatRemaining(o.returnMinutesLeft)} left in the window.`;
};

// facts: { activeOrders, latestOrder (when none active), everOrdered }
const trackingReply = (facts) => {
  const { activeOrders, latestOrder, everOrdered } = facts;

  if (!everOrdered) {
    return "You haven't placed any orders yet — want me to help you find something first?";
  }
  if (activeOrders.length === 0) {
    // SINGLE-PACKAGE: today's exact sentence, with the return-window note
    // appended ONLY when a delivered package is still inside its window (TASK 2)
    // — returnNote is '' otherwise, so past-window/non-delivered stays unchanged.
    if (isMultiPackage(latestOrder)) {
      return `Nothing is on the way right now. Your most recent order #${latestOrder.shortId} arrived in ${latestOrder.packages.length} packages:\n${latestOrder.packages.map(packageLine).join('\n')}${returnNote(latestOrder)}`;
    }
    return `Nothing is on the way right now. Your most recent order (#${latestOrder.shortId} — ${latestOrder.itemSummary}) ${orderStatusLine(latestOrder)}.${returnNote(latestOrder)}`;
  }
  if (activeOrders.length === 1) {
    const o = activeOrders[0];
    // SINGLE-PACKAGE: today's exact sentence, plus the return-window note when
    // applicable (returnNote is '' for a still-moving single-package order).
    if (isMultiPackage(o)) {
      return `Your order #${o.shortId} (${formatRs(o.total)}) is arriving in ${o.packages.length} packages:\n${o.packages.map(packageLine).join('\n')}${returnNote(o)}`;
    }
    return `Your order #${o.shortId} (${o.itemSummary}, ${formatRs(o.total)}) ${orderStatusLine(o)}.${returnNote(o)}`;
  }
  return `You have ${activeOrders.length} orders on the way right now:`;
};

// ── Package-aware status filter ("which is delivered?") ───────────────────────
// Collects the specific packages matching `wanted` across the shown orders, so
// a delivered package inside a still-moving order surfaces. Single-package (or
// degraded) matches reproduce today's order-level sentence exactly.
const statusFilterReply = (matches, wanted, label) => {
  const hits = [];
  for (const o of matches) {
    const pkgs = Array.isArray(o.packages) ? o.packages : [];
    if (pkgs.length) {
      for (const p of pkgs) if (p.status === wanted) hits.push({ o, p });
    } else if (o.status === wanted) {
      hits.push({ o, p: null });
    }
  }

  const asOrderSentence = (o) =>
    `Order #${o.shortId} (${o.itemSummary}) ${orderStatusLine(o)}.`;
  const asPackageSentence = (o, p) =>
    `Package ${p.index} (${p.sellerName}) of order #${o.shortId} ${orderStatusLine(p)}.`;
  const isSinglePkg = (o) => !(Array.isArray(o.packages) && o.packages.length > 1);

  if (hits.length === 1) {
    const { o, p } = hits[0];
    return (!p || isSinglePkg(o)) ? asOrderSentence(o) : asPackageSentence(o, p);
  }

  const lines = hits.map(({ o, p }) =>
    (!p || isSinglePkg(o))
      ? `• Order #${o.shortId} (${o.itemSummary}) ${orderStatusLine(o)}`
      : `• Order #${o.shortId}, Package ${p.index} (${p.sellerName}) ${orderStatusLine(p)}`
  );
  return `These ${hits.length} are ${label}:\n${lines.join('\n')}`;
};

const historyReply = (orders) => {
  if (orders.length === 0) {
    return "You haven't placed any orders yet — your history is empty. Want to find something?";
  }
  return pick([
    `Here ${orders.length === 1 ? 'is your most recent order' : `are your last ${orders.length} orders`}:`,
    `Sure — ${orders.length === 1 ? 'your most recent order' : `your ${orders.length} most recent orders`}:`,
  ]);
};

// ── Returns ───────────────────────────────────────────────────────────────────
// Honest by construction: eligibility comes from real orders + the real window,
// and BOTH refund outcomes are stated because the ADMIN decides fault — the bot
// never promises a specific refund amount.
const refundMathBit = (a) =>
  `If it's a product issue (seller's fault) you'd get a full refund of ${formatRs(a.sellerFaultRefund)}; ` +
  `if it's a change of mind, the refund is ${formatRs(a.customerFaultRefund)} (minus the Rs ${a.pickupFee} return pickup fee). ` +
  `Our team confirms which applies when reviewing your request.`;

const returnReply = (facts, orderCards) => {
  const { matched, eligible, inProgress, everDelivered, annotated } = facts;

  // 1. They named a specific product and we found exactly one order for it
  if (matched.length === 1) {
    const a = matched[0];
    const name = a.order.items?.[0]?.name || 'that order';
    if (a.hasReturn) {
      return `You've already requested a return for the ${name} — it's under review. You'll get an email once it's processed.`;
    }
    if (a.expired) {
      return `I'm sorry — the return window for the ${name} closed on ${shortDate(a.expiredOn)}, so it can't be returned anymore.`;
    }
    return `Good news — the ${name} is still returnable (${formatRemaining(a.minutesLeft)} left in the window). ${refundMathBit(a)} Tap below to submit the request from your orders page:`;
  }

  // 2. A return is already moving through the pipeline
  if (inProgress.length > 0 && eligible.length === 0) {
    return `You have ${inProgress.length === 1 ? 'a return' : `${inProgress.length} returns`} in progress right now — here's the status. You'll be emailed at each step:`;
  }

  // 3. Eligible orders exist → list them
  if (eligible.length > 0) {
    const plural = eligible.length > 1;
    const { RETURN_PICKUP_FEE } = require('../../utils/returnMath');
    return `You have ${eligible.length} order${plural ? 's' : ''} still inside the return window${plural ? ' — which one do you mean?' : ':'} Returns are reviewed by our team; refund depends on the reason (full refund for product issues, minus the Rs ${RETURN_PICKUP_FEE} return pickup fee for change-of-mind). Tap below to submit:`;
  }

  // 4. Delivered orders exist but every window has closed
  if (everDelivered) {
    const latest = annotated[0];
    const { RETURN_WINDOW_MINUTES } = require('../../config/settlementConfig');
    return `None of your delivered orders can be returned anymore — the most recent window closed on ${shortDate(latest.expiredOn)}. Returns are only possible within ${formatLength(RETURN_WINDOW_MINUTES)} of delivery.`;
  }

  // 5. Nothing delivered yet
  return `Returns are only possible for delivered orders, and you don't have any delivered orders yet. Once something arrives, you'll have a return window from the delivery date.`;
};

// ── Product Q&A ───────────────────────────────────────────────────────────────
const qaReply = (productName, sentences) =>
  `Here's what the ${productName} listing says: "${sentences.join('. ')}."`;

const qaMissReply = (productName, keywords) => {
  const topic = keywords.length ? `"${keywords.join(' ')}"` : 'that';
  return `Honestly, the ${productName} listing doesn't mention ${topic} — I won't guess at specs that aren't written there. You can ask about something else it covers, or contact the seller for details.`;
};

const qaWhichOne = (names) =>
  `Which one do you mean — ${names.slice(0, 4).join(', ')}${names.length > 4 ? ', …' : ''}? Just say its name or "the first one".`;

const qaDetailReply = (product) =>
  `That's the ${product.name} at ${formatRs(effectivePrice(product))}. Ask me anything about it — I'll check the listing.`;


// ── Multi-product Q&A (fallback path) ─────────────────────────────────────────
const multiQaReply = (matchNames, topic, total) =>
  `Of the ${total} I showed you, ${matchNames.length === 1 ? 'only ' : ''}` +
  `${matchNames.join(' and ')} mention${matchNames.length === 1 ? 's' : ''} ` +
  `${topic ? `"${topic}"` : 'that'} in the listing.`;

const multiQaMissReply = (topic, total) =>
  `Honestly, none of the ${total} listings mention ${topic ? `"${topic}"` : 'that'} — I won't guess. You can ask about something else, or check the product pages for full details.`;

// ── Cart ──────────────────────────────────────────────────────────────────────
const cartAddedReply = (name, price) =>
  pick([
    `Done — added the ${name} (${formatRs(price)}) to your cart ✓`,
    `Added! The ${name} is in your cart at ${formatRs(price)} ✓`,
  ]);

const cartOutOfStockReply = (name) =>
  `I'm sorry — the ${name} is out of stock right now, so I can't add it. Want me to find something similar?`;

const cartWhichOneReply = () =>
  `Which one should I add? Say something like "add the second one" or name the product.`;

const cartSearchFirstReply = () =>
  `Here's what I found — tell me which one to add, or tap "+ Add" on a card:`;

// ── Cart view ─────────────────────────────────────────────────────────────────
// Three labelled blocks, every money figure taken straight from buildCartSummary
// (no arithmetic here). Empty blocks are omitted. `•` + `\n` render in the widget
// (whitespace-pre-line), same as helpReply already relies on.
//   summary: { packages, totalDiscount, grandTotal, notSelectedItems, staleItems, ... }
const cartViewReply = (summary) => {
  const packages    = summary.packages || [];
  const notSelected = summary.notSelectedItems || [];
  const stale       = summary.staleItems || [];

  if (!packages.length && !notSelected.length && !stale.length) {
    return `Your cart is empty right now — want me to help you find something?`;
  }

  const blocks = [];

  // 1. TICKED — the only block with money. Per-package delivery (FREE when the
  //    charge field is 0, mirroring the cart/orders pages), coupon, grand total.
  if (packages.length) {
    const pkgText = packages.map((p) => {
      const itemLines = p.items.map((i) => `  • ${i.name} × ${i.quantity}`).join('\n');
      const delivery = p.deliveryCharge === 0 ? 'delivery FREE' : `delivery ${formatRs(p.deliveryCharge)}`;
      return `${p.sellerName} (${delivery}):\n${itemLines}`;
    }).join('\n');

    let money = '';
    if (summary.totalDiscount > 0) money += `\nCoupon: −${formatRs(summary.totalDiscount)}`;
    money += `\nTotal to pay: ${formatRs(summary.grandTotal)}`;

    blocks.push(`✅ Ready to check out:\n${pkgText}${money}`);
  }

  // 2. NOT-TICKED — name / qty / unit price only. No total.
  if (notSelected.length) {
    const lines = notSelected.map((i) => `  • ${i.name} × ${i.quantity} (${formatRs(i.price)} each)`).join('\n');
    blocks.push(`🕗 Not ticked yet — these won't be bought until you select them:\n${lines}`);
  }

  // 3. STALE — name / qty / plain-language reason. No total.
  if (stale.length) {
    const lines = stale.map((i) => `  • ${i.name} × ${i.quantity} — ${i.staleReason}`).join('\n');
    blocks.push(`⚠️ Needs a look — can't be checked out as-is:\n${lines}`);
  }

  const lead = packages.length
    ? `Here's your cart 🛒`
    : `Nothing's ticked for checkout yet, but here's what's in your cart 🛒`;

  return `${lead}\n\n${blocks.join('\n\n')}`;
};

module.exports = {
  greetingReply,
  thanksReply,
  goodbyeReply,
  helpReply,
  comingSoonReply,
  searchReply,
  searchSuggestions,
  formatRs,
  effectivePrice,
  trendingReply,
  followUpReply,
  orderStatusLine,
  trackingReply,
  statusFilterReply,
  historyReply,
  returnReply,
  qaReply,
  qaMissReply,
  qaWhichOne,
  qaDetailReply,
  multiQaReply,
  multiQaMissReply,
  cartAddedReply,
  cartOutOfStockReply,
  cartWhichOneReply,
  cartSearchFirstReply,
  cartViewReply,
};