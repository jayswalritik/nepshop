/**
 * Recommendation Routes  (backend/routes/recommendationRoutes.js)
 */

const express = require('express');
const router  = express.Router();
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const {
  getTrendingProducts,
  getSimilarProducts,
  getPersonalizedHomeFeed,
  getBoughtTogether,
  getAlsoBought,
  trackView,
  getRecentlyViewedProducts,
  getCartRecs,
  getWishlistRecs,
} = require('../controllers/recommendationController');

// ── Public — no auth required (works for guest visitors too) ──
router.get('/trending',                    getTrendingProducts);
router.get('/similar/:productId',          getSimilarProducts);

// Phase 2 — collaborative filtering (public)
router.get('/bought-together/:productId',  getBoughtTogether);
router.get('/also-bought/:productId',      getAlsoBought);

// ── Protected — logged-in customer only ──
router.get('/feed',             protect, authorizeRoles('customer'), getPersonalizedHomeFeed);

// Phase 3 — view tracking + cart/wishlist/recently-viewed (customer)
router.post('/track-view/:productId', protect, authorizeRoles('customer'), trackView);
router.get('/recently-viewed',        protect, authorizeRoles('customer'), getRecentlyViewedProducts);
router.get('/cart',                   protect, authorizeRoles('customer'), getCartRecs);
router.get('/wishlist',               protect, authorizeRoles('customer'), getWishlistRecs);

module.exports = router;