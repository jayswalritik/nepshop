const asyncHandler = require('express-async-handler');
const Order    = require('../models/Order');
const Shipment = require('../models/Shipment');
const Cart     = require('../models/Cart');
const Product  = require('../models/Product');
const User     = require('../models/User');

const { groupItemsBySeller, allocateCouponDiscount, round2 } = require('../utils/orderPricing');
const { recomputeOrder, buildShipmentEmailView } = require('../utils/orderAggregate');
const { attachShipments, fetchShipmentsForOrder } = require('../utils/orderFetch');
const { isSelected } = require('../utils/cartSelection');
const { cancelShipment, finalizeOrderCancellation } = require('../utils/shipmentCancellation');
const { computeOrderBuckets, computeShipmentSummaries } = require('../utils/orderSummary');

const {
  sendOrderPlacedEmail,
  sendOrderStatusEmail,
  sendNewOrderToSeller,
  sendOrderCancelledToSeller,
  sendDeliveryAssignedEmail,
  sendLowStockEmail,
} = require('../utils/emailService');

const {
  notifyOrderPlaced,
  notifyOrderStatus,
  notifyRefundIssued,
  notifyNewOrderForSeller,
  notifyDeliveryAssigned,
} = require('../utils/notificationService');



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

  // Selective checkout — only SELECTED items flow into the order. Everything
  // else (pricing, coupon, stock, cart-clearing) below is scoped to this
  // subset; unselected items are left untouched in the cart.
  const selectedItems = cart.items.filter(isSelected);
  if (selectedItems.length === 0) {
    res.status(400);
    throw new Error('Select at least one item to check out');
  }

  // Validate stock and build order items
  const orderItems = [];
  for (const item of selectedItems) {
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

  // Calculate pricing — grouped per seller (Daraz-style per-seller-group delivery)
  const commissionRate = 5;
  const { groups, subtotal, deliveryCharge, commissionAmount } = groupItemsBySeller(orderItems, commissionRate);

  // ── Apply coupon (platform-funded) ──────────────────────
  // Atomic redeem: checks + consumes global usageLimit AND this customer's
  // perUserLimit in one race-safe update (Coupon.redeemFor). Fails the
  // coupon step cleanly (no discount applied) if the limits no longer hold
  // — never fails order creation itself, matching prior behavior for any
  // other invalid-coupon reason.
  let couponDiscount = 0;
  let couponCode     = null;
  if (req.body.couponCode) {
    const Coupon = require('../models/Coupon');
    const redemption = await Coupon.redeemFor(req.body.couponCode, req.user._id, subtotal);
    if (redemption.ok) {
      couponDiscount = redemption.discount;
      couponCode     = redemption.coupon.code;
    }
  }

  // Total = subtotal + delivery − coupon. Coupon comes out of NepShop's margin.
  const total = round2(subtotal + deliveryCharge - couponDiscount);

  // Allocate the discount across items proportionally (mutates orderItems —
  // and, since groups[].items reference the same objects, this is visible
  // to the Shipment creation below too). 0/absent on orders without a coupon.
  allocateCouponDiscount(orderItems, couponDiscount);

  // Create order
  const order = await Order.create({
    customer: req.user._id,
    items:    orderItems,
    deliveryAddress,
    paymentMethod,
    customerNote,
    subtotal,
    deliveryCharge,
    couponCode,
    couponDiscount,
    total,
    commissionRate,
    commissionAmount,
  });

  // One Shipment per distinct seller in the order
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

  // Deduct stock — SELECTED items only; unselected items' stock is untouched
  // and their products are checked for low stock.
for (const item of selectedItems) {
  const updatedProduct = await Product.findByIdAndUpdate(
    item.product._id,
    { $inc: { stock: -item.quantity } },
    { new: true }
  );
  // Send low stock alert if stock drops to 5 or below
  if (updatedProduct && updatedProduct.stock <= 5 && updatedProduct.stock >= 0) {
    const seller = await User.findById(updatedProduct.seller);
    if (seller) sendLowStockEmail(seller, updatedProduct);
  }
}


  // Send emails
  const customer = await User.findById(req.user._id);
  sendOrderPlacedEmail(customer, order);
  notifyOrderPlaced(customer, order);

  // Notify each seller — their own shipment (items/amounts) only, not the whole order
  for (const shipment of shipments) {
    const seller = await User.findById(shipment.seller);
    if (seller) {
      const shipmentView = buildShipmentEmailView(order, shipment);
      sendNewOrderToSeller(seller, shipmentView);
      notifyNewOrderForSeller(seller, shipmentView);
    }
  }

  // For COD — clear ONLY the ordered (selected) items immediately; unselected
  // items remain in the cart, untouched. For online payments — the same
  // scoped removal happens after payment verification (createOrderFromCart).
  if (req.body.paymentMethod === 'cash_on_delivery') {
    const orderedProductIds = selectedItems.map((item) => item.product._id);
    await Cart.updateOne(
      { customer: req.user._id },
      { $pull: { items: { product: { $in: orderedProductIds } } } }
    );
  }

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

  // Attach each order's shipments (per-package status/tracking) — extracted to
  // utils/orderFetch.js; same populate selects, same output shape.
  const ordersWithShipments = await attachShipments(orders);

  res.status(200).json({
    success: true,
    total,
    page:       Number(page),
    totalPages: Math.ceil(total / limit),
    orders: ordersWithShipments,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Get single order by ID
// @route   GET /api/orders/:id
// @access  Customer (own) / Seller (their items) / Admin / Delivery agent
// ─────────────────────────────────────────────────────────
const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('customer',      'firstName lastName email phone')
    .populate('deliveryAgent', 'firstName lastName phone');

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Same populate selects as before — extracted to utils/orderFetch.js.
  const shipments = await fetchShipmentsForOrder(order._id);

  const userId = req.user._id.toString();
  const isCustomer = order.customer._id.toString() === userId;
  const isAdmin    = req.user.role === 'admin';

  const myShipments = shipments.filter(s => s.seller._id.toString() === userId);
  const isSellerInOrder = myShipments.length > 0;

  const myAgentShipments = shipments.filter(
    s => s.deliveryAgent && s.deliveryAgent._id.toString() === userId
  );
  const isAgent = myAgentShipments.length > 0;

  if (!isCustomer && !isSellerInOrder && !isAdmin && !isAgent) {
    res.status(403);
    throw new Error('Not authorized to view this order');
  }

  // Customer and admin see the whole order, with all shipments for per-package display
  if (isCustomer || isAdmin) {
    return res.status(200).json({ success: true, order, shipments });
  }

  // Seller / delivery agent: only their own shipment(s) — never co-sellers' items
  const scoped = isSellerInOrder ? myShipments : myAgentShipments;

  res.status(200).json({
    success: true,
    order: {
      _id:             order._id,
      deliveryAddress: order.deliveryAddress,
      paymentMethod:   order.paymentMethod,
      paymentStatus:   order.paymentStatus,
      customerNote:    order.customerNote,
      createdAt:       order.createdAt,
    },
    shipments: scoped,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Paid / To-pay-on-delivery / Refunded buckets + per-shipment
//          cancel-refund preview — server-computed equivalent of what
//          frontend/src/pages/customer/OrdersPage.jsx currently computes
//          client-side (its footer money line and CancelPackageModal).
//          All arithmetic delegated to backend/utils/orderSummary.js —
//          nothing is computed in this handler.
// @route   GET /api/orders/:id/summary
// @access  Customer only (must own the order)
// ─────────────────────────────────────────────────────────
const getOrderSummary = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Same ownership check cancelOrder/cancelShipmentByCustomer already use
  // (this route is customer-only, unlike getOrderById which also serves
  // seller/admin/delivery — no need for that function's broader role check).
  if (order.customer.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized');
  }

  const shipments = await Shipment.find({ order: order._id });

  const buckets = computeOrderBuckets(order, shipments);
  const shipmentSummaries = computeShipmentSummaries(shipments);

  res.status(200).json({
    success: true,
    orderId: order._id,
    buckets: {
      paid: buckets.paid,
      toPayOnDelivery: buckets.toPayOnDelivery,
      refunded: buckets.refunded,
    },
    shipments: shipmentSummaries,
  });
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

  const shipments   = await Shipment.find({ order: order._id });
  const cancellable = shipments.filter(s => ['pending', 'confirmed'].includes(s.status));

  if (cancellable.length === 0) {
    res.status(400);
    const anyDispatched = shipments.some(s => s.status === 'dispatched');
    throw new Error(
      anyDispatched
        ? 'Cannot cancel order that is already out for delivery'
        : `Cannot cancel order that is already ${order.status}`
    );
  }

  // Cancel each eligible shipment independently — restore stock + refund
  // contribution (backend/utils/shipmentCancellation.js — shared with the
  // seller per-shipment path and the customer per-shipment path below).
  for (const shipment of cancellable) {
    await cancelShipment(shipment, order);
  }

  const { updatedOrder, orderFullyCancelled, refunded } = await finalizeOrderCancellation(order._id);

  // Send emails
  const customer = await User.findById(req.user._id);
  if (orderFullyCancelled) {
    if (customer) {
      sendOrderStatusEmail(customer, updatedOrder, 'cancelled');
      notifyOrderStatus(customer, updatedOrder, 'cancelled');
    }
    if (refunded && customer) {
      const { sendCancelRefundToCustomer } = require('../utils/emailService');
      sendCancelRefundToCustomer(customer, updatedOrder);
      notifyRefundIssued(customer, updatedOrder, updatedOrder.total);
    }
  }

  // Notify only the seller(s) whose shipment was actually cancelled
  for (const shipment of cancellable) {
    const seller = await User.findById(shipment.seller);
    if (seller) sendOrderCancelledToSeller(seller, buildShipmentEmailView(updatedOrder, shipment));
  }

  res.status(200).json({
    success: true,
    message: orderFullyCancelled
      ? (refunded
          ? 'Order cancelled. A full refund has been processed to your original payment method.'
          : 'Order cancelled successfully')
      : 'Cancelled the part(s) of your order that were still eligible. Item(s) already in progress could not be cancelled.',
    order: updatedOrder,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Get all shipments for seller (their products only)
// @route   GET /api/orders/seller
// @access  Seller only
// ─────────────────────────────────────────────────────────
const getSellerOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;

  const query = { seller: req.user._id };
  if (status) query.status = status;

  const total     = await Shipment.countDocuments(query);
  const shipments = await Shipment.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .populate({
      path:     'order',
      select:   'customer deliveryAddress paymentMethod paymentStatus customerNote createdAt',
      populate: { path: 'customer', select: 'firstName lastName phone' },
    })
    .populate('deliveryAgent', 'firstName lastName phone');

  res.status(200).json({
    success: true,
    total,
    page:       Number(page),
    totalPages: Math.ceil(total / limit),
    shipments,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Update shipment status (seller)
// @route   PUT /api/orders/:id/status   (:id = shipmentId)
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

  const shipment = await Shipment.findById(req.params.id);
  if (!shipment) {
    res.status(404);
    throw new Error('Shipment not found');
  }

  // Authorization: owning this shipment, full stop — owning an item elsewhere
  // in the order grants nothing.
  if (shipment.seller.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized');
  }

  // Validate transition
  const allowed = validTransitions[shipment.status];
  if (!allowed || !allowed.includes(status)) {
    res.status(400);
    throw new Error(`Cannot change status from "${shipment.status}" to "${status}"`);
  }

  const order = await Order.findById(shipment.order);

  let updatedOrder;
  let orderFullyCancelled = false;
  let refunded = false;

  if (status === 'cancelled') {
    // Shared mechanics (backend/utils/shipmentCancellation.js) — stock
    // restore + allocation-aware refund, then order-level finalization
    // (paymentStatus/settlement/voucher restore only once EVERY shipment on
    // the order is cancelled). Identical to the customer per-shipment path.
    await cancelShipment(shipment, order);
    ({ updatedOrder, orderFullyCancelled, refunded } = await finalizeOrderCancellation(order._id));
  } else {
    shipment.status = status;

    if (status === 'confirmed') shipment.confirmedAt = new Date();
    if (status === 'packed')    shipment.packedAt    = new Date();
    if (status === 'dispatched') {
      if (!deliveryAgentId) {
        res.status(400);
        throw new Error('Please assign a delivery agent before dispatching the order');
      }
      shipment.dispatchedAt  = new Date();
      shipment.deliveryAgent = deliveryAgentId;

      // Save seller's shop address as this shipment's pickup address — never
      // touching sibling shipments belonging to other sellers.
      const seller = await User.findById(req.user._id).select('shopName shopAddress');
      if (seller) {
        shipment.pickupAddress = {
          shopName: seller.shopName,
          street:   seller.shopAddress?.street,
          city:     seller.shopAddress?.city,
          district: seller.shopAddress?.district,
          phone:    seller.shopAddress?.phone,
        };
      }
    }
    if (status === 'delivered') shipment.deliveredAt = new Date();

    await shipment.save();
    updatedOrder = await recomputeOrder(order._id);
  }

  // Send status email to customer
  const customer = await User.findById(updatedOrder.customer);
  if (customer) {
    sendOrderStatusEmail(customer, updatedOrder, status);
    notifyOrderStatus(customer, updatedOrder, status);
  }

  // Send delivery assignment email — scoped to this shipment
  if (status === 'dispatched' && deliveryAgentId) {
    const agent = await User.findById(deliveryAgentId);
    if (agent) {
      const shipmentView = buildShipmentEmailView(updatedOrder, shipment);
      sendDeliveryAssignedEmail(agent, shipmentView);
      notifyDeliveryAssigned(agent, shipmentView);
    }
  }

  // If this cancellation refunded the paid order in full, confirm the refund
  if (orderFullyCancelled && updatedOrder.paymentStatus === 'refunded' && customer) {
    const { sendCancelRefundToCustomer } = require('../utils/emailService');
    sendCancelRefundToCustomer(customer, updatedOrder);
    notifyRefundIssued(customer, updatedOrder, updatedOrder.total);
  }

  res.status(200).json({
    success: true,
    message: `Order status updated to "${status}"`,
    shipment,
    order: updatedOrder,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Cancel ONE package (shipment) — customer
// @route   PUT /api/orders/shipments/:shipmentId/cancel
// @access  Customer only
// ─────────────────────────────────────────────────────────
const cancelShipmentByCustomer = asyncHandler(async (req, res) => {
  const shipment = await Shipment.findById(req.params.shipmentId);
  if (!shipment) {
    res.status(404);
    throw new Error('Package not found');
  }

  const order = await Order.findById(shipment.order);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Authorization: the requester must be the CUSTOMER on this shipment's
  // parent order — the seller has their own separate cancel path
  // (updateOrderStatus), not this one.
  if (order.customer.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized');
  }

  if (!['pending', 'confirmed'].includes(shipment.status)) {
    res.status(400);
    throw new Error(`Cannot cancel this package — it is already ${shipment.status}`);
  }

  // Shared mechanics (backend/utils/shipmentCancellation.js) — identical
  // stock restore + allocation-aware refund + order finalization the seller
  // per-shipment path and the whole-order customer path use.
  await cancelShipment(shipment, order);
  const { updatedOrder, orderFullyCancelled, refunded } = await finalizeOrderCancellation(order._id);

  // Notify this shipment's seller — their package was cancelled by the
  // customer (mirrors cancelOrder's per-shipment seller notification;
  // updateOrderStatus doesn't need this since the seller triggered it themselves).
  const seller = await User.findById(shipment.seller);
  if (seller) sendOrderCancelledToSeller(seller, buildShipmentEmailView(updatedOrder, shipment));

  // Whole-order side effects (status email, refund confirmation) only fire
  // once every shipment on the order has ended up cancelled — same rule
  // cancelOrder uses.
  const customer = await User.findById(req.user._id);
  if (orderFullyCancelled) {
    if (customer) {
      sendOrderStatusEmail(customer, updatedOrder, 'cancelled');
      notifyOrderStatus(customer, updatedOrder, 'cancelled');
    }
    if (refunded && customer) {
      const { sendCancelRefundToCustomer } = require('../utils/emailService');
      sendCancelRefundToCustomer(customer, updatedOrder);
      notifyRefundIssued(customer, updatedOrder, updatedOrder.total);
    }
  }

  res.status(200).json({
    success: true,
    message: orderFullyCancelled
      ? (refunded
          ? 'Package cancelled — it was your last active package, so a full refund has been processed.'
          : 'Package cancelled successfully.')
      : 'Package cancelled successfully.',
    shipment,
    order: updatedOrder,
  });
});

module.exports = {
  placeOrder,
  getMyOrders,
  getOrderById,
  getOrderSummary,
  cancelOrder,
  getSellerOrders,
  updateOrderStatus,
  cancelShipmentByCustomer,
};
