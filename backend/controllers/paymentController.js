const asyncHandler = require('express-async-handler');
const axios        = require('axios');
const crypto       = require('crypto');
const Order        = require('../models/Order');
const Shipment     = require('../models/Shipment');
const User         = require('../models/User');
const PendingPayment = require('../models/PendingPayment');
const {
  sendOrderStatusEmail,
} = require('../utils/emailService');
const {
  notifyOrderPlaced,
  notifyNewOrderForSeller,
} = require('../utils/notificationService');

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

// ── Return-URL allowlist ────────────────────────────────────────────────
// The client may request which "source" it's returning to (web browser vs.
// mobile app) but can NEVER supply a URL itself — every return URL handed
// to a gateway comes from this fixed map.
//
// mobile entries point at this backend's own https bridge pages
// (frontend/src/pages/payment/MobileReturn.jsx, routed at
// /payment/mobile-return/:target), NOT directly at nepshop://... — proven
// live that Khalti's /epayment/initiate/ rejects a non-http return_url
// ({"return_url":["Enter a valid URL."]}), and eSewa's success/failure URLs
// have the same http(s)-only requirement. MobileReturn's only job is to
// bounce the browser straight to the real nepshop:// deep link, carrying
// the gateway's query string through unchanged.
const RETURN_URLS = {
  web: {
    khalti: () => `${process.env.FRONTEND_URL}/payment/khalti/verify`,
    esewa: () => ({
      success: `${process.env.FRONTEND_URL}/payment/esewa/verify`,
      failure: `${process.env.FRONTEND_URL}/payment/failed`,
    }),
  },
  mobile: {
    khalti: () => `${process.env.FRONTEND_URL}/payment/mobile-return/khalti`,
    esewa: () => ({
      success: `${process.env.FRONTEND_URL}/payment/mobile-return/esewa`,
      failure: `${process.env.FRONTEND_URL}/payment/mobile-return/failed`,
    }),
  },
};

// Pure — HMAC-SHA256 signature eSewa requires over these three fields, in
// this exact order/format. Extracted so the mobile form-rebuild endpoint
// (esewaForm, below) and initiate-time signing can never drift apart from
// each other — both call this, neither duplicates the HMAC construction.
const buildEsewaSignature = (total, transactionUuid) => {
  const message = `total_amount=${total},transaction_uuid=${transactionUuid},product_code=${process.env.ESEWA_MERCHANT_ID}`;
  return crypto.createHmac('sha256', process.env.ESEWA_SECRET_KEY).update(message).digest('base64');
};

// Pure — the full eSewa gateway formData object. Used both by initiateEsewa
// (returned to web, which submits it as a DOM form) and esewaForm (rendered
// server-side as an auto-submitting HTML page for mobile). `total` must
// come from stored PendingPayment.orderData at rebuild time — never
// recomputed from the cart — so the amount eSewa is asked to charge can
// never drift from what was quoted at initiation.
const buildEsewaFormData = ({ total, transactionUuid, source }) => {
  const { success: successUrl, failure: failureUrl } = RETURN_URLS[source].esewa();
  return {
    amount:                    total,
    tax_amount:                0,
    total_amount:              total,
    transaction_uuid:          transactionUuid,
    product_code:              process.env.ESEWA_MERCHANT_ID,
    product_service_charge:    0,
    product_delivery_charge:   0,
    success_url: successUrl,
    failure_url: failureUrl,
    signed_field_names:        'total_amount,transaction_uuid,product_code',
    signature: buildEsewaSignature(total, transactionUuid),
  };
};

// Minimal HTML-attribute escaping for the server-rendered eSewa bridge form
// below — every value going through it is server-derived (stored total,
// generated transactionUuid, env-configured merchant id/URLs), never raw
// user input, but this is a PUBLIC unauthenticated endpoint so it's escaped
// defensively anyway.
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const esewaFormNotFoundHtml = () => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Payment session not found</title></head>
<body style="font-family:sans-serif;text-align:center;padding:48px 16px;">
<h2>Payment session not found or expired</h2>
<p>This payment link is no longer valid. Please return to the NepShop app and try again.</p>
</body></html>`;

const esewaFormHtml = (formData) => {
  const inputs = Object.entries(formData)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join('\n    ');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Redirecting to eSewa…</title></head>
<body style="font-family:sans-serif;text-align:center;padding:48px 16px;">
  <p>Redirecting to eSewa…</p>
  <form id="esewaForm" method="POST" action="${escapeHtml(process.env.ESEWA_GATEWAY_URL)}/api/epay/main/v2/form">
    ${inputs}
    <noscript><button type="submit">Continue to eSewa</button></noscript>
  </form>
  <script>document.getElementById('esewaForm').submit();</script>
</body></html>`;
};

