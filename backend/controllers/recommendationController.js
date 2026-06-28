/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Recommendation Controller  (backend/controllers/recommendationController.js)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Routes (all under /api/recommendations):
 *
 *   GET /trending           → time-decayed best-sellers (public, no auth required)
 *   GET /similar/:productId → content-based "more like this" (public)
 *   GET /feed               → personalized home feed (protected, customer only)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const asyncHandler = require('express-async-handler');
const {
  getTrending,
  getSimilar,
  getPersonalizedFeed,
  getFrequentlyBoughtTogether,
  getCustomersAlsoBought,
  trackProductView,
  getRecentlyViewed,
  getCartRecommendations,
  getWishlistRecommendations,
} = require('../services/nepShopAdapter');

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Trending products — time-decayed purchase velocity
// @route   GET /api/recommendations/trending
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const getTrendingProducts = asyncHandler(async (req, res) => {
  const limit      = Math.min(parseInt(req.query.limit)  || 10, 20);
  const windowDays = Math.min(parseInt(req.query.days)   || 30, 90);

  const products = await getTrending({ limit, windowDays });

  res.json({
    success: true,
    count: products.length,
    products,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Similar products — content-based (category, price, seller)
// @route   GET /api/recommendations/similar/:productId
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const getSimilarProducts = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 8, 16);

  const products = await getSimilar(productId, { limit });

  res.json({
    success: true,
    count: products.length,
    products,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Personalized home feed — hybrid (history + trending + cold-start)
// @route   GET /api/recommendations/feed
// @access  Protected (customer)
// ─────────────────────────────────────────────────────────────────────────────
const getPersonalizedHomeFeed = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 16, 32);

  const products = await getPersonalizedFeed(req.user._id, { limit });

  res.json({
    success: true,
    count: products.length,
    products,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Frequently bought together — same-basket co-occurrence
// @route   GET /api/recommendations/bought-together/:productId
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const getBoughtTogether = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 6, 12);

  const products = await getFrequentlyBoughtTogether(productId, { limit });

  res.json({
    success: true,
    count: products.length,
    products,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Customers also bought — customer-level co-purchase affinity
// @route   GET /api/recommendations/also-bought/:productId
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const getAlsoBought = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 8, 16);

  const products = await getCustomersAlsoBought(productId, { limit });

  res.json({
    success: true,
    count: products.length,
    products,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Track a product view (lightweight, fire-and-forget from the client)
// @route   POST /api/recommendations/track-view/:productId
// @access  Protected (customer)
// ─────────────────────────────────────────────────────────────────────────────
const trackView = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  // Never let a tracking failure break the user's flow — respond 200 regardless
  try {
    await trackProductView(req.user._id, productId);
  } catch (err) {
    console.error('View tracking failed:', err.message);
  }

  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Recently viewed products for the logged-in customer
// @route   GET /api/recommendations/recently-viewed
// @access  Protected (customer)
// ─────────────────────────────────────────────────────────────────────────────
const getRecentlyViewedProducts = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 20);

  const products = await getRecentlyViewed(req.user._id, { limit });

  res.json({
    success: true,
    count: products.length,
    products,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Cart recommendations — "complete your cart"
// @route   GET /api/recommendations/cart
// @access  Protected (customer)
// ─────────────────────────────────────────────────────────────────────────────
const getCartRecs = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 8, 16);

  const products = await getCartRecommendations(req.user._id, { limit });

  res.json({
    success: true,
    count: products.length,
    products,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Wishlist recommendations — "more you'll love"
// @route   GET /api/recommendations/wishlist
// @access  Protected (customer)
// ─────────────────────────────────────────────────────────────────────────────
const getWishlistRecs = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 8, 16);

  const products = await getWishlistRecommendations(req.user._id, { limit });

  res.json({
    success: true,
    count: products.length,
    products,
  });
});

module.exports = {
  getTrendingProducts,
  getSimilarProducts,
  getPersonalizedHomeFeed,
  getBoughtTogether,
  getAlsoBought,
  trackView,
  getRecentlyViewedProducts,
  getCartRecs,
  getWishlistRecs,
};