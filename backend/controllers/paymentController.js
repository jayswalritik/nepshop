const asyncHandler = require('express-async-handler');
const axios        = require('axios');
const crypto       = require('crypto');
const Order        = require('../models/Order');
const Shipment     = require('../models/Shipment');
const User         = require('../models/User');
const {
  sendOrderStatusEmail,
} = require('../utils/emailService');

const Cart    = require('../models/Cart');
const Product = require('../models/Product');

const { groupItemsBySeller, allocateCouponDiscount, round2 } = require('../utils/orderPricing');
const { buildShipmentEmailView } = require('../utils/orderAggregate');
const { isSelected } = require('../utils/cartSelection');

// Helper — create order (+ per-seller shipments) from cart. Used by both the
// Khalti and eSewa verify handlers, AFTER payment is confirmed.
//
// verifiedPaidAmount (Rs, optional): what the payment gateway actually
// confirmed as paid, at verification time. When provided, the freshly
// recomputed selected-subset total is compared against it — if the cart
// changed (items deselected/removed/qty changed) between initiation and
// verification, the two can diverge, and this throws loudly instead of
// creating an order that doesn't match the money actually received.
const createOrderFromCart = async (userId, orderData, verifiedPaidAmount) => {
  const Order = require('../models/Order');

  const cart = await Cart.findOne({ customer: userId })
    .populate('items.product', 'name images price stock isActive seller discount');

  if (!cart || cart.items.length === 0) {
    throw new Error('Cart is empty');
  }

  // Selective checkout — only SELECTED items flow into the order.
  const selectedItems = cart.items.filter(isSelected);
  if (selectedItems.length === 0) {
    throw new Error('Select at least one item to check out');
  }

  // Validate stock
  const orderItems = [];
  for (const item of selectedItems) {
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

  const commissionRate = 5;
  const { groups, subtotal, deliveryCharge, commissionAmount } = groupItemsBySeller(orderItems, commissionRate);

  // ── Apply coupon (platform-funded — does not affect seller/commission) ──
  // Atomic redeem, same as orderController.placeOrder — checks + consumes
  // global usageLimit AND this customer's perUserLimit in one race-safe
  // update. Fails the coupon step cleanly (no discount) if the limits no
  // longer hold, same as any other invalid-coupon reason.
  let couponDiscount = 0;
  let couponCode     = null;
  if (orderData.couponCode) {
    const Coupon = require('../models/Coupon');
    const redemption = await Coupon.redeemFor(orderData.couponCode, userId, subtotal);
    if (redemption.ok) {
      couponDiscount = redemption.discount;
      couponCode     = redemption.coupon.code;
    }
  }

  const total = round2(subtotal + deliveryCharge - couponDiscount);

  // ── Mid-payment consistency guard ───────────────────────
  // The cart may have changed between payment initiation and this
  // verification step (a real time gap — the customer is off on the gateway
  // site). Compare the FRESH selected-subset total against what the gateway
  // actually verified as paid; on mismatch, do NOT create a wrong order.
  if (verifiedPaidAmount !== undefined && verifiedPaidAmount !== null && round2(verifiedPaidAmount) !== total) {
    // Undo the coupon redemption we just consumed — no order will be created,
    // so this customer's use of it must not be burned.
    if (couponCode) {
      const Coupon = require('../models/Coupon');
      await Coupon.restoreFor(couponCode, userId);
    }
    throw new Error(
      'Your cart changed after payment was started, so the verified amount no longer matches your order total. ' +
      'No order was created — your payment was not lost. Please contact support with your transaction details.'
    );
  }

  // Allocate the discount across items proportionally (mutates orderItems —
  // and groups[].items, same object references — see orderPricing.js).
  allocateCouponDiscount(orderItems, couponDiscount);

  const order = await Order.create({
    customer: userId,
    items:    orderItems,
    deliveryAddress:  orderData.deliveryAddress,
    paymentMethod:    orderData.paymentMethod,
    customerNote:     orderData.customerNote || '',
    subtotal,
    deliveryCharge,
    couponCode,
    couponDiscount,
    total,
    commissionRate,
    commissionAmount,
    status:        'pending',
    paymentStatus: 'paid',
  });

  const shipments = await Shipment.insertMany(groups.map(g => ({
    order:  order._id,
    seller: g.seller,
    items: g.items.map(i => ({
      product: i.product, name: i.name, image: i.image, price: i.price, quantity: i.quantity,
      couponAllocation: i.couponAllocation || 0,
    })),
    sellerSubtotal:   g.sellerSubtotal,
    deliveryCharge:   g.deliveryCharge,
    commissionRate:   g.commissionRate,
    commissionAmount: g.commissionAmount,
    deliveryEarning:  g.deliveryEarning,
    couponAllocation: round2(g.items.reduce((s, i) => s + (i.couponAllocation || 0), 0)),
  })));

  // Deduct stock — selected items only
  for (const item of selectedItems) {
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

  // Remove only the ordered (selected) items from the cart — unselected
  // items remain, exactly as they were.
  const orderedProductIds = selectedItems.map((item) => item.product._id);
  await Cart.updateOne(
    { customer: userId },
    { $pull: { items: { product: { $in: orderedProductIds } } } }
  );

  return { order, shipments };
};

// Helper — same grouping logic as order creation, computes the amount to
// charge at Khalti/eSewa initiation so it can NEVER drift from what
// createOrderFromCart charges after payment is confirmed. Callers pass the
// already-SELECTED subset (see initiateKhalti/initiateEsewa) — filtering
// happens at the call site, this stays a pure pricing pass-through.
const computeCartPricing = (cartItems, couponResult) => {
  // cartItems here are populated Cart.items — each has .product (with seller) and .price/.quantity
  const pseudoItems = cartItems.map(i => ({
    price: i.price, quantity: i.quantity, seller: i.product.seller,
  }));
  const { subtotal, deliveryCharge } = groupItemsBySeller(pseudoItems);
  const couponDiscount = couponResult?.discount || 0;
  const total = round2(subtotal + deliveryCharge - couponDiscount);
  return { subtotal, deliveryCharge, total };
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
    .populate('items.product', 'name price discount stock isActive seller');

  if (!cart || cart.items.length === 0) {
    res.status(400);
    throw new Error('Cart is empty');
  }

  // Selective checkout — only SELECTED items are charged/initiated.
  const selectedItems = cart.items.filter(isSelected);
  if (selectedItems.length === 0) {
    res.status(400);
    throw new Error('Select at least one item to check out');
  }

  // ── Apply coupon to the amount charged ──────────────────
  let couponDiscount = 0;
  let couponCode     = null;
  const rawSubtotal = selectedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  if (req.body.couponCode) {
    const Coupon = require('../models/Coupon');
    const coupon = await Coupon.findOne({ code: req.body.couponCode.toUpperCase().trim() });
    if (coupon) {
      const result = coupon.validateFor(rawSubtotal, req.user._id);
      if (result.valid) {
        couponDiscount = result.discount;
        couponCode     = coupon.code;
      }
    }
  }

  const { total } = computeCartPricing(selectedItems, { discount: couponDiscount });
  const amountInPaisa  = Math.round(total * 100);

  const orderData = {
    deliveryAddress,
    customerNote: customerNote || '',
    paymentMethod: 'khalti',
    couponCode, // passed through to order creation
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
    // Khalti reports the confirmed-paid amount in paisa — convert to Rs so
    // createOrderFromCart can compare it against the freshly recomputed
    // selected-subset total (mid-payment cart-drift guard).
    const verifiedPaidAmount = khaltiData.total_amount != null
      ? round2(khaltiData.total_amount / 100)
      : undefined;

    // Create order NOW after payment confirmed
    const { order, shipments } = await createOrderFromCart(req.user._id, orderData, verifiedPaidAmount);

    // Send emails
    const customer = await User.findById(req.user._id);
    const {
      sendOrderPlacedEmail,
      sendNewOrderToSeller,
    } = require('../utils/emailService');

    sendOrderPlacedEmail(customer, order);
    for (const shipment of shipments) {
      const seller = await User.findById(shipment.seller);
      if (seller) sendNewOrderToSeller(seller, buildShipmentEmailView(order, shipment));
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
    .populate('items.product', 'name price stock isActive seller');

  if (!cart || cart.items.length === 0) {
    res.status(400);
    throw new Error('Cart is empty');
  }

  // Selective checkout — only SELECTED items are charged/initiated.
  const selectedItems = cart.items.filter(isSelected);
  if (selectedItems.length === 0) {
    res.status(400);
    throw new Error('Select at least one item to check out');
  }

  // ── Apply coupon to the amount charged ──────────────────
  let couponDiscount = 0;
  let couponCode     = null;
  const rawSubtotal = selectedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  if (req.body.couponCode) {
    const Coupon = require('../models/Coupon');
    const coupon = await Coupon.findOne({ code: req.body.couponCode.toUpperCase().trim() });
    if (coupon) {
      const result = coupon.validateFor(rawSubtotal, req.user._id);
      if (result.valid) {
        couponDiscount = result.discount;
        couponCode     = coupon.code;
      }
    }
  }

  const { total } = computeCartPricing(selectedItems, { discount: couponDiscount });

  const orderData = {
    deliveryAddress,
    customerNote: customerNote || '',
    paymentMethod: 'esewa',
    couponCode, // passed through to order creation
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

    // Above: guards against the redirect payload being tampered with (gateway-
    // reported amount vs. what we told it to charge at initiation). Separately,
    // createOrderFromCart re-checks the verified amount against a FRESH
    // recompute of the selected cart subset — guards against the cart itself
    // changing during the gateway round-trip (see its verifiedPaidAmount doc).
    const { order, shipments } = await createOrderFromCart(req.user._id, parsedOrderData, parseFloat(totalAmount));

    const customer = await User.findById(req.user._id);
    const { sendOrderPlacedEmail, sendNewOrderToSeller } = require('../utils/emailService');
    sendOrderPlacedEmail(customer, order);
    for (const shipment of shipments) {
      const seller = await User.findById(shipment.seller);
      if (seller) sendNewOrderToSeller(seller, buildShipmentEmailView(order, shipment));
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
