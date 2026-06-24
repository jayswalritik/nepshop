const asyncHandler = require('express-async-handler');
const axios        = require('axios');
const crypto       = require('crypto');
const Order        = require('../models/Order');
const User         = require('../models/User');
const {
  sendOrderStatusEmail,
} = require('../utils/emailService');

// ─────────────────────────────────────────────────────────
// @desc    Initiate Khalti payment
// @route   POST /api/payment/khalti/initiate
// @access  Customer only
// ─────────────────────────────────────────────────────────
const initiateKhalti = asyncHandler(async (req, res) => {
  const { orderId } = req.body;

  const order = await Order.findById(orderId)
    .populate('customer', 'firstName lastName email phone');

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  if (order.customer._id.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized');
  }

  if (order.paymentStatus === 'paid') {
    res.status(400);
    throw new Error('Order is already paid');
  }

  // Khalti expects amount in paisa (1 Rs = 100 paisa)
  const amountInPaisa = Math.round(order.total * 100);

  const payload = {
    return_url:    `${process.env.FRONTEND_URL}/payment/khalti/verify`,
    website_url:   process.env.FRONTEND_URL,
    amount:        amountInPaisa,
    purchase_order_id:   order._id.toString(),
    purchase_order_name: `NepShop Order #${order._id.toString().slice(-8).toUpperCase()}`,
    customer_info: {
      name:  `${order.customer.firstName} ${order.customer.lastName}`,
      email: order.customer.email,
      phone: order.customer.phone,
    },
  };

  const response = await axios.post(
    `${process.env.KHALTI_GATEWAY_URL}/epayment/initiate/`,
    payload,
    {
      headers: {
        Authorization: `Key ${process.env.KHALTI_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  res.status(200).json({
    success:     true,
    paymentUrl:  response.data.payment_url,
    pidx:        response.data.pidx,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Verify Khalti payment after redirect
// @route   POST /api/payment/khalti/verify
// @access  Customer only
// ─────────────────────────────────────────────────────────
const verifyKhalti = asyncHandler(async (req, res) => {
  const { pidx, orderId } = req.body;

  if (!pidx || !orderId) {
    res.status(400);
    throw new Error('pidx and orderId are required');
  }

  // Verify with Khalti
  const response = await axios.post(
    `${process.env.KHALTI_GATEWAY_URL}/epayment/lookup/`,
    { pidx },
    {
      headers: {
        Authorization: `Key ${process.env.KHALTI_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const khaltiData = response.data;

  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  if (khaltiData.status === 'Completed') {
    order.paymentStatus = 'paid';
    order.status        = 'confirmed';
    order.confirmedAt   = new Date();
    await order.save();

    // Clear cart only after successful payment
    const Cart = require('../models/Cart');
    const cart = await Cart.findOne({ customer: order.customer });
    if (cart) { cart.items = []; await cart.save(); }

    // Notify customer
    const customer = await User.findById(order.customer);
    if (customer) sendOrderStatusEmail(customer, order, 'confirmed');

    return res.status(200).json({
      success: true,
      message: 'Payment successful',
      order,
    });
  }

  // Payment failed or pending
  order.paymentStatus = 'failed';
  await order.save();

  res.status(400).json({
    success: false,
    message: `Payment ${khaltiData.status}. Please try again.`,
    status:  khaltiData.status,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Initiate eSewa payment
// @route   POST /api/payment/esewa/initiate
// @access  Customer only
// ─────────────────────────────────────────────────────────
const initiateEsewa = asyncHandler(async (req, res) => {
  const { orderId } = req.body;

  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  if (order.customer.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized');
  }

  if (order.paymentStatus === 'paid') {
    res.status(400);
    throw new Error('Order is already paid');
  }

  // Generate eSewa signature
  // Format: total_amount,transaction_uuid,product_code
  const transactionUuid = `${order._id}-${Date.now()}`;
  const message = `total_amount=${order.total},transaction_uuid=${transactionUuid},product_code=${process.env.ESEWA_MERCHANT_ID}`;
  const signature = crypto
    .createHmac('sha256', process.env.ESEWA_SECRET_KEY)
    .update(message)
    .digest('base64');

  // Return form data for eSewa
  // eSewa uses form POST so we return the data and let frontend submit
  res.status(200).json({
    success:         true,
    gatewayUrl:      `${process.env.ESEWA_GATEWAY_URL}/api/epay/main/v2/form`,
    transactionUuid,
    formData: {
      amount:           order.total,
      tax_amount:       0,
      total_amount:     order.total,
      transaction_uuid: transactionUuid,
      product_code:     process.env.ESEWA_MERCHANT_ID,
      product_service_charge:  0,
      product_delivery_charge: 0,
      success_url: `${process.env.FRONTEND_URL}/payment/esewa/verify?orderId=${orderId}`,
      failure_url: `${process.env.FRONTEND_URL}/payment/failed?orderId=${orderId}`,
      signed_field_names: 'total_amount,transaction_uuid,product_code',
      signature,
    },
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Verify eSewa payment
// @route   POST /api/payment/esewa/verify
// @access  Customer only
// ─────────────────────────────────────────────────────────
const verifyEsewa = asyncHandler(async (req, res) => {
  const { orderId, data } = req.body;

  if (!data || !orderId) {
    res.status(400);
    throw new Error('data and orderId are required');
  }

  // Decode base64 response from eSewa
  const decoded     = JSON.parse(Buffer.from(data, 'base64').toString('utf-8'));
  const status      = decoded.status;
  const totalAmount = decoded.total_amount;

  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  if (status === 'COMPLETE') {
    // Verify amount matches
    if (parseFloat(totalAmount) !== order.total) {
      res.status(400);
      throw new Error('Payment amount mismatch');
    }

    order.paymentStatus = 'paid';
    order.status        = 'confirmed';
    order.confirmedAt   = new Date();
    await order.save();

    // Clear cart only after successful payment
    const Cart = require('../models/Cart');
    const cart = await Cart.findOne({ customer: order.customer });
    if (cart) { cart.items = []; await cart.save(); }

    // Notify customer
    const customer = await User.findById(order.customer);
    if (customer) sendOrderStatusEmail(customer, order, 'confirmed');

    return res.status(200).json({
      success: true,
      message: 'eSewa payment verified successfully',
      order,
    });
  }

  order.paymentStatus = 'failed';
  await order.save();

  res.status(400).json({
    success: false,
    message: 'eSewa payment failed or incomplete',
  });
});

module.exports = {
  initiateKhalti,
  verifyKhalti,
  initiateEsewa,
  verifyEsewa,
};