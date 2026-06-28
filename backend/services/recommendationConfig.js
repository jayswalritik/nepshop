/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Recommendation Config  (backend/services/recommendationConfig.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Every tunable number in the recommendation system lives here — scoring
 * weights, time-decay half-lives, and the diversity guard. Change behaviour in
 * one place instead of hunting through the engine.
 *
 * This is intentionally a plain data object with no logic, so it's easy to
 * show in a report ("here are the parameters that drive the AI") and easy to
 * tune without touching algorithm code.
 * ─────────────────────────────────────────────────────────────────────────────
 */

module.exports = {
  // ── Content-based scoring weights (max points each signal contributes) ──────
  weights: {
    categoryMatch:  40, // exact category match (or favourite-category soft match)
    priceProximity: 20, // how close in price to the anchor
    sameSeller:     10, // same shop as the anchor product
    rating:         15, // product's average star rating (scaled)
    popularity:     15, // review count, log-scaled (demand proxy)
    recency:        10, // how recently the product was listed
  },

  // ── Price proximity bands (fraction of points awarded by price closeness) ───
  priceBands: {
    within20pct: 1.0,  // ±20% of anchor price → full points
    within50pct: 0.6,  // ±50% → 60%
    within100pct: 0.3, // ±100% → 30%
    beyond:      0.0,  // further → none
  },

  // ── Recency bands (fraction of recency points by product age) ───────────────
  recencyBands: {
    days7:   1.0,  // listed in last 7 days → full
    days30:  0.7,
    days90:  0.4,
    older:   0.1,
  },

  // ── Time-decay half-lives (days) ────────────────────────────────────────────
  // A signal this many days old counts for 50% of a fresh one.
  decay: {
    trendingHalfLife:  14, // trending reacts fast — recent sales matter most
    feedHalfLife:      60, // personal taste changes slowly — longer memory
    favCategoryHalfLife: 60,
  },

  // ── Blend factors ───────────────────────────────────────────────────────────
  blend: {
    trendingBoostInFeed: 0.2, // how much platform-trending nudges the personal feed
    coOccurrenceBoostInWishlist: 8, // points per co-purchase in wishlist recs
  },

  // ── Similar Products behaviour ──────────────────────────────────────────────
  similar: {
    defaultLimit:   8,  // how many to aim for
    minSameCategory: 1, // only widen beyond the anchor's category if FEWER than
                        // this many same-category matches exist — i.e. only for
                        // products essentially alone in their category. Keeps a
                        // "More in [category]" row from showing unrelated items
                        // just because the per-seller cap made it short.
  },

  // ── Diversity guard ─────────────────────────────────────────────────────────
  // Stops a single row from being dominated by one seller or one category.
  // Set a cap to null to disable that dimension.
  diversity: {
    maxPerSeller:   1, // at most N products from the same seller in one row
    maxPerCategory: 3, // at most N products from the same category in one row
    enabled:        true,
  },
};