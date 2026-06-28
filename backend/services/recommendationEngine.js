/**
 * ─────────────────────────────────────────────────────────────────────────────
 * NepShop Recommendation Engine  (backend/services/recommendationEngine.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Generic, modular scoring engine.  All NepShop-specific data fetching lives
 * in nepshopAdapter.js.  This file knows nothing about Mongoose.
 *
 * All tunable numbers come from recommendationConfig.js — this file holds the
 * algorithms, the config holds the parameters.
 *
 * ARCHITECTURE
 *   Signals → scored items → ranked list → diversity guard → fallback cascade
 *
 * FALLBACK CASCADE (cold-start safe)
 *   1. Personalized   (user has purchase history)
 *   2. Collaborative  (co-purchase patterns exist)
 *   3. Content-based  (category / price / seller similarity)
 *   4. Trending       (platform-wide purchase velocity)
 *   5. Newest         (createdAt desc)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const config = require('./recommendationConfig');

// ── Time-decay helper ─────────────────────────────────────────────────────────
// Returns a multiplier in (0, 1].  Signal older than `halfLifeDays` scores 50%.
const timeDecay = (date, halfLifeDays = 30) => {
  if (!date) return 0.5;
  const ageDays = (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
  return Math.pow(0.5, ageDays / halfLifeDays);
};

// ── Price proximity score ─────────────────────────────────────────────────────
const priceProximityScore = (candidatePrice, anchorPrice, maxPts = config.weights.priceProximity) => {
  if (!anchorPrice || anchorPrice <= 0) return maxPts / 2; // neutral when no anchor
  const ratio = Math.abs(candidatePrice - anchorPrice) / anchorPrice;
  const b = config.priceBands;
  if (ratio <= 0.2) return maxPts * b.within20pct;
  if (ratio <= 0.5) return maxPts * b.within50pct;
  if (ratio <= 1.0) return maxPts * b.within100pct;
  return maxPts * b.beyond;
};

// ── Rating score ──────────────────────────────────────────────────────────────
const ratingScore = (rating, maxPts = config.weights.rating) => {
  if (!rating) return 0;
  return (rating / 5) * maxPts;
};

// ── Popularity score ──────────────────────────────────────────────────────────
// Log scale so one viral product doesn't dominate.
const popularityScore = (numReviews, maxPts = config.weights.popularity) => {
  if (!numReviews || numReviews <= 0) return 0;
  return Math.min(maxPts, (Math.log(numReviews + 1) / Math.log(200)) * maxPts);
};

// ── Recency score ─────────────────────────────────────────────────────────────
const recencyScore = (createdAt, maxPts = config.weights.recency) => {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  const b = config.recencyBands;
  if (ageDays <= 7)  return maxPts * b.days7;
  if (ageDays <= 30) return maxPts * b.days30;
  if (ageDays <= 90) return maxPts * b.days90;
  return maxPts * b.older;
};

// ─────────────────────────────────────────────────────────────────────────────
// scoreProduct
// ─────────────────────────────────────────────────────────────────────────────
// candidate : plain product object
// signals   : { category, anchorPrice, sellerId, favCategories: [{category,weight}] }
//             all optional — missing signals → neutral score
// Returns candidate with `_score` and `_scoreParts` (for explain-why).
// ─────────────────────────────────────────────────────────────────────────────
const scoreProduct = (candidate, signals = {}) => {
  const {
    category      = null,
    anchorPrice   = null,
    sellerId      = null,
    favCategories = [],
  } = signals;

  const parts = {};

  // 1. Category match
  if (category && candidate.category === category) {
    parts.category = config.weights.categoryMatch;
  } else if (favCategories.length) {
    const favEntry = favCategories.find(f => f.category === candidate.category);
    parts.category = favEntry ? config.weights.categoryMatch * Math.min(1, favEntry.weight) : 0;
  } else {
    parts.category = 0;
  }

  // 2. Price proximity
  parts.price = priceProximityScore(candidate.price, anchorPrice);

  // 3. Same seller
  parts.seller = (sellerId && candidate.seller?.toString() === sellerId?.toString())
    ? config.weights.sameSeller
    : 0;

  // 4. Rating
  parts.rating = ratingScore(candidate.rating);

  // 5. Popularity
  parts.popularity = popularityScore(candidate.numReviews);

  // 6. Recency
  parts.recency = recencyScore(candidate.createdAt);

  const score = Object.values(parts).reduce((a, b) => a + b, 0);

  return { ...candidate, _score: Math.round(score), _scoreParts: parts };
};

// ─────────────────────────────────────────────────────────────────────────────
// applyDiversityGuard
// ─────────────────────────────────────────────────────────────────────────────
// Takes an already-ranked list and re-selects up to `limit` items while
// capping how many can come from the same seller / same category. Items that
// would exceed a cap are deferred, and only pulled back in if we'd otherwise
// fall short of `limit`. Preserves ranking order as much as possible.
// ─────────────────────────────────────────────────────────────────────────────
const applyDiversityGuard = (ranked, limit) => {
  const d = config.diversity;
  if (!d.enabled) return ranked.slice(0, limit);

  // If the row is essentially single-category (e.g. Similar Products, FBT, CAB),
  // the category cap is meaningless and would only sabotage seller diversity.
  const distinctCategories = new Set(ranked.map(p => p.category || 'none'));
  const useCategoryCap = d.maxPerCategory != null && distinctCategories.size > 1;

  const picked = [];
  const sellerCount = {};
  const categoryCount = {};

  // Single pass: take each ranked item only if it stays within BOTH caps.
  // This is a HARD cap — if the catalog can't fill `limit` within the caps,
  // the row is simply shorter. A short, genuinely diverse row is better (and
  // more honest) than a full row that silently violates the cap. As more
  // sellers/products enter a category, the row naturally grows and diversifies.
  for (const p of ranked) {
    if (picked.length >= limit) break;
    const sid = p.seller?.toString() || 'none';
    const cat = p.category || 'none';
    const sellerOk   = d.maxPerSeller == null || (sellerCount[sid]   || 0) < d.maxPerSeller;
    const categoryOk = !useCategoryCap        || (categoryCount[cat] || 0) < d.maxPerCategory;

    if (sellerOk && categoryOk) {
      picked.push(p);
      sellerCount[sid]   = (sellerCount[sid]   || 0) + 1;
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    }
    // else: skipped — the cap is hard, we never add a cap-violating item
  }

  return picked;
};

// ─────────────────────────────────────────────────────────────────────────────
// rankProducts  (content-based)
// ─────────────────────────────────────────────────────────────────────────────
const rankProducts = (products, signals = {}, options = {}) => {
  const { limit = 10, excludeIds = [], diversity = true } = options;
  const excludeSet = new Set(excludeIds.map(id => id.toString()));

  const scored = products
    .filter(p => !excludeSet.has(p._id.toString()))
    .filter(p => p.stock > 0)
    .filter(p => p.isActive !== false)
    .map(p => scoreProduct(p, signals));

  scored.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    if (b.rating  !== a.rating)  return b.rating  - a.rating;
    return (b.numReviews || 0) - (a.numReviews || 0);
  });

  return diversity ? applyDiversityGuard(scored, limit) : scored.slice(0, limit);
};

// ─────────────────────────────────────────────────────────────────────────────
// rankByCoOccurrence  (collaborative)
// ─────────────────────────────────────────────────────────────────────────────
const rankByCoOccurrence = (coCounts = {}, productMap = {}, options = {}) => {
  const { limit = 8, excludeIds = [], diversity = true } = options;
  const excludeSet = new Set(excludeIds.map(id => id.toString()));

  const ranked = Object.entries(coCounts)
    .filter(([pid]) => !excludeSet.has(pid))
    .map(([pid, count]) => {
      const product = productMap[pid];
      if (!product) return null;
      return { ...product, _coCount: count };
    })
    .filter(Boolean)
    .filter(p => p.stock > 0 && p.isActive !== false)
    .sort((a, b) => {
      if (b._coCount !== a._coCount) return b._coCount - a._coCount;
      if (b.rating   !== a.rating)   return b.rating   - a.rating;
      return (b.numReviews || 0) - (a.numReviews || 0);
    });

  return diversity ? applyDiversityGuard(ranked, limit) : ranked.slice(0, limit);
};

// ─────────────────────────────────────────────────────────────────────────────
// computeTrendingScore
// ─────────────────────────────────────────────────────────────────────────────
const computeTrendingScore = (purchaseSignals = [], halfLifeDays = config.decay.trendingHalfLife) => {
  return purchaseSignals.reduce((sum, s) => {
    const decay = timeDecay(s.purchasedAt, halfLifeDays);
    const qty   = Math.min(s.quantity || 1, 10);
    return sum + (decay * qty);
  }, 0);
};

// ─────────────────────────────────────────────────────────────────────────────
// buildFavCategories
// ─────────────────────────────────────────────────────────────────────────────
const buildFavCategories = (purchaseSignals = [], halfLifeDays = config.decay.favCategoryHalfLife) => {
  const scores = {};
  for (const s of purchaseSignals) {
    const decay = timeDecay(s.purchasedAt, halfLifeDays);
    scores[s.category] = (scores[s.category] || 0) + decay * (s.quantity || 1);
  }
  const max = Math.max(...Object.values(scores), 1);
  return Object.entries(scores)
    .map(([category, raw]) => ({ category, weight: raw / max }))
    .sort((a, b) => b.weight - a.weight);
};

// ─────────────────────────────────────────────────────────────────────────────
// reasonFromScoreParts  (explain-why for content-based results)
// ─────────────────────────────────────────────────────────────────────────────
// Looks at which signal contributed most and turns it into a human label.
// ─────────────────────────────────────────────────────────────────────────────
const reasonFromScoreParts = (product, anchorCategory = null) => {
  const parts = product._scoreParts || {};
  // Find the dominant contributing signal
  const entries = Object.entries(parts).sort((a, b) => b[1] - a[1]);
  const [topSignal, topVal] = entries[0] || [];

  if (!topVal || topVal === 0) return 'You might like this';

  switch (topSignal) {
    case 'category':
      return anchorCategory ? `More in ${product.category}` : `Popular in ${product.category}`;
    case 'price':   return 'Similar price range';
    case 'seller':  return 'From the same shop';
    case 'rating':  return product.rating >= 4.5 ? 'Highly rated' : 'Well rated';
    case 'popularity': return 'Popular choice';
    case 'recency': return 'New arrival';
    default:        return 'You might like this';
  }
};

// ── Co-occurrence reason (collaborative) ──────────────────────────────────────
const reasonFromCoCount = (product) => {
  const n = product._coCount || 0;
  if (n >= 3) return `Bought together ${n}×`;
  if (n === 2) return 'Often bought together';
  if (n === 1) return 'Bought together';
  return 'Frequently paired';
};

module.exports = {
  scoreProduct,
  rankProducts,
  rankByCoOccurrence,
  applyDiversityGuard,
  computeTrendingScore,
  buildFavCategories,
  reasonFromScoreParts,
  reasonFromCoCount,
  timeDecay,
  priceProximityScore,
  ratingScore,
  popularityScore,
  recencyScore,
};