const VALID_SOURCES = ['web', 'mobile'];

// undefined/omitted -> defaults to 'web' (matches the PendingPayment schema
// default, and keeps any caller that predates the `source` field working).
// Anything explicitly sent that isn't a known source is rejected.
const resolveSource = (source) => {
  if (source === undefined) return 'web';
  return VALID_SOURCES.includes(source) ? source : null;
};

// Shared verify-time lookup — both gateways look up their PendingPayment the
// same way, just keyed by a different gatewayRef (pidx vs. transaction_uuid).
// Distinguishes "already completed" (idempotent double-verify) from every
// other non-initiated state, per the idempotency requirement below.
const findInitiatedPendingPayment = async (gatewayRef, customerId) => {
  const pendingPayment = await PendingPayment.findOne({ gatewayRef, customer: customerId });

  if (!pendingPayment) {
    return { pendingPayment: null, error: 'Payment session not found or expired' };
  }
  if (pendingPayment.status === 'completed') {
    return { pendingPayment: null, error: 'Payment already processed' };
  }
  if (pendingPayment.status !== 'initiated') {
    return { pendingPayment: null, error: 'Payment session not found or expired' };
  }
  return { pendingPayment, error: null };
};

// ─────────────────────────────────────────────────────────
// @desc    Initiate Khalti payment
// @route   POST /api/payment/khalti/initiate
// @access  Customer only
// ─────────────────────────────────────────────────────────

