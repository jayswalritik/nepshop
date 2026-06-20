const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');

// @desc  Get all orders assigned to delivery agent
// @route GET /api/delivery/orders
// @access Delivery agent only
const getDeliveryOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ deliveryAgent: req.user._id })
    .sort({ createdAt: -1 })
    .populate('customer', 'firstName lastName phone');

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
  await order.save();

  res.status(200).json({
    success: true,
    message: 'Order marked as delivered',
    order,
  });
});

module.exports = { getDeliveryOrders, markDelivered };