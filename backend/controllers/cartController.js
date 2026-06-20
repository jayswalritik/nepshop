const asyncHandler = require('express-async-handler');
const Cart = require('../models/Cart');
const Product = require('../models/Product');

// ─────────────────────────────────────────────────────────
// @desc    Get customer's cart
// @route   GET /api/cart
// @access  Customer only
// ─────────────────────────────────────────────────────────
const getCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ customer: req.user._id })
    .populate('items.product', 'name images price stock isActive seller');

  if (!cart) {
    return res.status(200).json({
      success: true,
      cart: { items: [], total: 0, itemCount: 0 },
    });
  }

  // Filter out items whose product was deleted or deactivated
  const validItems = cart.items.filter(
    (item) => item.product && item.product.isActive
  );

  if (validItems.length !== cart.items.length) {
    cart.items = validItems;
    await cart.save();
  }

  const total = validItems.reduce(
    (sum, item) => sum + item.price * item.quantity, 0
  );
  const itemCount = validItems.reduce(
    (sum, item) => sum + item.quantity, 0
  );

  res.status(200).json({
    success: true,
    cart: { items: validItems, total, itemCount },
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Add item to cart
// @route   POST /api/cart
// @access  Customer only
// ─────────────────────────────────────────────────────────
const addToCart = asyncHandler(async (req, res) => {
  const { productId, quantity = 1 } = req.body;

  if (!productId) {
    res.status(400);
    throw new Error('Product ID is required');
  }

  // Validate product exists and is active
  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    res.status(404);
    throw new Error('Product not found or unavailable');
  }

  if (product.stock < quantity) {
    res.status(400);
    throw new Error(`Only ${product.stock} units available in stock`);
  }

  // Get or create cart
  let cart = await Cart.findOne({ customer: req.user._id });
  if (!cart) {
    cart = await Cart.create({ customer: req.user._id, items: [] });
  }

  // Check if product already in cart
  const existingItem = cart.items.find(
    (item) => item.product.toString() === productId
  );

  if (existingItem) {
    // Update quantity
    const newQty = existingItem.quantity + Number(quantity);
    if (newQty > product.stock) {
      res.status(400);
      throw new Error(`Cannot add more. Only ${product.stock} units available`);
    }
    existingItem.quantity = newQty;
  } else {
    // Add new item — snapshot the price
    const price = product.discount > 0
      ? +(product.price - (product.price * product.discount) / 100).toFixed(2)
      : product.price;

    cart.items.push({ product: productId, quantity: Number(quantity), price });
  }

  await cart.save();
  await cart.populate('items.product', 'name images price stock isActive');

  const total = cart.items.reduce(
    (sum, item) => sum + item.price * item.quantity, 0
  );
  const itemCount = cart.items.reduce(
    (sum, item) => sum + item.quantity, 0
  );

  res.status(200).json({
    success: true,
    message: 'Item added to cart',
    cart: { items: cart.items, total, itemCount },
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Update item quantity in cart
// @route   PUT /api/cart/:productId
// @access  Customer only
// ─────────────────────────────────────────────────────────
const updateCartItem = asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const { productId } = req.params;

  if (!quantity || quantity < 1) {
    res.status(400);
    throw new Error('Quantity must be at least 1');
  }

  const product = await Product.findById(productId);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  if (quantity > product.stock) {
    res.status(400);
    throw new Error(`Only ${product.stock} units available`);
  }

  const cart = await Cart.findOne({ customer: req.user._id });
  if (!cart) {
    res.status(404);
    throw new Error('Cart not found');
  }

  const item = cart.items.find(
    (i) => i.product.toString() === productId
  );
  if (!item) {
    res.status(404);
    throw new Error('Item not found in cart');
  }

  item.quantity = Number(quantity);
  await cart.save();
  await cart.populate('items.product', 'name images price stock isActive');

  const total = cart.items.reduce(
    (sum, i) => sum + i.price * i.quantity, 0
  );
  const itemCount = cart.items.reduce(
    (sum, i) => sum + i.quantity, 0
  );

  res.status(200).json({
    success: true,
    message: 'Cart updated',
    cart: { items: cart.items, total, itemCount },
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Remove item from cart
// @route   DELETE /api/cart/:productId
// @access  Customer only
// ─────────────────────────────────────────────────────────
const removeFromCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ customer: req.user._id });
  if (!cart) {
    res.status(404);
    throw new Error('Cart not found');
  }

  cart.items = cart.items.filter(
    (i) => i.product.toString() !== req.params.productId
  );

  await cart.save();

  const total = cart.items.reduce(
    (sum, i) => sum + i.price * i.quantity, 0
  );
  const itemCount = cart.items.reduce(
    (sum, i) => sum + i.quantity, 0
  );

  res.status(200).json({
    success: true,
    message: 'Item removed from cart',
    cart: { items: cart.items, total, itemCount },
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Clear entire cart
// @route   DELETE /api/cart
// @access  Customer only
// ─────────────────────────────────────────────────────────
const clearCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ customer: req.user._id });
  if (cart) {
    cart.items = [];
    await cart.save();
  }
  res.status(200).json({
    success: true,
    message: 'Cart cleared',
    cart: { items: [], total: 0, itemCount: 0 },
  });
});

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
};