const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');

// ─────────────────────────────────────────────────────────
// @desc    Place a new order from cart
// @route   POST /api/orders
// @access  Customer only
// ─────────────────────────────────────────────────────────
const placeOrder = asyncHandler(async (req, res) => {
  const { deliveryAddress, paymentMethod = 'cash_on_delivery', customerNote = '' } = req.body;

  // Validate delivery address
  if (!deliveryAddress?.fullName || !deliveryAddress?.phone ||
      !deliveryAddress?.street || !deliveryAddress?.city || !deliveryAddress?.district) {
    res.status(400);
    throw new Error('Complete delivery address is required');
  }

  // Get customer cart
  const cart = await Cart.findOne({ customer: req.user._id })
    .populate('items.product', 'name images price stock isActive seller discount');

  if (!cart || cart.items.length === 0) {
    res.status(400);
    throw new Error('Your cart is empty');
  }

  // Validate stock and build order items
  const orderItems = [];
  for (const item of cart.items) {
    const product = item.product;
    if (!product || !product.isActive) {
      res.status(400);
      throw new Error(`Product "${product?.name}" is no longer available`);
    }
    if (product.stock < item.quantity) {
      res.status(400);
      throw new Error(`Insufficient stock for "${product.name}". Only ${product.stock} left`);
    }
    orderItems.push({
      product:  product._id,
      name:     product.name,
      image:    product.images[0]?.url || '',
      price:    item.price,
      quantity: item.quantity,
      seller:   product.seller,
    });
  }

  // Calculate pricing
  const subtotal       = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const deliveryCharge = subtotal >= 2000 ? 0 : 100; // Free delivery above Rs 2000
  const total          = subtotal + deliveryCharge;
  const commissionRate = 5;
  const commissionAmount = +(total * commissionRate / 100).toFixed(2);

  // Create order
  const order = await Order.create({
    customer: req.user._id,
    items:    orderItems,
    deliveryAddress,
    paymentMethod,
    customerNote,
    subtotal,
    deliveryCharge,
    total,
    commissionRate,
    commissionAmount,
  });

  // Deduct stock for each product
  for (const item of cart.items) {
    await Product.findByIdAndUpdate(item.product._id, {
      $inc: { stock: -item.quantity },
    });
  }

  // Clear the cart
  cart.items = [];
  await cart.save();

  res.status(201).json({
    success: true,
    message: 'Order placed successfully',
    order,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Get customer's order history
// @route   GET /api/orders/my
// @access  Customer only
// ─────────────────────────────────────────────────────────
const getMyOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const query = { customer: req.user._id };
  if (status) query.status = status;

  const total  = await Order.countDocuments(query);
  const orders = await Order.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .populate('deliveryAgent', 'firstName lastName phone');

  res.status(200).json({
    success: true,
    total,
    page:       Number(page),
    totalPages: Math.ceil(total / limit),
    orders,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Get single order by ID
// @route   GET /api/orders/:id
// @access  Customer (own) / Seller (their items) / Admin
// ─────────────────────────────────────────────────────────
const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('customer',      'firstName lastName email phone')
    .populate('deliveryAgent', 'firstName lastName phone');

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Allow access to customer, seller, admin, or delivery agent
  const isCustomer      = order.customer._id.toString() === req.user._id.toString();
  const isSellerInOrder = order.items.some(i => i.seller.toString() === req.user._id.toString());
  const isAdmin         = req.user.role === 'admin';
  const isAgent         = order.deliveryAgent?.toString() === req.user._id.toString();

  if (!isCustomer && !isSellerInOrder && !isAdmin && !isAgent) {
    res.status(403);
    throw new Error('Not authorized to view this order');
  }

  res.status(200).json({ success: true, order });
});

// ─────────────────────────────────────────────────────────
// @desc    Cancel an order (customer)
// @route   PUT /api/orders/:id/cancel
// @access  Customer only
// ─────────────────────────────────────────────────────────
const cancelOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  if (order.customer.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized');
  }

  if (['dispatched', 'delivered', 'cancelled'].includes(order.status)) {
    res.status(400);
    throw new Error(`Cannot cancel order that is already ${order.status}`);
  }

  // Restore stock
  for (const item of order.items) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: item.quantity },
    });
  }

  order.status      = 'cancelled';
  order.cancelledAt = new Date();
  await order.save();

  res.status(200).json({
    success: true,
    message: 'Order cancelled successfully',
    order,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Get all orders for seller (their products only)
// @route   GET /api/orders/seller
// @access  Seller only
// ─────────────────────────────────────────────────────────
const getSellerOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;

  const query = { 'items.seller': req.user._id };
  if (status) query.status = status;

  const total  = await Order.countDocuments(query);
  const orders = await Order.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .populate('customer',      'firstName lastName phone')
    .populate('deliveryAgent', 'firstName lastName phone');

  res.status(200).json({
    success: true,
    total,
    page:       Number(page),
    totalPages: Math.ceil(total / limit),
    orders,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Update order status (seller)
// @route   PUT /api/orders/:id/status
// @access  Seller only
// ─────────────────────────────────────────────────────────
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, deliveryAgentId } = req.body;

  const validTransitions = {
    pending:    ['confirmed', 'cancelled'],
    confirmed:  ['packed', 'cancelled'],
    packed:     ['dispatched'],
    dispatched: ['delivered'],
  };

  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Verify seller owns items in this order
  const isSellerInOrder = order.items.some(
    i => i.seller.toString() === req.user._id.toString()
  );
  if (!isSellerInOrder) {
    res.status(403);
    throw new Error('Not authorized');
  }

  // Validate transition
  const allowed = validTransitions[order.status];
  if (!allowed || !allowed.includes(status)) {
    res.status(400);
    throw new Error(`Cannot change status from "${order.status}" to "${status}"`);
  }

  order.status = status;

  // Set timestamps
  if (status === 'confirmed')  order.confirmedAt  = new Date();
  if (status === 'packed')     order.packedAt     = new Date();
  if (status === 'dispatched') {
    order.dispatchedAt = new Date();
    if (deliveryAgentId) order.deliveryAgent = deliveryAgentId;

    // Save seller's shop address as pickup address
    const seller = await require('../models/User').findById(req.user._id)
      .select('shopName shopAddress');
    if (seller) {
      order.pickupAddress = {
        shopName: seller.shopName,
        street:   seller.shopAddress?.street,
        city:     seller.shopAddress?.city,
        district: seller.shopAddress?.district,
        phone:    seller.shopAddress?.phone,
      };
    }
  }
  if (status === 'delivered')  order.deliveredAt  = new Date();
  if (status === 'cancelled') {
    order.cancelledAt = new Date();
    // Restore stock on cancel
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: item.quantity },
      });
    }
  }

  await order.save();

  res.status(200).json({
    success: true,
    message: `Order status updated to "${status}"`,
    order,
  });
});

module.exports = {
  placeOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  getSellerOrders,
  updateOrderStatus,
};