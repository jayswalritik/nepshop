const asyncHandler = require('express-async-handler');
const User    = require('../models/User');
const Product = require('../models/Product');

// @desc  Get current user's wishlist
// @route GET /api/wishlist
// @access Customer
const getWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate({
    path: 'wishlist',
    select: 'name images price stock discount category isActive seller',
  });

  // Filter out any products that were deleted/deactivated
  const wishlist = (user.wishlist || []).filter(p => p && p.isActive);

  res.status(200).json({ success: true, wishlist });
});

// @desc  Add a product to wishlist
// @route POST /api/wishlist/:productId
// @access Customer
const addToWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  const product = await Product.findById(productId);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  const user = await User.findById(req.user._id);

  // Avoid duplicates
  if (user.wishlist.some(id => id.toString() === productId)) {
    return res.status(200).json({ success: true, message: 'Already in wishlist' });
  }

  user.wishlist.push(productId);
  await user.save();

  res.status(200).json({ success: true, message: 'Added to wishlist' });
});

// @desc  Remove a product from wishlist
// @route DELETE /api/wishlist/:productId
// @access Customer
const removeFromWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  const user = await User.findById(req.user._id);
  user.wishlist = user.wishlist.filter(id => id.toString() !== productId);
  await user.save();

  res.status(200).json({ success: true, message: 'Removed from wishlist' });
});

module.exports = {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
};