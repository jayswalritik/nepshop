const asyncHandler = require('express-async-handler');
const Order    = require('../models/Order');
const Shipment = require('../models/Shipment');
const User     = require('../models/User');
const {
  sendOrderStatusEmail,
  sendOrderDeliveredToSeller,
} = require('../utils/emailService');
const { round2 } = require('../utils/orderPricing');
const { recomputeOrder, buildShipmentEmailView } = require('../utils/orderAggregate');
const { ESCROW_LOCK_MINUTES } = require('../config/settlementConfig');

// @desc  Get all shipments assigned to delivery agent
// @route GET /api/delivery/orders
// @access Delivery agent only
const getDeliveryOrders = asyncHandler(async (req, res) => {
  const shipments = await Shipment.find({ deliveryAgent: req.user._id })
    .sort({ createdAt: -1 })
    .populate({
      path:   'order',
      select: 'customer deliveryAddress paymentMethod paymentStatus createdAt',
      populate: { path: 'customer', select: 'firstName lastName phone email' },
    });

  // Return-pickup leg earnings — a SEPARATE job (and possibly a different
  // agent) than this agent's own delivery shipments above, so it's not
  // captured by the `shipments` query at all. Only completed pickups
  // ('refunded' — see Return.pickupPaidOut's comment) count as earned,
  // matching how `shipments`-derived earnings below only count delivered
  // ones. Regardless of admin's payout-marking state, same as deliveries.
  const Return = require('../models/Return');
  const returnEarningsAgg = await Return.aggregate([
    { $match: { returnAgent: req.user._id, status: 'refunded' } },
    { $group: { _id: null, total: { $sum: '$returnAgentEarning' }, count: { $sum: 1 } } },
  ]);
  const returnEarnings    = returnEarningsAgg[0]?.total || 0;
  const returnPickupCount = returnEarningsAgg[0]?.count || 0;

  res.status(200).json({ success: true, shipments, returnEarnings, returnPickupCount });
});

// @desc  Mark a shipment as delivered
// @route PUT /api/delivery/orders/:id/delivered   (:id = shipmentId)
// @access Delivery agent only
const markDelivered = asyncHandler(async (req, res) => {
  const shipment = await Shipment.findById(req.params.id);

  if (!shipment) {
    res.status(404);
    throw new Error('Shipment not found');
  }

  if (shipment.deliveryAgent?.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized');
  }

  if (shipment.status !== 'dispatched') {
    res.status(400);
    throw new Error('Order must be dispatched before marking as delivered');
  }

  shipment.status      = 'delivered';
  shipment.deliveredAt = new Date();

  // ── Settlement on delivery — PER SHIPMENT ───────────────
  // Agent's Rs 50 released immediately (work is done, unambiguous).
  // Seller share + commission locked for the return window.
  const sellerShare = round2(shipment.sellerSubtotal - shipment.commissionAmount);

  const lockUntil = new Date();
  lockUntil.setMinutes(lockUntil.getMinutes() + ESCROW_LOCK_MINUTES);

  shipment.settlement = {
    ...shipment.settlement,
    status:              'partial', // agent paid, rest locked
    deliveryAgentPaid:   true,
    deliveryAgentPaidAt: new Date(),
    sellerShare:         sellerShare > 0 ? sellerShare : 0,
    sellerReleased:      false,
    sellerReleasedAt:    null,
    commissionBooked:    false,
    lockUntil:           lockUntil,
  };

  await shipment.save();

  const order = await recomputeOrder(shipment.order);

  // Send delivery earning email to the agent (req.user is the agent) — this shipment only
  const { sendDeliveryEarningEmail } = require('../utils/emailService');
  sendDeliveryEarningEmail(req.user, buildShipmentEmailView(order, shipment));

  // Send delivered email to customer
  const customer = await User.findById(order.customer);
  if (customer) sendOrderStatusEmail(customer, order, 'delivered');

  // Send delivered email to this shipment's seller only
  const seller = await User.findById(shipment.seller);
  if (seller) sendOrderDeliveredToSeller(seller, buildShipmentEmailView(order, shipment));

  res.status(200).json({
    success: true,
    message: 'Order marked as delivered',
    shipment,
    order,
  });
});

// @desc  Toggle the agent's OWN availability (online/offline) — UI/sorting
//        signal only. Never gates assignment, deliveries, or settlements.
// @route PUT /api/delivery/availability
// @access Delivery agent only, self
const updateAvailability = asyncHandler(async (req, res) => {
  const { isAvailable } = req.body;

  if (typeof isAvailable !== 'boolean') {
    res.status(400);
    throw new Error('isAvailable must be true or false');
  }

  const user = await User.findById(req.user._id);
  user.isAvailable = isAvailable;
  await user.save();

  res.status(200).json({
    success: true,
    message: `You are now ${isAvailable ? 'available' : 'offline'}`,
    isAvailable: user.isAvailable,
  });
});

module.exports = { getDeliveryOrders, markDelivered, updateAvailability };
