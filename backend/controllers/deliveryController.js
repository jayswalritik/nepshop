const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const User  = require('../models/User');
const {
  sendOrderStatusEmail,
  sendOrderDeliveredToSeller,
} = require('../utils/emailService');

// ── Return window before seller funds are released ────────
// TESTING: 5 minutes. PRODUCTION: change to 7 days.
const RETURN_WINDOW_MINUTES = 5;
// const RETURN_WINDOW_MINUTES = 7 * 24 * 60; // ← uncomment for production (7 days)

// @desc  Get all orders assigned to delivery agent
// @route GET /api/delivery/orders
// @access Delivery agent only
const getDeliveryOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ deliveryAgent: req.user._id })
    .sort({ createdAt: -1 })
    .populate('customer', 'firstName lastName phone email');

  res.status(200).json({ success: true, orders });
});

// @desc  Mark order as delivered
// @route PUT /api/delivery/orders/:id/delivered
// @access Delivery agent only
const markDelivered = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  if (order.deliveryAgent?.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized');
  }

  if (order.status !== 'dispatched') {
    res.status(400);
    throw new Error('Order must be dispatched before marking as delivered');
  }

  order.status      = 'delivered';
  order.deliveredAt = new Date();

  // ── Settlement on delivery ──────────────────────────────
  // Agent's Rs 50 released immediately (work is done, unambiguous).
  // Seller share + commission locked for 7 days (return window).
  const deliveryEarning = order.deliveryEarning || 50;
  const sellerShare = +(order.subtotal - order.commissionAmount).toFixed(2);

  const lockUntil = new Date();
  lockUntil.setMinutes(lockUntil.getMinutes() + RETURN_WINDOW_MINUTES); // return window
  
  order.settlement = {
    ...order.settlement,
    status:              'partial', // agent paid, rest locked
    deliveryAgentPaid:   true,
    deliveryAgentPaidAt: new Date(),
    sellerShare:         sellerShare > 0 ? sellerShare : 0,
    sellerReleased:      false,
    sellerReleasedAt:    null,
    commissionBooked:    false,
    lockUntil:           lockUntil,
  };

  await order.save();

  // Send delivered email to customer
  const customer = await User.findById(order.customer);
  if (customer) sendOrderStatusEmail(customer, order, 'delivered');

  // Send delivered email to seller
  const sellerIds = [...new Set(order.items.map(i => i.seller.toString()))];
  for (const sellerId of sellerIds) {
    const seller = await User.findById(sellerId);
    if (seller) sendOrderDeliveredToSeller(seller, order);
  }

  res.status(200).json({
    success: true,
    message: 'Order marked as delivered',
    order,
  });
});

module.exports = { getDeliveryOrders, markDelivered };