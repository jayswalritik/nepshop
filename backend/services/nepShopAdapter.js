/**
 * ─────────────────────────────────────────────────────────────────────────────
 * NepShop Recommendation Adapter  (backend/services/nepShopAdapter.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Bridges NepShop's Mongoose models to the generic recommendation engine.
 * All MongoDB queries live here; the engine stays model-agnostic.
 *
 * Exported functions (called by recommendationController.js):
 *   getTrending(options)          → Phase 1 — purchase-velocity ranking
 *   getSimilar(productId, opts)   → Phase 1 — content-based similarity
 *   getPersonalizedFeed(userId)   → Phase 1 — hybrid (history → content → trending)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const Product     = require('../models/Product');
const Order       = require('../models/Order');
const Cart        = require('../models/Cart');
const User        = require('../models/User');
const ProductView = require('../models/ProductView');
const mongoose    = require('mongoose');

const {
  scoreProduct,
  rankProducts,
  rankByCoOccurrence,
  computeTrendingScore,
  buildFavCategories,
  reasonFromScoreParts,
  reasonFromCoCount,
} = require('./recommendationEngine');

// ── Shared product projection ─────────────────────────────────────────────────
// Only the fields we need for scoring + display.
const PRODUCT_SELECT = 'name price comparePrice discount category images rating numReviews seller stock isActive createdAt';

// ── Helper: lean product list (all active, in-stock) ─────────────────────────
const getAllActiveProducts = async () =>
  Product.find({ isActive: true, stock: { $gt: 0 } })
    .select(PRODUCT_SELECT)
    .lean();

// ─────────────────────────────────────────────────────────────────────────────
// getTrending
// ─────────────────────────────────────────────────────────────────────────────
// Returns products ranked by time-decayed purchase velocity over the last
// `windowDays` days.  Falls back to newest products when orders are sparse.
//
// options: { limit, windowDays, excludeIds }
// ─────────────────────────────────────────────────────────────────────────────
const getTrending = async (options = {}) => {
  const { limit = 10, windowDays = 30, excludeIds = [] } = options;

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  // Aggregate order items within the window
  const orderSignals = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: since },
        status: { $nin: ['cancelled', 'returned'] },
      },
    },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        signals: {
          $push: {
            purchasedAt: '$createdAt',
            quantity: '$items.quantity',
          },
        },
        totalQty: { $sum: '$items.quantity' },
      },
    },
  ]);

  // Build productId → trending score map
  const scoreMap = {};
  for (const agg of orderSignals) {
    scoreMap[agg._id.toString()] = computeTrendingScore(agg.signals);
  }

  // Fetch active products and attach trending scores
  const products = await getAllActiveProducts();

  const excludeSet = new Set(excludeIds.map(id => id.toString()));

  const scored = products
    .filter(p => !excludeSet.has(p._id.toString()))
    .map(p => ({
      ...p,
      _score: scoreMap[p._id.toString()] || 0,
      // Blend in a small quality bonus so tied-score products surface better ones
      _qualityBonus: (p.rating / 5) * 5 + Math.log(p.numReviews + 1),
    }));

  // Primary: trending score.  Secondary: quality bonus.  Tertiary: newest.
  scored.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    if (b._qualityBonus !== a._qualityBonus) return b._qualityBonus - a._qualityBonus;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  // FALLBACK: if fewer than `limit` have any purchase signal, pad with newest
  const withSignal    = scored.filter(p => p._score > 0).slice(0, limit);
  const withoutSignal = scored.filter(p => p._score === 0);

  if (withSignal.length < limit) {
    const needed = limit - withSignal.length;
    // Sort remainder by newest + quality
    withoutSignal.sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    );
    return [...withSignal, ...withoutSignal.slice(0, needed)];
  }

  return withSignal;
};

// ─────────────────────────────────────────────────────────────────────────────
// getSimilar
// ─────────────────────────────────────────────────────────────────────────────
// Content-based similarity for a given product.
// Signals: same category (primary), price proximity, same seller (secondary).
//
// options: { limit, excludeIds }
// ─────────────────────────────────────────────────────────────────────────────
const getSimilar = async (productId, options = {}) => {
  const cfg = require('./recommendationConfig').similar;
  const { limit = cfg.defaultLimit, excludeIds = [] } = options;

  // Fetch the anchor product
  const anchor = await Product.findById(productId).select(PRODUCT_SELECT).lean();
  if (!anchor) return [];

  const allProducts = await getAllActiveProducts();
  const allExclude  = [productId.toString(), ...excludeIds.map(id => id.toString())];

  const signals = {
    category:    anchor.category,
    anchorPrice: anchor.price,
    sellerId:    anchor.seller,
  };

  // ── 1. Same-category first ──────────────────────────────────────────────────
  const sameCategory = allProducts.filter(p => p.category === anchor.category);
  let ranked = rankProducts(sameCategory, signals, { limit, excludeIds: allExclude });

  // ── 2. Widen to other categories ONLY if we're below the minimum ────────────
  // A "More in [category]" row showing unrelated categories is misleading, so
  // we only pad with cross-category products when same-category is genuinely
  // too sparse to fill a reasonable row.
  if (ranked.length < Math.min(cfg.minSameCategory, limit)) {
    const alreadyPicked = new Set(ranked.map(p => p._id.toString()));
    const otherCategory = allProducts.filter(
      p => p.category !== anchor.category && !alreadyPicked.has(p._id.toString())
    );
    const filler = rankProducts(otherCategory, signals, {
      limit: limit - ranked.length,
      excludeIds: allExclude,
    });
    ranked = [...ranked, ...filler];
  }

  // Explain-why label for each result
  return ranked.map(p => ({ ...p, _reason: reasonFromScoreParts(p, anchor.category) }));
};

// ─────────────────────────────────────────────────────────────────────────────
// getPersonalizedFeed
// ─────────────────────────────────────────────────────────────────────────────
// Hybrid home feed for a logged-in customer.
//
// Cascade:
//   1. User has order history → score by their fav categories + price anchors
//   2. Boost trending products (blend trending score in)
//   3. Cold-start (no history) → fall through to trending → newest
//
// options: { limit, excludeIds }
// ─────────────────────────────────────────────────────────────────────────────
const getPersonalizedFeed = async (userId, options = {}) => {
  const { limit = 16, excludeIds = [] } = options;

  // Fetch user's completed orders (non-cancelled, non-returned)
  const userOrders = await Order.find({
    customer: userId,
    status: { $nin: ['cancelled', 'returned'] },
  })
    .select('items createdAt')
    .lean();

  // Build purchase signal array
  const purchaseSignals = userOrders.flatMap(order =>
    order.items.map(item => ({
      productId:   item.product?.toString(),
      category:    item.category,  // may be undefined for old orders
      purchasedAt: order.createdAt,
      quantity:    item.quantity,
      price:       item.price,
    }))
  );

  // Enrich signals with category data (order items don't snapshot category)
  // We need a single batch fetch of purchased product IDs
  const purchasedProductIds = [...new Set(
    purchaseSignals.map(s => s.productId).filter(Boolean)
  )];

  let categoryByProductId = {};
  if (purchasedProductIds.length > 0) {
    const purchasedProducts = await Product.find({
      _id: { $in: purchasedProductIds },
    }).select('_id category price').lean();

    categoryByProductId = Object.fromEntries(
      purchasedProducts.map(p => [p._id.toString(), { category: p.category, price: p.price }])
    );
  }

  // Enrich each signal with category + price from product
  const enrichedSignals = purchaseSignals.map(s => ({
    ...s,
    category: s.category || categoryByProductId[s.productId]?.category,
    price:    s.price    || categoryByProductId[s.productId]?.price,
  }));

  const hasPurchaseHistory = enrichedSignals.length > 0;

  // Also get platform-wide trending scores (to blend in)
  const trendingSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const orderSignals = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: trendingSince },
        status: { $nin: ['cancelled', 'returned'] },
      },
    },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        signals: { $push: { purchasedAt: '$createdAt', quantity: '$items.quantity' } },
      },
    },
  ]);

  const trendingScoreMap = {};
  for (const agg of orderSignals) {
    const { computeTrendingScore } = require('./recommendationEngine');
    trendingScoreMap[agg._id.toString()] = computeTrendingScore(agg.signals);
  }

  // Fetch all active products
  const allProducts = await getAllActiveProducts();

  const excludeSet = new Set([
    ...excludeIds.map(id => id.toString()),
    ...purchasedProductIds,   // don't re-recommend already-bought items
  ]);

  const candidates = allProducts.filter(p => !excludeSet.has(p._id.toString()));

  let ranked;

  if (hasPurchaseHistory) {
    // ── Personalized path ────────────────────────────────────────────────────
    const favCategories = buildFavCategories(enrichedSignals.filter(s => s.category));

    // Average price anchor across recent purchases (last 5)
    const recentPrices = enrichedSignals
      .sort((a, b) => new Date(b.purchasedAt) - new Date(a.purchasedAt))
      .slice(0, 5)
      .map(s => s.price)
      .filter(Boolean);
    const anchorPrice = recentPrices.length
      ? recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length
      : null;

    const signals = { favCategories, anchorPrice };

    // Score each candidate
    const { scoreProduct } = require('./recommendationEngine');
    const scored = candidates.map(p => {
      const base = scoreProduct(p, signals);
      // Blend 20% trending boost
      const tBoost = (trendingScoreMap[p._id.toString()] || 0) * 0.2;
      return { ...base, _score: base._score + tBoost };
    });

    scored.sort((a, b) => b._score - a._score);
    ranked = scored.slice(0, limit);

  } else {
    // ── Cold-start path — trending → newest ──────────────────────────────────
    const scored = candidates.map(p => ({
      ...p,
      _score: trendingScoreMap[p._id.toString()] || 0,
    }));

    const hasTrending = scored.some(p => p._score > 0);

    if (hasTrending) {
      scored.sort((a, b) => b._score - a._score);
    } else {
      // Absolute cold-start: newest products
      scored.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    ranked = scored.slice(0, limit);
  }

  // Attach explain-why label (Phase 1 simple version)
  return ranked.map(p => ({
    ...p,
    _reason: hasPurchaseHistory
      ? inferReason(p, enrichedSignals, trendingScoreMap)
      : (trendingScoreMap[p._id.toString()] ? 'Trending now' : 'New arrival'),
  }));
};

// ── Simple reason labeler ─────────────────────────────────────────────────────
const inferReason = (product, purchaseSignals, trendingScoreMap) => {
  const boughtCategories = new Set(purchaseSignals.map(s => s.category).filter(Boolean));
  if (boughtCategories.has(product.category)) return `Because you bought ${product.category}`;
  if (trendingScoreMap[product._id.toString()] > 0) return 'Trending now';
  if (product.rating >= 4.5) return 'Highly rated';
  return 'You might like this';
};

// ─────────────────────────────────────────────────────────────────────────────
// getFrequentlyBoughtTogether   (Phase 2 — basket co-occurrence)
// ─────────────────────────────────────────────────────────────────────────────
// "Often bought with this" — products that appear in the SAME orders (baskets)
// as the anchor product.  This is tight, contextual basket analysis.
//
// Returns ONLY true co-occurrence results.  When a product has never been
// co-purchased, returns [] so the UI hides the row (no misleading fallback —
// the modal's content-based "Similar Products" row already covers that case).
//
// options: { limit }
// ─────────────────────────────────────────────────────────────────────────────
const getFrequentlyBoughtTogether = async (productId, options = {}) => {
  const { limit = 6 } = options;
  const pid = productId.toString();

  // Find non-cancelled / non-returned orders containing the anchor product
  const orders = await Order.find({
    'items.product': productId,
    status: { $nin: ['cancelled', 'returned'] },
  })
    .select('items')
    .lean();

  // Count how many baskets each other product shares with the anchor
  const coCounts = {};
  for (const order of orders) {
    const idsInOrder = order.items.map(i => i.product?.toString()).filter(Boolean);
    if (!idsInOrder.includes(pid)) continue; // safety
    for (const otherId of idsInOrder) {
      if (otherId === pid) continue;
      coCounts[otherId] = (coCounts[otherId] || 0) + 1;
    }
  }

  const coIds = Object.keys(coCounts);
  if (coIds.length === 0) return []; // cold-start → hide row

  // Fetch the co-occurring products (active + in stock only)
  const products = await Product.find({
    _id: { $in: coIds },
    isActive: true,
    stock: { $gt: 0 },
  })
    .select(PRODUCT_SELECT)
    .lean();

  const productMap = Object.fromEntries(products.map(p => [p._id.toString(), p]));

  const ranked = rankByCoOccurrence(coCounts, productMap, { limit, excludeIds: [pid] });
  return ranked.map(p => ({ ...p, _reason: reasonFromCoCount(p) }));
};

// ─────────────────────────────────────────────────────────────────────────────
// getCustomersAlsoBought   (Phase 2 — customer-level affinity)
// ─────────────────────────────────────────────────────────────────────────────
// "Customers who bought this also bought" — broader than basket analysis.
// Looks at every customer who ever bought the anchor, then counts (by DISTINCT
// customer) what else those customers bought across all their orders.
//
// Counting distinct customers (not raw order lines) prevents one heavy buyer
// from dominating the list.
//
// Returns ONLY true affinity results; [] when none → UI hides the row.
//
// options: { limit }
// ─────────────────────────────────────────────────────────────────────────────
const getCustomersAlsoBought = async (productId, options = {}) => {
  const { limit = 8 } = options;
  const pid = productId.toString();

  // 1. Who bought the anchor product?
  const anchorOrders = await Order.find({
    'items.product': productId,
    status: { $nin: ['cancelled', 'returned'] },
  })
    .select('customer')
    .lean();

  const customerIds = [...new Set(
    anchorOrders.map(o => o.customer?.toString()).filter(Boolean)
  )];
  if (customerIds.length === 0) return []; // cold-start → hide row

  // 2. What else did those customers buy?
  const theirOrders = await Order.find({
    customer: { $in: customerIds },
    status: { $nin: ['cancelled', 'returned'] },
  })
    .select('customer items')
    .lean();

  // For each other product, collect the SET of distinct customers who bought it
  const customersByProduct = {}; // productId -> Set<customerId>
  for (const order of theirOrders) {
    const cust = order.customer?.toString();
    for (const item of order.items) {
      const otherId = item.product?.toString();
      if (!otherId || otherId === pid) continue;
      if (!customersByProduct[otherId]) customersByProduct[otherId] = new Set();
      customersByProduct[otherId].add(cust);
    }
  }

  // Convert distinct-customer sets to counts
  const coCounts = {};
  for (const [otherId, custSet] of Object.entries(customersByProduct)) {
    coCounts[otherId] = custSet.size;
  }

  const coIds = Object.keys(coCounts);
  if (coIds.length === 0) return [];

  const products = await Product.find({
    _id: { $in: coIds },
    isActive: true,
    stock: { $gt: 0 },
  })
    .select(PRODUCT_SELECT)
    .lean();

  const productMap = Object.fromEntries(products.map(p => [p._id.toString(), p]));

  const ranked = rankByCoOccurrence(coCounts, productMap, { limit, excludeIds: [pid] });
  // Reason reflects how many distinct customers also bought it
  return ranked.map(p => {
    const n = p._coCount || 0;
    const reason = n >= 3 ? `${n} buyers also bought` : 'Customers also bought';
    return { ...p, _reason: reason };
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// trackProductView   (Phase 3 — view tracking)
// ─────────────────────────────────────────────────────────────────────────────
// Records a product view for a logged-in customer.  Throttled: if the same
// user viewed the same product within the last hour, we just bump viewedAt on
// the existing row instead of creating a new one — keeps the collection lean.
// ─────────────────────────────────────────────────────────────────────────────
const trackProductView = async (userId, productId) => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const recent = await ProductView.findOne({
    user: userId,
    product: productId,
    viewedAt: { $gte: oneHourAgo },
  });

  if (recent) {
    recent.viewedAt = new Date();
    await recent.save();
    return;
  }

  await ProductView.create({ user: userId, product: productId });
};

// ─────────────────────────────────────────────────────────────────────────────
// getRecentlyViewed   (Phase 3)
// ─────────────────────────────────────────────────────────────────────────────
// Returns the user's most-recently-viewed products (distinct, newest first).
// Out-of-stock / inactive products are filtered out.
//
// options: { limit, excludeIds }
// ─────────────────────────────────────────────────────────────────────────────
const getRecentlyViewed = async (userId, options = {}) => {
  const { limit = 10, excludeIds = [] } = options;

  // Collapse multiple views of the same product to its latest viewedAt
  const views = await ProductView.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId) } },
    { $sort: { viewedAt: -1 } },
    { $group: { _id: '$product', lastViewed: { $first: '$viewedAt' } } },
    { $sort: { lastViewed: -1 } },
    { $limit: limit + excludeIds.length + 20 }, // over-fetch to survive filtering
  ]);

  if (views.length === 0) return [];

  const orderedIds = views.map(v => v._id.toString());
  const excludeSet = new Set(excludeIds.map(id => id.toString()));

  // Fetch the products (active + in stock only)
  const products = await Product.find({
    _id: { $in: orderedIds },
    isActive: true,
    stock: { $gt: 0 },
  })
    .select(PRODUCT_SELECT)
    .lean();

  const productMap = Object.fromEntries(products.map(p => [p._id.toString(), p]));

  // Map productId → lastViewed for relative-time labels
  const lastViewedMap = Object.fromEntries(
    views.map(v => [v._id.toString(), v.lastViewed])
  );

  // Preserve recency order from the aggregation
  return orderedIds
    .filter(id => productMap[id] && !excludeSet.has(id))
    .map(id => ({ ...productMap[id], _reason: relativeTimeLabel(lastViewedMap[id]) }))
    .slice(0, limit);
};

// ── Relative-time label for "Recently Viewed" ─────────────────────────────────
const relativeTimeLabel = (date) => {
  if (!date) return 'Viewed recently';
  const mins = (Date.now() - new Date(date).getTime()) / 60000;
  if (mins < 60)        return 'Viewed just now';
  if (mins < 60 * 24)   return `Viewed ${Math.round(mins / 60)}h ago`;
  const days = Math.round(mins / (60 * 24));
  if (days === 1)       return 'Viewed yesterday';
  return `Viewed ${days}d ago`;
};

// ─────────────────────────────────────────────────────────────────────────────
// getCartRecommendations   (Phase 3)
// ─────────────────────────────────────────────────────────────────────────────
// "Complete your cart" — products commonly bought alongside what's in the cart.
//
// Cascade (cart row is standalone, so a fallback is appropriate here):
//   1. Collaborative — co-occurrence across all cart items' baskets
//   2. Content-based — similar by the cart's categories + average price
//   3. Trending      — platform best-sellers
// Already-in-cart products are always excluded.
//
// options: { limit }
// ─────────────────────────────────────────────────────────────────────────────
const getCartRecommendations = async (userId, options = {}) => {
  const { limit = 8 } = options;

  const cart = await Cart.findOne({ customer: userId }).lean();
  const cartProductIds = (cart?.items || [])
    .map(i => i.product?.toString())
    .filter(Boolean);

  if (cartProductIds.length === 0) return [];

  const cartIdSet = new Set(cartProductIds);

  // ── 1. Collaborative: baskets containing any cart item ──────────────────────
  const orders = await Order.find({
    'items.product': { $in: cartProductIds },
    status: { $nin: ['cancelled', 'returned'] },
  })
    .select('items')
    .lean();

  const coCounts = {};
  for (const order of orders) {
    const ids = order.items.map(i => i.product?.toString()).filter(Boolean);
    if (!ids.some(id => cartIdSet.has(id))) continue;
    for (const otherId of ids) {
      if (cartIdSet.has(otherId)) continue; // never recommend what's already in cart
      coCounts[otherId] = (coCounts[otherId] || 0) + 1;
    }
  }

  const allProducts = await getAllActiveProducts();
  const productMap   = Object.fromEntries(allProducts.map(p => [p._id.toString(), p]));

  if (Object.keys(coCounts).length > 0) {
    const ranked = rankByCoOccurrence(coCounts, productMap, {
      limit,
      excludeIds: cartProductIds,
    });
    if (ranked.length > 0) return ranked.map(p => ({ ...p, _reason: 'Pairs well with your cart' }));
  }

  // ── 2. Content-based fallback: cart categories + average price ──────────────
  const cartProducts = cartProductIds
    .map(id => productMap[id])
    .filter(Boolean);

  const favCategories = cartProducts.length
    ? buildFavCategories(cartProducts.map(p => ({ category: p.category, quantity: 1 })))
    : [];

  const avgPrice = cartProducts.length
    ? cartProducts.reduce((s, p) => s + p.price, 0) / cartProducts.length
    : null;

  const candidates = allProducts.filter(p => !cartIdSet.has(p._id.toString()));

  if (favCategories.length) {
    const scored = candidates
      .map(p => scoreProduct(p, { favCategories, anchorPrice: avgPrice }))
      .filter(p => p.stock > 0 && p.isActive !== false)
      .sort((a, b) => b._score - a._score)
      .slice(0, limit);
    if (scored.length > 0) return scored.map(p => ({ ...p, _reason: 'You might also like' }));
  }

  // ── 3. Trending fallback ────────────────────────────────────────────────────
  const trending = await getTrending({ limit, excludeIds: cartProductIds });
  return trending.map(p => ({ ...p, _reason: 'Popular right now' }));
};

// ─────────────────────────────────────────────────────────────────────────────
// getWishlistRecommendations   (Phase 3)
// ─────────────────────────────────────────────────────────────────────────────
// "More you'll love" — content-based suggestions from the user's wishlist
// (category + price affinity), blended with a light co-occurrence boost.
// Excludes products already wishlisted and already purchased.
//
// options: { limit }
// ─────────────────────────────────────────────────────────────────────────────
const getWishlistRecommendations = async (userId, options = {}) => {
  const { limit = 8 } = options;

  const user = await User.findById(userId).select('wishlist').lean();
  const wishlistIds = (user?.wishlist || []).map(id => id.toString());

  if (wishlistIds.length === 0) return [];

  const allProducts = await getAllActiveProducts();
  const productMap   = Object.fromEntries(allProducts.map(p => [p._id.toString(), p]));

  const wishlistProducts = wishlistIds.map(id => productMap[id]).filter(Boolean);
  if (wishlistProducts.length === 0) return [];

  // Build category affinity + average price from wishlist
  const favCategories = buildFavCategories(
    wishlistProducts.map(p => ({ category: p.category, quantity: 1 }))
  );
  const avgPrice =
    wishlistProducts.reduce((s, p) => s + p.price, 0) / wishlistProducts.length;

  // Exclude wishlisted + already-purchased products
  const purchasedOrders = await Order.find({
    customer: userId,
    status: { $nin: ['cancelled', 'returned'] },
  })
    .select('items.product')
    .lean();

  const purchasedIds = new Set(
    purchasedOrders.flatMap(o => o.items.map(i => i.product?.toString())).filter(Boolean)
  );
  const excludeSet = new Set([...wishlistIds, ...purchasedIds]);

  // Light co-occurrence boost: products co-bought with wishlist items
  const orders = await Order.find({
    'items.product': { $in: wishlistIds },
    status: { $nin: ['cancelled', 'returned'] },
  })
    .select('items')
    .lean();

  const coBoost = {};
  for (const order of orders) {
    const ids = order.items.map(i => i.product?.toString()).filter(Boolean);
    for (const otherId of ids) {
      if (excludeSet.has(otherId)) continue;
      coBoost[otherId] = (coBoost[otherId] || 0) + 1;
    }
  }

  const candidates = allProducts.filter(p => !excludeSet.has(p._id.toString()));

  const scored = candidates
    .map(p => {
      const base = scoreProduct(p, { favCategories, anchorPrice: avgPrice });
      const boost = (coBoost[p._id.toString()] || 0) * 8; // small co-occurrence nudge
      return { ...base, _score: base._score + boost };
    })
    .filter(p => p.stock > 0 && p.isActive !== false)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);

  return scored.map(p => ({ ...p, _reason: 'Based on your wishlist' }));
};

// ─────────────────────────────────────────────────────────────────────────────
// capPerSeller  (small helper for Home landing rows)
// ─────────────────────────────────────────────────────────────────────────────
// Hard per-seller cap, preserving the incoming order. Used by Deals and New
// Arrivals so one shop can't flood a Home row. No backfill — consistent with
// the engine's hard-cap philosophy.
// ─────────────────────────────────────────────────────────────────────────────
const capPerSeller = (products, limit, maxPerSeller) => {
  const out = [];
  const count = {};
  for (const p of products) {
    if (out.length >= limit) break;
    const sid = p.seller?.toString() || 'none';
    if ((count[sid] || 0) < maxPerSeller) {
      out.push(p);
      count[sid] = (count[sid] || 0) + 1;
    }
  }
  return out;
};

// ─────────────────────────────────────────────────────────────────────────────
// getDeals   (Home — discounted products)
// ─────────────────────────────────────────────────────────────────────────────
// STRICT: only products with discount > 0, active, in stock. Sorted by discount
// desc (tie-break rating, then reviews). Seller-capped. Empty → row hides.
// ─────────────────────────────────────────────────────────────────────────────
const getDeals = async (options = {}) => {
  const cfg = require('./recommendationConfig').home;
  const { limit = cfg.dealsLimit } = options;

  const products = await Product.find({
    isActive: true,
    stock: { $gt: 0 },
    discount: { $gt: 0 },   // a deal MUST actually have a discount
  })
    .select(PRODUCT_SELECT)
    .lean();

  products.sort((a, b) => {
    if (b.discount !== a.discount) return b.discount - a.discount;
    if (b.rating   !== a.rating)   return b.rating   - a.rating;
    return (b.numReviews || 0) - (a.numReviews || 0);
  });

  return capPerSeller(products, limit, cfg.maxPerSellerInRow);
};

// ─────────────────────────────────────────────────────────────────────────────
// getNewArrivals   (Home — newest products)
// ─────────────────────────────────────────────────────────────────────────────
// Newest active, in-stock products by createdAt desc. Seller-capped so a seller
// who just bulk-listed can't own the whole row. Empty → row hides.
// ─────────────────────────────────────────────────────────────────────────────
const getNewArrivals = async (options = {}) => {
  const cfg = require('./recommendationConfig').home;
  const { limit = cfg.newArrivalsLimit } = options;

  const products = await Product.find({
    isActive: true,
    stock: { $gt: 0 },
  })
    .select(PRODUCT_SELECT)
    .sort({ createdAt: -1 })
    .limit(limit * 3)        // over-fetch so the seller cap still yields `limit`
    .lean();

  return capPerSeller(products, limit, cfg.maxPerSellerInRow);
};

module.exports = {
  getTrending,
  getSimilar,
  getPersonalizedFeed,
  getFrequentlyBoughtTogether,
  getCustomersAlsoBought,
  trackProductView,
  getRecentlyViewed,
  getCartRecommendations,
  getWishlistRecommendations,
  getDeals,
  getNewArrivals,
};

// Modified in feature/recommendations branch