const asyncHandler = require('express-async-handler');
const Return = require('../models/Return');
const Order  = require('../models/Order');
const User   = require('../models/User');

// ─────────────────────────────────────────────────────────
// @desc    Request a return
// @route   POST /api/returns
// @access  Customer only
// ─────────────────────────────────────────────────────────
const requestReturn = asyncHandler(async (req, res) => {
  const { orderId, reason, description } = req.body;

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
    throw new Error('You can only return delivered orders');
  }

  // Check if return already exists
  const existing = await Return.findOne({ order: orderId, customer: req.user._id });
  if (existing) {
    res.status(409);
    throw new Error('A return request already exists for this order');
  }

  // Check return window — 7 days after delivery
  const deliveredAt  = new Date(order.deliveredAt);
  const daysSince    = (Date.now() - deliveredAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince > 7) {
    res.status(400);
    throw new Error('Return window has expired. Returns are only accepted within 7 days of delivery.');
  }

  const returnItems = order.items.map(item => ({
    product:  item.product,
    name:     item.name,
    image:    item.image,
    quantity: item.quantity,
    price:    item.price,
  }));

  const returnRequest = await Return.create({
    order:        orderId,
    customer:     req.user._id,
    items:        returnItems,
    reason,
    description:  description || '',
    refundAmount: order.total,
  });

  // Update order status to returned
  order.status = 'returned';
  await order.save();

  res.status(201).json({
    success: true,
    message: 'Return request submitted. Admin will review and process your refund.',
    return:  returnRequest,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Get customer's return requests
// @route   GET /api/returns/my
// @access  Customer only
// ─────────────────────────────────────────────────────────
const getMyReturns = asyncHandler(async (req, res) => {
  const returns = await Return.find({ customer: req.user._id })
    .sort({ createdAt: -1 })
    .populate('order', '_id total status');

  res.status(200).json({ success: true, returns });
});

// ─────────────────────────────────────────────────────────
// @desc    Get all returns (admin)
// @route   GET /api/returns
// @access  Admin only
// ─────────────────────────────────────────────────────────
const getAllReturns = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const query = {};
  if (status) query.status = status;

  const returns = await Return.find(query)
    .sort({ createdAt: -1 })
    .populate('customer', 'firstName lastName email phone')
    .populate('order',    '_id total paymentMethod');

  res.status(200).json({ success: true, returns });
});

// ─────────────────────────────────────────────────────────
// @desc    Process a return (admin approve/reject)
// @route   PUT /api/returns/:id/process
// @access  Admin only
// ─────────────────────────────────────────────────────────
const processReturn = asyncHandler(async (req, res) => {
  const { status, adminNote, refundMethod } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    res.status(400);
    throw new Error('Status must be approved or rejected');
  }

  const returnRequest = await Return.findById(req.params.id)
    .populate('customer', 'firstName lastName email')
    .populate('order');

  if (!returnRequest) {
    res.status(404);
    throw new Error('Return request not found');
  }

  if (returnRequest.status !== 'pending') {
    res.status(400);
    throw new Error('Return request has already been processed');
  }

  returnRequest.status      = status;
  returnRequest.adminNote   = adminNote || '';
  returnRequest.processedBy = req.user._id;
  returnRequest.processedAt = new Date();

  if (status === 'approved') {
    returnRequest.refundMethod = refundMethod || 'original_payment';
    returnRequest.status       = 'refunded';

    // Update order payment status
    await Order.findByIdAndUpdate(returnRequest.order._id, {
      paymentStatus: 'refunded',
    });

    // Restore product stock
    const Product = require('../models/Product');
    for (const item of returnRequest.items) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: item.quantity },
      });
    }
  }

  await returnRequest.save();

  // Send email notification
  try {
    const { sendEmail } = require('../utils/emailService');
  } catch (e) {}

  res.status(200).json({
    success: true,
    message: `Return request ${status}`,
    return:  returnRequest,
  });
});

module.exports = {
  requestReturn,
  getMyReturns,
  getAllReturns,
  processReturn,
};