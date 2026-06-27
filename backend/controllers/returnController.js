const asyncHandler = require('express-async-handler');
const Return = require('../models/Return');
const Order  = require('../models/Order');
const User   = require('../models/User');

// ── Return request window after delivery ──────────────────
// TESTING: 5 minutes. PRODUCTION: change to 7 days.
const RETURN_WINDOW_MINUTES = 5;
// const RETURN_WINDOW_MINUTES = 7 * 24 * 60; // ← uncomment for production (7 days)

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

  // Check return window
  const deliveredAt    = new Date(order.deliveredAt);
  const minutesSince   = (Date.now() - deliveredAt.getTime()) / (1000 * 60);
  if (minutesSince > RETURN_WINDOW_MINUTES) {
    res.status(400);
    throw new Error('Return window has expired. Returns are no longer accepted for this order.');
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

  // Freeze settlement — escrow must NOT auto-release while a return is pending.
  // Order status becomes 'returned' to reflect a return is in progress.
  order.status = 'returned';
  if (order.settlement) {
    order.settlement.status = 'return_pending'; // cron skips this — money frozen
  }
  await order.save();

  // Send emails
  const {
    sendReturnRequestEmail,
    sendReturnRequestToSeller,
  } = require('../utils/emailService');

  const customer = await User.findById(req.user._id);
  if (customer) sendReturnRequestEmail(customer, returnRequest, order);

  // Notify seller
  const sellerIds = [...new Set(order.items.map(i => i.seller.toString()))];
  for (const sellerId of sellerIds) {
    const seller = await User.findById(sellerId);
    if (seller) sendReturnRequestToSeller(seller, returnRequest, order);
  }

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
// @desc    Process a return (admin approve/reject + assign pickup)
// @route   PUT /api/returns/:id/process
// @access  Admin only
// ─────────────────────────────────────────────────────────
const processReturn = asyncHandler(async (req, res) => {
  const { status, adminNote, refundMethod, fault, returnAgentId } = req.body;

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

  const order = await Order.findById(returnRequest.order._id);

  returnRequest.adminNote   = adminNote || '';
  returnRequest.processedBy = req.user._id;
  returnRequest.processedAt = new Date();

  // ── REJECTED ────────────────────────────────────────────
  if (status === 'rejected') {
    returnRequest.status = 'rejected';
    await returnRequest.save();

    // Unfreeze settlement — return back to normal, cron will release it
    if (order && order.settlement) {
      order.settlement.status = 'partial';
      order.status = 'delivered'; // restore delivered status
      await order.save();
    }

    const { sendReturnRejectedEmail } = require('../utils/emailService');
    const customer = await User.findById(returnRequest.customer._id);
    if (customer) sendReturnRejectedEmail(customer, returnRequest, returnRequest.order);

    return res.status(200).json({
      success: true,
      message: 'Return request rejected. Seller funds will release normally.',
      return:  returnRequest,
    });
  }

  // ── APPROVED ────────────────────────────────────────────
  // Require fault confirmation and a pickup agent
  if (!fault || !['seller', 'customer'].includes(fault)) {
    res.status(400);
    throw new Error('Please confirm who is at fault (seller or customer) before approving');
  }
  if (!returnAgentId) {
    res.status(400);
    throw new Error('Please assign a delivery agent for the return pickup');
  }

  returnRequest.status       = 'approved';
  returnRequest.fault        = fault;
  returnRequest.returnAgent  = returnAgentId;
  returnRequest.refundMethod = refundMethod || 'original_payment';
  await returnRequest.save();

  // Mark order as return-assigned and store fault on settlement
  if (order) {
    order.status = 'return_assigned';
    if (order.settlement) {
      order.settlement.returnFault       = fault;
      order.settlement.returnPickupAgent = returnAgentId;
      order.settlement.status            = 'return_pending'; // still frozen
    }
    await order.save();
  }

  // Email the customer — return approved, pickup coming
  const { sendReturnApprovedEmail } = require('../utils/emailService');
  const customer = await User.findById(returnRequest.customer._id);
  if (customer) sendReturnApprovedEmail(customer, returnRequest, returnRequest.order);

  res.status(200).json({
    success: true,
    message: `Return approved. Fault: ${fault}. Pickup agent assigned.`,
    return:  returnRequest,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Get return-pickup jobs assigned to this delivery agent
// @route   GET /api/returns/pickups
// @access  Delivery agent only
// ─────────────────────────────────────────────────────────
const getMyReturnPickups = asyncHandler(async (req, res) => {
  const returns = await Return.find({
    returnAgent: req.user._id,
    status: { $in: ['approved', 'picked_up'] },
  })
    .sort({ createdAt: -1 })
    .populate('customer', 'firstName lastName phone')
    .populate('order', '_id total deliveryAddress pickupAddress items');

  res.status(200).json({ success: true, returns });
});

// ─────────────────────────────────────────────────────────
// @desc    Agent marks return as picked up from customer
// @route   PUT /api/returns/:id/pickup
// @access  Delivery agent only
// ─────────────────────────────────────────────────────────
const markReturnPickedUp = asyncHandler(async (req, res) => {
  const returnRequest = await Return.findById(req.params.id);
  if (!returnRequest) {
    res.status(404);
    throw new Error('Return request not found');
  }
  if (returnRequest.returnAgent?.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized — this return is not assigned to you');
  }
  if (returnRequest.status !== 'approved') {
    res.status(400);
    throw new Error('This return is not ready for pickup');
  }

  returnRequest.status     = 'picked_up';
  returnRequest.pickedUpAt = new Date();
  await returnRequest.save();

  // Update order status
  await Order.findByIdAndUpdate(returnRequest.order, {
    status: 'return_in_transit',
  });

  res.status(200).json({
    success: true,
    message: 'Return marked as picked up. Now deliver it to the seller.',
    return:  returnRequest,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Agent marks return as returned to seller → FIRES REVERSAL
// @route   PUT /api/returns/:id/complete
// @access  Delivery agent only
// ─────────────────────────────────────────────────────────
const completeReturn = asyncHandler(async (req, res) => {
  const returnRequest = await Return.findById(req.params.id)
    .populate('customer', 'firstName lastName email');
  if (!returnRequest) {
    res.status(404);
    throw new Error('Return request not found');
  }
  if (returnRequest.returnAgent?.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized — this return is not assigned to you');
  }
  if (returnRequest.status !== 'picked_up') {
    res.status(400);
    throw new Error('This return must be picked up before completing');
  }

  const order = await Order.findById(returnRequest.order);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // ══ FAULT-BASED REVERSAL MATH ══════════════════════════
  const fault          = returnRequest.fault;
  const subtotal       = order.subtotal;
  const commission     = order.commissionAmount;
  const forwardDelivery = order.deliveryEarning || 50; // Rs 50 already paid to forward agent
  const returnDelivery  = returnRequest.returnAgentEarning || 50; // Rs 50 to return agent

  let refundToCustomer = 0;
  let sellerBears = 0;
  let customerBears = 0;

  if (fault === 'seller') {
    // Seller's fault: customer made 100% whole (full total incl. delivery)
    refundToCustomer = order.total;
    // Seller bears both delivery legs
    sellerBears = forwardDelivery + returnDelivery;
  } else {
    // Customer's choice: refund product minus BOTH delivery legs
    refundToCustomer = Math.max(0, subtotal - forwardDelivery - returnDelivery);
    customerBears = forwardDelivery + returnDelivery;
  }

  // ── Apply settlement reversal ───────────────────────────
  order.status = 'returned';
  if (order.settlement) {
    order.settlement.status              = 'refunded';
    order.settlement.sellerReleased      = false;   // seller share reversed (never released)
    order.settlement.sellerShare         = 0;       // seller earns nothing on returned order
    order.settlement.commissionBooked    = false;   // commission reversed
    order.settlement.returnFault         = fault;
    order.settlement.returnPickupAgent   = returnRequest.returnAgent;
    order.settlement.returnPickupEarning = returnDelivery;
    order.settlement.refundToCustomer    = refundToCustomer;
    order.settlement.sellerBearsDelivery = sellerBears;
    order.settlement.customerBearsDelivery = customerBears;
    order.settlement.settledAt           = new Date();
  }
  order.paymentStatus = 'refunded';
  await order.save();

  // ── Complete the return record ──────────────────────────
  returnRequest.status             = 'refunded';
  returnRequest.returnedToSellerAt = new Date();
  returnRequest.refundAmount       = refundToCustomer;
  await returnRequest.save();

  // ── Restore stock to seller ─────────────────────────────
  const Product = require('../models/Product');
  for (const item of returnRequest.items) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: item.quantity },
    });
  }

  // ── Email customer that refund is processed ─────────────
  const { sendReturnApprovedEmail } = require('../utils/emailService');
  const customer = await User.findById(returnRequest.customer._id);
  if (customer) sendReturnApprovedEmail(customer, returnRequest, order);

  res.status(200).json({
    success: true,
    message: `Return completed. Customer refunded Rs ${refundToCustomer}. Agent earned Rs ${returnDelivery}.`,
    return:  returnRequest,
  });
});

module.exports = {
  requestReturn,
  getMyReturns,
  getAllReturns,
  processReturn,
  getMyReturnPickups,
  markReturnPickedUp,
  completeReturn,
};