const asyncHandler = require('express-async-handler');
const Review  = require('../models/Review');
const Order   = require('../models/Order');
const Product = require('../models/Product');

// ─────────────────────────────────────────────────────────
// @desc    Add a review
// @route   POST /api/reviews
// @access  Customer only
// ─────────────────────────────────────────────────────────
const addReview = asyncHandler(async (req, res) => {
  const { productId, orderId, rating, comment } = req.body;

  if (!productId || !orderId || !rating || !comment) {
    res.status(400);
    throw new Error('Product, order, rating and comment are all required');
  }

  // Verify the order exists, belongs to customer, and is delivered
  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  if (order.customer.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized');
  }
  if (order.status !== 'delivered') {
    res.status(400);
    throw new Error('You can only review products from delivered orders');
  }

  // Verify product is in the order
  const itemInOrder = order.items.find(
    i => i.product.toString() === productId
  );
  if (!itemInOrder) {
    res.status(400);
    throw new Error('This product is not in your order');
  }

  // Check if already reviewed
  const existing = await Review.findOne({
    product:  productId,
    customer: req.user._id,
    order:    orderId,
  });
  if (existing) {
    res.status(409);
    throw new Error('You have already reviewed this product for this order');
  }

  const review = await Review.create({
    product:  productId,
    customer: req.user._id,
    order:    orderId,
    rating:   Number(rating),
    comment,
  });

  await review.populate('customer', 'firstName lastName');

  res.status(201).json({
    success: true,
    message: 'Review added successfully',
    review,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Get reviews for a product
// @route   GET /api/reviews/:productId
// @access  Public
// ─────────────────────────────────────────────────────────
const getProductReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ product: req.params.productId })
    .populate('customer', 'firstName lastName')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    total: reviews.length,
    reviews,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Get reviews for seller's products
// @route   GET /api/reviews/seller
// @access  Seller only
// ─────────────────────────────────────────────────────────
const getSellerReviews = asyncHandler(async (req, res) => {
  // Get all products by this seller
  const products = await Product.find({ seller: req.user._id }).select('_id');
  const productIds = products.map(p => p._id);

  const reviews = await Review.find({ product: { $in: productIds } })
    .populate('customer', 'firstName lastName')
    .populate('product',  'name images')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    total: reviews.length,
    reviews,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Delete a review
// @route   DELETE /api/reviews/:id
// @access  Customer (own review) or Admin
// ─────────────────────────────────────────────────────────
const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) {
    res.status(404);
    throw new Error('Review not found');
  }

  const isOwner = review.customer.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';

  if (!isOwner && !isAdmin) {
    res.status(403);
    throw new Error('Not authorized to delete this review');
  }

  await review.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Review deleted successfully',
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Check if customer can review a product
// @route   GET /api/reviews/can-review/:productId
// @access  Customer only
// ─────────────────────────────────────────────────────────
const canReview = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  // Find delivered orders containing this product
  const order = await Order.findOne({
    customer: req.user._id,
    status:   'delivered',
    'items.product': productId,
  });

  if (!order) {
    return res.status(200).json({
      success: true,
      canReview: false,
      reason: 'You must purchase and receive this product before reviewing',
    });
  }

  // Check if already reviewed
  const existing = await Review.findOne({
    product:  productId,
    customer: req.user._id,
    order:    order._id,
  });

  if (existing) {
    return res.status(200).json({
      success: true,
      canReview: false,
      reason:    'You have already reviewed this product',
      review:    existing,
    });
  }

  res.status(200).json({
    success: true,
    canReview: true,
    orderId: order._id,
  });
});

module.exports = {
  addReview,
  getProductReviews,
  getSellerReviews,
  deleteReview,
  canReview,
};