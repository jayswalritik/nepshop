const mongoose = require('mongoose');

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ProductView  (backend/models/ProductView.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight first-party view-tracking for the recommendation system.
 * One document per view event (throttled to ~1/hour per user+product in the
 * adapter to keep the collection lean).
 *
 * A TTL index auto-deletes view events older than 30 days, so this collection
 * never grows unbounded — no manual cleanup job required.
 *
 * Powers:
 *   • Recently Viewed       (Phase 3)
 *   • future view-based signals (e.g. "trending by views")
 * ─────────────────────────────────────────────────────────────────────────────
 */
const productViewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    viewedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false } // viewedAt is all we need; skip createdAt/updatedAt overhead
);

// Fast "recent views for this user" queries
productViewSchema.index({ user: 1, viewedAt: -1 });

// Fast "view count for this product" queries (future view-based trending)
productViewSchema.index({ product: 1, viewedAt: -1 });

// TTL: MongoDB auto-deletes any document 30 days after its viewedAt.
// 30 days = 2,592,000 seconds.
productViewSchema.index({ viewedAt: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('ProductView', productViewSchema);