const initiateKhalti = asyncHandler(async (req, res) => {
  const { deliveryAddress, customerNote, cartSummary } = req.body;

  const source = resolveSource(req.body.source);
  if (!source) {
    res.status(400);
    throw new Error('Invalid source');
  }

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
    return_url:           RETURN_URLS[source].khalti(),
    website_url:           process.env.FRONTEND_URL,
    amount:               amountInPaisa,
    purchase_order_id:    `NEPSHOP-${req.user._id}-${Date.now()}`,
    purchase_order_name: `NepShop Order`,
    customer_info: {
      name:  `${req.user.firstName} ${req.user.lastName}`,
      email:  req.user.email,
      phone:  req.user.phone,
    },
  };

  let response;
  try {
    response = await axios.post(
      `${process.env.KHALTI_GATEWAY_URL}/epayment/initiate/`,
      payload,
      {
        headers: {
          Authorization: `Key ${process.env.KHALTI_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (err) {
    // Log-and-rethrow only — does not change the error or the status code
    // the client ultimately receives. Kept (not just DIAG) because a Khalti-
    // side rejection would otherwise be silently swallowed into a bare 500
    // with no visibility into why (this is how the non-http return_url
    // rejection was originally diagnosed).
    console.error('Khalti initiate rejected:', err.response?.status, err.response?.data);
    throw err;
  }

  // Server-side pending-payment record — verify looks orderData up from
  // here by pidx instead of trusting anything the client sends back. If
  // this fails, do NOT hand the client a payment URL for a payment the
  // server won't be able to recognize on return (asyncHandler + the global
  // error handler turn an uncaught failure here into a 500, same as any
  // other unexpected error in this file).
  await PendingPayment.create({
    gateway:    'khalti',
    gatewayRef: response.data.pidx,
    customer:   req.user._id,
    orderData,
    source,
  });

  res.status(200).json({
    success:    true,
    paymentUrl: response.data.payment_url,
    pidx:       response.data.pidx,
    orderData,  // Kept for backward compatibility this deploy — web frontend no longer reads it.
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Verify Khalti payment after redirect
// @route   POST /api/payment/khalti/verify
// @access  Customer only
// ─────────────────────────────────────────────────────────
const verifyKhalti = asyncHandler(async (req, res) => {
  const { pidx } = req.body;

  if (!pidx) {
    res.status(400);
    throw new Error('pidx is required');
  }

  const { pendingPayment, error } = await findInitiatedPendingPayment(pidx, req.user._id);
  if (!pendingPayment) {
    res.status(400);
    throw new Error(error);
  }
  const orderData = pendingPayment.orderData;

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
    let order, shipments;
    try {
      ({ order, shipments } = await createOrderFromCart(req.user._id, orderData, verifiedPaidAmount));
    } catch (err) {
      // Cart-changed-mid-payment abort (or any other creation failure) —
      // this pidx did not result in an order, so it shouldn't be re-usable.
      pendingPayment.status = 'failed';
      await pendingPayment.save();
      throw err;
    }

    pendingPayment.status = 'completed';
    await pendingPayment.save();

    // Send emails
    const customer = await User.findById(req.user._id);
    const {
      sendOrderPlacedEmail,
      sendNewOrderToSeller,
    } = require('../utils/emailService');

    sendOrderPlacedEmail(customer, order);
    notifyOrderPlaced(customer, order);
    for (const shipment of shipments) {
      const seller = await User.findById(shipment.seller);
      if (seller) {
        const shipmentView = buildShipmentEmailView(order, shipment);
        sendNewOrderToSeller(seller, shipmentView);
        notifyNewOrderForSeller(seller, shipmentView);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Payment successful — order placed!',
      order,
    });
  }

  // Payment failed — don't create order, cart stays intact
  pendingPayment.status = 'failed';
  await pendingPayment.save();

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

  const source = resolveSource(req.body.source);
  if (!source) {
    res.status(400);
    throw new Error('Invalid source');
  }

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

  // Server-side pending-payment record — verify looks orderData up from
  // here by transaction_uuid instead of trusting anything the client sends
  // back (previously base64-encoded into success_url; no longer needed).
  // If this fails, do NOT hand the client a gateway form for a payment the
  // server won't be able to recognize on return.
  await PendingPayment.create({
    gateway:    'esewa',
    gatewayRef: transactionUuid,
    customer:   req.user._id,
    orderData,
    source,
  });

  // Public GET bridge — mobile opens this URL directly (a browser
  // address-bar navigation can't carry a JWT, so it has to be a plain URL,
  // not an API call the app makes itself). Prefers BACKEND_PUBLIC_URL (now
  // set in Render env + backend/.env) since it's authoritative and side
  // -steps the proxy issue below entirely. Falls back to the req-derived
  // construction when unset (e.g. an env that predates this var). CAVEAT on
  // the fallback only: Render (and most reverse-proxy deploys) terminates
  // TLS in front of the app and forwards plain HTTP internally —
  // req.protocol only reflects the original HTTPS request if Express has
  // `app.set('trust proxy', ...)` enabled, which server.js does not
  // currently set, so the fallback can render as http:// in production even
  // though the real public URL is https://.
  const formUrl = `${process.env.BACKEND_PUBLIC_URL || `${req.protocol}://${req.get('host')}`}/api/payment/esewa/form/${transactionUuid}`;

  res.status(200).json({
    success:    true,
    gatewayUrl: `${process.env.ESEWA_GATEWAY_URL}/api/epay/main/v2/form`,
    transactionUuid,
    orderData, // Kept for backward compatibility this deploy — web frontend no longer reads it.
    formData: buildEsewaFormData({ total, transactionUuid, source }),
    formUrl,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Rebuild + serve the eSewa gateway form as a self-submitting
//          HTML page, for clients that can't perform the form POST
//          themselves (mobile — see formUrl above)
// @route   GET /api/payment/esewa/form/:transactionUuid
// @access  PUBLIC — see security note below
// ─────────────────────────────────────────────────────────
//
// Why this exists: eSewa requires a real browser form POST of signed
// fields; expo-web-browser's openAuthSessionAsync can only GET-navigate to
// a URL (no method/body option), and browsers block top-level navigation to
// data: URIs — so mobile has nothing that can build+submit this form
// itself. initiateEsewa instead hands mobile a GET url (formUrl) to THIS
// endpoint, which renders the identical form web builds inline in the DOM,
// server-side, and auto-submits it.
//
// Security: this is a bare browser GET, so no Authorization header is
// possible — the access control is knowledge of a live, not-yet-used
// transactionUuid (unguessable: `NEPSHOP-${userId}-${Date.now()}`) whose
// PendingPayment is still status:'initiated' (same idempotency gate verify
// already relies on) and not past its 30-min TTL. The rendered form
// contains only fields eSewa itself receives on submit — nothing more
// sensitive than what initiateEsewa's JSON response already hands the web
// client today.
const esewaForm = asyncHandler(async (req, res) => {
  const { transactionUuid } = req.params;

  const pendingPayment = await PendingPayment.findOne({
    gateway: 'esewa',
    gatewayRef: transactionUuid,
    status: 'initiated',
  });

  if (!pendingPayment) {
    res.status(404).type('html').send(esewaFormNotFoundHtml());
    return;
  }

  const formData = buildEsewaFormData({
    total: pendingPayment.orderData.total, // stored at initiation — never recomputed here
    transactionUuid,
    source: pendingPayment.source,
  });

  res.type('html').send(esewaFormHtml(formData));
});

// ─────────────────────────────────────────────────────────
// @desc    Verify eSewa payment
// @route   POST /api/payment/esewa/verify
// @access  Customer only
// ─────────────────────────────────────────────────────────
const verifyEsewa = asyncHandler(async (req, res) => {
  const { data } = req.body;

  if (!data) {
    res.status(400);
    throw new Error('data is required');
  }

  const decoded     = JSON.parse(Buffer.from(data, 'base64').toString('utf-8'));
  const status      = decoded.status;
  const totalAmount = decoded.total_amount;
  const transactionUuid = decoded.transaction_uuid;

  if (!transactionUuid) {
    res.status(400);
    throw new Error('Payment session not found or expired');
  }

  const { pendingPayment, error } = await findInitiatedPendingPayment(transactionUuid, req.user._id);
  if (!pendingPayment) {
    res.status(400);
    throw new Error(error);
  }
  const parsedOrderData = pendingPayment.orderData;

  if (status === 'COMPLETE') {
    if (parseFloat(totalAmount) !== parsedOrderData.total) {
      pendingPayment.status = 'failed';
      await pendingPayment.save();
      res.status(400);
      throw new Error('Payment amount mismatch');
    }

    // Above: guards against the redirect payload being tampered with (gateway-
    // reported amount vs. what we told it to charge at initiation). Separately,
    // createOrderFromCart re-checks the verified amount against a FRESH
    // recompute of the selected cart subset — guards against the cart itself
    // changing during the gateway round-trip (see its verifiedPaidAmount doc).
    let order, shipments;
    try {
      ({ order, shipments } = await createOrderFromCart(req.user._id, parsedOrderData, parseFloat(totalAmount)));
    } catch (err) {
      pendingPayment.status = 'failed';
      await pendingPayment.save();
      throw err;
    }

    pendingPayment.status = 'completed';
    await pendingPayment.save();

    const customer = await User.findById(req.user._id);
    const { sendOrderPlacedEmail, sendNewOrderToSeller } = require('../utils/emailService');
    sendOrderPlacedEmail(customer, order);
    notifyOrderPlaced(customer, order);
    for (const shipment of shipments) {
      const seller = await User.findById(shipment.seller);
      if (seller) {
        const shipmentView = buildShipmentEmailView(order, shipment);
        sendNewOrderToSeller(seller, shipmentView);
        notifyNewOrderForSeller(seller, shipmentView);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'eSewa payment verified — order placed!',
      order,
    });
  }

  pendingPayment.status = 'failed';
  await pendingPayment.save();

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
  esewaForm,
  // Exported additionally (not part of the HTTP surface) so the return-URL
  // allowlist, the PendingPayment lookup, and eSewa signing can be
  // unit-tested directly — see backend/tests/pendingPayment.test.js.
  RETURN_URLS,
  resolveSource,
  findInitiatedPendingPayment,
  buildEsewaSignature,
  buildEsewaFormData,
};
