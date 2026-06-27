const asyncHandler = require('express-async-handler');
const axios        = require('axios');
const crypto       = require('crypto');
const Order        = require('../models/Order');
const User         = require('../models/User');
const {
  sendOrderStatusEmail,
} = require('../utils/emailService');

const Cart    = require('../models/Cart');
const Product = require('../models/Product');

// Helper — create order from cart
const createOrderFromCart = async (userId, orderData) => {
  const Order = require('../models/Order');

  const cart = await Cart.findOne({ customer: userId })
    .populate('items.product', 'name images price stock isActive seller discount');

  if (!cart || cart.items.length === 0) {
    throw new Error('Cart is empty');
  }

  // Validate stock
  const orderItems = [];
  for (const item of cart.items) {
    const product = item.product;
    if (!product || !product.isActive) {
      throw new Error(`Product "${product?.name}" is no longer available`);
    }
    if (product.stock < item.quantity) {
      throw new Error(`Insufficient stock for "${product.name}"`);
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

  const subtotal       = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const deliveryCharge = subtotal >= 2000 ? 0 : 100;
  const total          = subtotal + deliveryCharge;
  const commissionRate = 5;
  const commissionAmount = +(subtotal * commissionRate / 100).toFixed(2); // commission on product price only

  const order = await Order.create({
    customer: userId,
    items:    orderItems,
    deliveryAddress:  orderData.deliveryAddress,
    paymentMethod:    orderData.paymentMethod,
    customerNote:     orderData.customerNote || '',
    subtotal,
    deliveryCharge,
    total,
    commissionRate,
    commissionAmount,
    status:        'pending', // Seller still confirms — payment & fulfillment are separate
    paymentStatus: 'paid',    // Money is secured
  });

  // Deduct stock
  for (const item of cart.items) {
    const updated = await Product.findByIdAndUpdate(
      item.product._id,
      { $inc: { stock: -item.quantity } },
      { new: true }
    );
    if (updated && updated.stock <= 5 && updated.stock >= 0) {
      const seller = await User.findById(updated.seller);
      if (seller) {
        const { sendLowStockEmail } = require('../utils/emailService');
        sendLowStockEmail(seller, updated);
      }
    }
  }

  // Clear cart
  cart.items = [];
  await cart.save();

  return order;
};

// ─────────────────────────────────────────────────────────
// @desc    Initiate Khalti payment
// @route   POST /api/payment/khalti/initiate
// @access  Customer only
// ─────────────────────────────────────────────────────────

const initiateKhalti = asyncHandler(async (req, res) => {
  const { deliveryAddress, customerNote, cartSummary } = req.body;

  if (!deliveryAddress?.fullName || !deliveryAddress?.phone ||
      !deliveryAddress?.street || !deliveryAddress?.city || !deliveryAddress?.district) {
    res.status(400);
    throw new Error('Complete delivery address is required');
  }

  // Get cart to calculate amount
  const cart = await Cart.findOne({ customer: req.user._id })
    .populate('items.product', 'name price discount stock isActive');

  if (!cart || cart.items.length === 0) {
    res.status(400);
    throw new Error('Cart is empty');
  }

  const subtotal       = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const deliveryCharge = subtotal >= 2000 ? 0 : 100;
  const total          = subtotal + deliveryCharge;
  const amountInPaisa  = Math.round(total * 100);

  // Store order data in a temporary pending payment record
  // We use a simple approach — store in session via a temp field
  // We'll pass orderData back and store it on frontend
  const orderData = {
    deliveryAddress,
    customerNote: customerNote || '',
    paymentMethod: 'khalti',
    total,
  };

  const payload = {
    return_url:          `${process.env.FRONTEND_URL}/payment/khalti/verify`,
    website_url:          process.env.FRONTEND_URL,
    amount:               amountInPaisa,
    purchase_order_id:    `NEPSHOP-${req.user._id}-${Date.now()}`,
    purchase_order_name: `NepShop Order`,
    customer_info: {
      name:  `${req.user.firstName} ${req.user.lastName}`,
      email:  req.user.email,
      phone:  req.user.phone,
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
    success:    true,
    paymentUrl: response.data.payment_url,
    pidx:       response.data.pidx,
    orderData,  // Send back to frontend to store temporarily
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Verify Khalti payment after redirect
// @route   POST /api/payment/khalti/verify
// @access  Customer only
// ─────────────────────────────────────────────────────────
const verifyKhalti = asyncHandler(async (req, res) => {
  const { pidx, orderData } = req.body;

  if (!pidx || !orderData) {
    res.status(400);
    throw new Error('pidx and orderData are required');
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

  if (khaltiData.status === 'Completed') {
    // Create order NOW after payment confirmed
    const order = await createOrderFromCart(req.user._id, orderData);

    // Send emails
    const customer = await User.findById(req.user._id);
    const {
      sendOrderPlacedEmail,
      sendNewOrderToSeller,
    } = require('../utils/emailService');

    sendOrderPlacedEmail(customer, order);
    const sellerIds = [...new Set(order.items.map(i => i.seller.toString()))];
    for (const sellerId of sellerIds) {
      const seller = await User.findById(sellerId);
      if (seller) sendNewOrderToSeller(seller, order);
    }

    return res.status(200).json({
      success: true,
      message: 'Payment successful — order placed!',
      order,
    });
  }

  // Payment failed — don't create order, cart stays intact
  res.status(400).json({
    success: false,
    message: khaltiData.status === 'User canceled'
      ? 'Payment was cancelled. Your cart is still saved.'
      : `Payment ${khaltiData.status}. Please try again.`,
    status: khaltiData.status,
  });
});


// ─────────────────────────────────────────────────────────
// @desc    Initiate eSewa payment
// @route   POST /api/payment/esewa/initiate
// @access  Customer only
// ─────────────────────────────────────────────────────────
const initiateEsewa = asyncHandler(async (req, res) => {
  const { deliveryAddress, customerNote } = req.body;

  if (!deliveryAddress?.fullName || !deliveryAddress?.phone ||
      !deliveryAddress?.street || !deliveryAddress?.city || !deliveryAddress?.district) {
    res.status(400);
    throw new Error('Complete delivery address is required');
  }

  const cart = await Cart.findOne({ customer: req.user._id })
    .populate('items.product', 'name price stock isActive');

  if (!cart || cart.items.length === 0) {
    res.status(400);
    throw new Error('Cart is empty');
  }

  const subtotal       = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const deliveryCharge = subtotal >= 2000 ? 0 : 100;
  const total          = subtotal + deliveryCharge;

  const orderData = {
    deliveryAddress,
    customerNote: customerNote || '',
    paymentMethod: 'esewa',
    total,
  };

  const transactionUuid = `NEPSHOP-${req.user._id}-${Date.now()}`;
  const crypto = require('crypto');
  const message = `total_amount=${total},transaction_uuid=${transactionUuid},product_code=${process.env.ESEWA_MERCHANT_ID}`;
  const signature = crypto
    .createHmac('sha256', process.env.ESEWA_SECRET_KEY)
    .update(message)
    .digest('base64');

  // Encode orderData to pass through eSewa redirect
  const encodedOrderData = Buffer.from(JSON.stringify(orderData)).toString('base64');

  res.status(200).json({
    success:    true,
    gatewayUrl: `${process.env.ESEWA_GATEWAY_URL}/api/epay/main/v2/form`,
    transactionUuid,
    orderData,
    formData: {
      amount:                    total,
      tax_amount:                0,
      total_amount:              total,
      transaction_uuid:          transactionUuid,
      product_code:              process.env.ESEWA_MERCHANT_ID,
      product_service_charge:    0,
      product_delivery_charge:   0,
      success_url: `${process.env.FRONTEND_URL}/payment/esewa/verify?orderData=${encodedOrderData}`,
      failure_url: `${process.env.FRONTEND_URL}/payment/failed`,
      signed_field_names:        'total_amount,transaction_uuid,product_code',
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
  const { data, orderData } = req.body;

  if (!data || !orderData) {
    res.status(400);
    throw new Error('data and orderData are required');
  }

  const decoded     = JSON.parse(Buffer.from(data, 'base64').toString('utf-8'));
  const status      = decoded.status;
  const totalAmount = decoded.total_amount;

  if (status === 'COMPLETE') {
    const parsedOrderData = typeof orderData === 'string'
      ? JSON.parse(Buffer.from(orderData, 'base64').toString('utf-8'))
      : orderData;

    if (parseFloat(totalAmount) !== parsedOrderData.total) {
      res.status(400);
      throw new Error('Payment amount mismatch');
    }

    const order = await createOrderFromCart(req.user._id, parsedOrderData);

    const customer = await User.findById(req.user._id);
    const { sendOrderPlacedEmail, sendNewOrderToSeller } = require('../utils/emailService');
    sendOrderPlacedEmail(customer, order);
    const sellerIds = [...new Set(order.items.map(i => i.seller.toString()))];
    for (const sellerId of sellerIds) {
      const seller = await User.findById(sellerId);
      if (seller) sendNewOrderToSeller(seller, order);
    }

    return res.status(200).json({
      success: true,
      message: 'eSewa payment verified — order placed!',
      order,
    });
  }

  res.status(400).json({
    success: false,
    message: 'eSewa payment failed. Your cart is still saved.',
  });
});

module.exports = {
  initiateKhalti,
  verifyKhalti,
  initiateEsewa,
  verifyEsewa,
};