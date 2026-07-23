const asyncHandler = require('express-async-handler');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { isSelected, isStale } = require('../utils/cartSelection');
const { groupItemsBySeller, allocateCouponDiscount, round2 } = require('../utils/orderPricing');
const { buildCartSummary } = require('../utils/cartSummary');

// Nested-populates the seller's shop name too — the frontend groups the
// cart by seller (Daraz-style) and shows a seller-group header/checkbox.
const PRODUCT_POPULATE = {
  path: 'items.product',
  select: 'name images price stock isActive seller',
  populate: { path: 'seller', select: 'shopName firstName lastName' },
};

// Shapes a populated Cart document into the { items, total, itemCount }
// response every cart endpoint returns — items gain a computed `stale` flag
// (out of stock / deactivated) so the frontend can disable that checkbox.
// total/itemCount are ALL-items aggregates (unchanged meaning from before
// selective checkout existed) — the frontend derives selected-subset totals
// itself, the same way it already derives per-seller-group delivery.
const shapeCartResponse = (cart) => {
  const items = cart.items.map((item) => {
    const obj = item.toObject ? item.toObject() : item;
    return { ...obj, stale: isStale(item) };
  });
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  return { items, total, itemCount };
};

// ─────────────────────────────────────────────────────────
// @desc    Get customer's cart
// @route   GET /api/cart
// @access  Customer only
// ─────────────────────────────────────────────────────────
const getCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ customer: req.user._id })
    .populate(PRODUCT_POPULATE);

  if (!cart) {
    return res.status(200).json({
      success: true,
      cart: { items: [], total: 0, itemCount: 0 },
    });
  }

  // Drop items whose product was hard-deleted entirely — nothing to show or
  // flag. (Deactivated/out-of-stock items are handled differently below —
  // they stay in the cart, just auto-deselected + flagged.)
  const hasDeletedProduct = cart.items.some((item) => !item.product);
  if (hasDeletedProduct) {
    cart.items = cart.items.filter((item) => item.product);
  }

  // Stale = out of stock or deactivated — auto-deselect (never delete the
  // item or touch its quantity) so it can't accidentally ride along into a
  // checkout. Once already deselected, leave it alone (don't fight a
  // customer who re-selects it only to have it flip back on an identical
  // fetch — the checkbox itself stays disabled via the `stale` flag anyway).
  let selectionChanged = false;
  for (const item of cart.items) {
    if (isStale(item) && item.selected !== false) {
      item.selected = false;
      selectionChanged = true;
    }
  }

  if (hasDeletedProduct || selectionChanged) {
    await cart.save();
  }

  res.status(200).json({ success: true, cart: shapeCartResponse(cart) });
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
    // Add new item — snapshot the price, selected by default
    const price = product.discount > 0
      ? +(product.price - (product.price * product.discount) / 100).toFixed(2)
      : product.price;

    cart.items.push({ product: productId, quantity: Number(quantity), price, selected: true });
  }

  await cart.save();
  await cart.populate(PRODUCT_POPULATE);

  res.status(200).json({
    success: true,
    message: 'Item added to cart',
    cart: shapeCartResponse(cart),
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
  await cart.populate(PRODUCT_POPULATE);

  res.status(200).json({
    success: true,
    message: 'Cart updated',
    cart: shapeCartResponse(cart),
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Update selection (check/uncheck) for one or more cart items
// @route   PATCH /api/cart/selection
// @access  Customer only
// ─────────────────────────────────────────────────────────
// Body: { itemIds: [...], selected: bool } — itemIds may be cart-item _ids
// or product ids (whichever the caller has on hand); a single call covers
// single-item toggle, seller-group toggle, and select-all.
const updateSelection = asyncHandler(async (req, res) => {
  const { itemIds, selected } = req.body;

  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    res.status(400);
    throw new Error('itemIds must be a non-empty array');
  }
  if (typeof selected !== 'boolean') {
    res.status(400);
    throw new Error('selected must be true or false');
  }

  const cart = await Cart.findOne({ customer: req.user._id });
  if (!cart) {
    res.status(404);
    throw new Error('Cart not found');
  }

  const idSet = new Set(itemIds.map(String));
  let matched = 0;
  for (const item of cart.items) {
    if (idSet.has(item._id.toString()) || idSet.has(item.product.toString())) {
      item.selected = selected;
      matched++;
    }
  }

  if (matched === 0) {
    res.status(404);
    throw new Error('No matching items found in cart');
  }

  await cart.save();
  await cart.populate(PRODUCT_POPULATE);

  res.status(200).json({
    success: true,
    message: 'Selection updated',
    cart: shapeCartResponse(cart),
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
  await cart.populate(PRODUCT_POPULATE);

  res.status(200).json({
    success: true,
    message: 'Item removed from cart',
    cart: shapeCartResponse(cart),
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

// ─────────────────────────────────────────────────────────
// @desc    Checkout preview — per-seller packages, delivery, coupon
// @route   GET /api/cart/summary?coupon=CODE
// @access  Customer only
// ─────────────────────────────────────────────────────────
// Delegates ALL money math to the exact same helpers order creation uses
// (backend/controllers/orderController.js's placeOrder): groupItemsBySeller
// for per-seller packages/delivery (backend/utils/orderPricing.js), and
// allocateCouponDiscount for the per-line coupon split. The coupon check
// itself uses coupon.validateFor — the SAME instance method
// POST /coupons/validate calls (backend/controllers/couponController.js) —
// NOT Coupon.redeemFor, which order creation uses: redeemFor atomically
// CONSUMES the coupon's usage limits, which a preview must never do.
// Nothing in this handler computes a pricing formula of its own.
const getCartSummary = asyncHandler(async (req, res) => {
  // All summary assembly (cart load, eligibility filter, per-seller packages,
  // coupon preview, totals) lives in utils/cartSummary.js so services can reuse
  // it without HTTP. Behaviour is unchanged — the logic was moved, not altered.
  const summary = await buildCartSummary({
    userId: req.user._id,
    couponCode: req.query.coupon,
  });

  res.status(200).json({ success: true, summary });
});

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  updateSelection,
  removeFromCart,
  clearCart,
  getCartSummary,
};
