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
    case 'return_assigned':
      return `has a return approved — a pickup agent has been assigned`;
    case 'return_in_transit':
      return `is being returned — the agent has picked it up`;
    case 'returned':
      return `was returned${o.refund > 0 ? ` — your refund of ${formatRs(o.refund)} is being processed` : ''}`;
    default:
      return `has status "${o.status}"`;
  }
};

// facts: { activeOrders, latestOrder (when none active), everOrdered }
const trackingReply = (facts) => {
  const { activeOrders, latestOrder, everOrdered } = facts;

  if (!everOrdered) {
    return "You haven't placed any orders yet — want me to help you find something first?";
  }
  if (activeOrders.length === 0) {
    return `Nothing is on the way right now. Your most recent order (#${latestOrder.shortId} — ${latestOrder.itemSummary}) ${orderStatusLine(latestOrder)}.`;
  }
  if (activeOrders.length === 1) {
    const o = activeOrders[0];
    return `Your order #${o.shortId} (${o.itemSummary}, ${formatRs(o.total)}) ${orderStatusLine(o)}.`;
  }
  return `You have ${activeOrders.length} orders on the way right now:`;
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
  `if it's a change of mind, the refund is ${formatRs(a.customerFaultRefund)} (product price minus both Rs 50 delivery legs). ` +
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
    return `Good news — the ${name} is still returnable (${a.daysLeft} day${a.daysLeft === 1 ? '' : 's'} left in the window). ${refundMathBit(a)} Tap below to submit the request from your orders page:`;
  }

  // 2. A return is already moving through the pipeline
  if (inProgress.length > 0 && eligible.length === 0) {
    return `You have ${inProgress.length === 1 ? 'a return' : `${inProgress.length} returns`} in progress right now — here's the status. You'll be emailed at each step:`;
  }

  // 3. Eligible orders exist → list them
  if (eligible.length > 0) {
    const plural = eligible.length > 1;
    return `You have ${eligible.length} order${plural ? 's' : ''} still inside the return window${plural ? ' — which one do you mean?' : ':'} Returns are reviewed by our team; refund depends on the reason (full refund for product issues, minus Rs 100 delivery for change-of-mind). Tap below to submit:`;
  }

  // 4. Delivered orders exist but every window has closed
  if (everDelivered) {
    const latest = annotated[0];
    return `None of your delivered orders can be returned anymore — the most recent window closed on ${shortDate(latest.expiredOn)}. Returns are only possible within ${Math.round(latestWindowDays())} days of delivery.`;
  }

  // 5. Nothing delivered yet
  return `Returns are only possible for delivered orders, and you don't have any delivered orders yet. Once something arrives, you'll have a return window from the delivery date.`;
};

// Window length in days, derived from the same constant the controller uses
const latestWindowDays = () => {
  const { RETURN_WINDOW_MINUTES } = require('../../controllers/returnController');
  return RETURN_WINDOW_MINUTES / (24 * 60);
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
const cartViewReply = (items, total, itemCount) => {
  if (!items.length) {
    return `Your cart is empty right now — want me to help you find something?`;
  }
  const lines = items.map((i) =>
    `• ${i.product.name} × ${i.quantity} — ${formatRs(i.price * i.quantity)}`
  );
  return `You have ${itemCount} item${itemCount === 1 ? '' : 's'} in your cart:\n${lines.join('\n')}\n\nTotal: ${formatRs(total)}`;
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