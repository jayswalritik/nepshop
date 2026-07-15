const mongoose      = require('mongoose');
const asyncHandler  = require('express-async-handler');
const Return        = require('../models/Return');
const Order         = require('../models/Order');
const Shipment      = require('../models/Shipment');
const User          = require('../models/User');
const { RETURN_WINDOW_MINUTES } = require('../config/settlementConfig');
const { computeReturnReversal, isShipmentFullyReturned } = require('../utils/returnMath');
const { round2 }    = require('../utils/orderPricing');
const { recomputeOrder } = require('../utils/orderAggregate');

// Recomputes a shipment's returnHold from its currently-open Return documents.
// Self-healing/idempotent by design — safe to call after any request/reject/
// complete transition, so a shipment with TWO open returns (different items)
// only has its hold cleared once BOTH resolve.
const refreshReturnHold = async (shipmentId) => {
  const openCount = await Return.countDocuments({
    shipment: shipmentId,
    status: { $in: ['pending', 'approved', 'picked_up'] },
  });
  await Shipment.updateOne({ _id: shipmentId }, { $set: { returnHold: openCount > 0 } });
};

// Releases a reservation previously taken by requestReturn's $expr-gated
// increment — used both when a failed Return.create() must be compensated
// and when an admin rejects a pending return. Floors at 0 per line via
// `$max`, so it is structurally incapable of driving returnedQuantity
// negative, regardless of whether the reservation it's releasing actually
// landed (confirmed by isolated reproduction: an unconditional `$inc` here
// previously could and did go negative when releasing a reservation that,
// due to the bug above, was never really taken). Unconditional/idempotent —
// no gate needed, since "release at most what's currently reserved" is
// always a safe operation.
const releaseReservation = async (shipmentId, items) => {
  const releaseList = items.map(it => ({
    product: new mongoose.Types.ObjectId(it.product),
    qty: it.quantity,
  }));
  const releasePipeline = [
    {
      $set: {
        items: {
          $map: {
            input: '$items',
            as: 'it',
            in: {
              $let: {
                vars: {
                  matches: {
                    $filter: {
                      input: releaseList,
                      as: 'r',
                      cond: { $eq: ['$$r.product', '$$it.product'] },
                    },
                  },
                },
                in: {
                  $cond: [
                    { $eq: [{ $size: '$$matches' }, 0] },
                    '$$it',
                    {
                      $mergeObjects: [
                        '$$it',
                        {
                          returnedQuantity: {
                            $max: [0, { $subtract: ['$$it.returnedQuantity', { $sum: '$$matches.qty' }] }],
                          },
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
  ];
  await Shipment.updateOne({ _id: shipmentId }, releasePipeline);
};

// ─────────────────────────────────────────────────────────
// @desc    Request a return for specific item(s)/quantity from ONE shipment
// @route   POST /api/returns
// @access  Customer only
// ─────────────────────────────────────────────────────────
const requestReturn = asyncHandler(async (req, res) => {
  const { shipmentId, items, reason, description } = req.body;

  if (!shipmentId) {
    res.status(400);
    throw new Error('shipmentId is required');
  }
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400);
    throw new Error('Select at least one item to return');
  }
  if (!reason) {
    res.status(400);
    throw new Error('Return reason is required');
  }

  const shipment = await Shipment.findById(shipmentId);
  if (!shipment) {
    res.status(404);
    throw new Error('Shipment not found');
  }

  const order = await Order.findById(shipment.order);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  if (order.customer.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized');
  }

  if (shipment.status !== 'delivered' || !shipment.deliveredAt) {
    res.status(400);
    throw new Error('You can only return items from a delivered package');
  }

  // Window check — against THIS shipment's own deliveredAt, not the order's.
  const deliveredAt  = new Date(shipment.deliveredAt);
  const minutesSince = (Date.now() - deliveredAt.getTime()) / (1000 * 60);
  if (minutesSince > RETURN_WINDOW_MINUTES) {
    res.status(400);
    throw new Error('Return window has expired for this package.');
  }

  // Dedupe requested lines by product and validate they belong to this shipment.
  const requestMap = new Map();
  for (const ri of items) {
    if (!ri.product || !ri.quantity || Number(ri.quantity) <= 0) {
      res.status(400);
      throw new Error('Each returned item needs a product and a positive quantity');
    }
    const key = ri.product.toString();
    requestMap.set(key, (requestMap.get(key) || 0) + Number(ri.quantity));
  }

  const requestedItems = [];
  for (const [productId, quantity] of requestMap) {
    const shipmentItem = shipment.items.find(i => i.product.toString() === productId);
    if (!shipmentItem) {
      res.status(400);
      throw new Error('One of the selected items is not part of this package');
    }
    requestedItems.push({ product: productId, quantity, shipmentItem });
  }

  // ── Race-safe reservation ────────────────────────────────
  // Atomically validate requestedQty <= quantity - returnedQuantity per
  // requested line AND increment returnedQuantity, in ONE operation.
  //
  // HISTORY: this was previously an arrayFilters update with `$expr` INSIDE
  // the arrayFilters document — illegal ("$expr is not allowed in this
  // context"), a hard parse error on every call. That was replaced with an
  // aggregation-pipeline update that computed a would-be `items` array and,
  // on failure, wrote `items` back to `$items` (itself) as a deliberate
  // no-op. That "no-op" is NOT reliably reported as modifiedCount: 0 —
  // confirmed by isolated reproduction: MongoDB can report modifiedCount: 1
  // for a pipeline update whose $cond branch left the field byte-identical.
  // Checking `modifiedCount` was therefore not a trustworthy success signal,
  // which is exactly what let two orphaned, over-capacity return requests
  // both report 201 while returnedQuantity never actually moved.
  //
  // FIX: gate the write with `$expr` in the QUERY FILTER instead (legal
  // there — the restriction is specific to arrayFilters). If the condition
  // is false, the document simply does not MATCH the query at all:
  // findOneAndUpdate returns null and no write of any kind is attempted —
  // an unambiguous outcome, not a count to interpret. The $inc itself is
  // unconditional once the gate passes, so a real match always means a real
  // change. Only the REQUESTED lines are evaluated (not the whole shipment),
  // so an unrelated corrupted/over-capacity line can never block a
  // reservation for a different product on the same shipment. Still
  // race-safe: MongoDB evaluates the filter+update atomically per document,
  // serializing concurrent requests exactly as before — confirmed via
  // repeated true-concurrency (Promise.all) reproduction: exactly one of two
  // simultaneous requests for the last unit ever wins.
  const requestList = requestedItems.map(ri => ({
    product: new mongoose.Types.ObjectId(ri.product),
    qty: ri.quantity,
  }));

  const reserveArrayFilters = requestedItems.map((ri, idx) => ({
    [`elem${idx}.product`]: new mongoose.Types.ObjectId(ri.product),
  }));
  const reserveInc = {};
  requestedItems.forEach((ri, idx) => {
    reserveInc[`items.$[elem${idx}].returnedQuantity`] = ri.quantity;
  });

  const reserveGate = {
    $allElementsTrue: {
      $map: {
        input: requestList,
        as: 'r',
        in: {
          $let: {
            vars: {
              shipItem: {
                $arrayElemAt: [
                  { $filter: { input: '$items', as: 'it', cond: { $eq: ['$$it.product', '$$r.product'] } } },
                  0,
                ],
              },
            },
            in: { $lte: [{ $add: ['$$shipItem.returnedQuantity', '$$r.qty'] }, '$$shipItem.quantity'] },
          },
        },
      },
    },
  };

  // No try/catch here — a genuine DB error (bad connection, etc.) must
  // surface as a 500 via the default error handler, never get relabeled as
  // a quantity/validation message. The ONLY expected non-success outcome is
  // `reservedShipment === null`, meaning the gate rejected the request.
  const reservedShipment = await Shipment.findOneAndUpdate(
    { _id: shipment._id, $expr: reserveGate },
    { $inc: reserveInc },
    { arrayFilters: reserveArrayFilters, new: true }
  );

  if (!reservedShipment) {
    res.status(400);
    throw new Error('Requested quantity exceeds what is still returnable for one or more items');
  }

  // Build the Return record's item snapshot — per-unit voucher slice x qty
  // (line allocation / line quantity = per-unit slice, per the money model).
  const returnItems = requestedItems.map(ri => {
    const si = ri.shipmentItem;
    const perUnitAllocation = si.quantity > 0 ? round2((si.couponAllocation || 0) / si.quantity) : 0;
    return {
      product:  si.product,
      name:     si.name,
      image:    si.image,
      price:    si.price,
      quantity: ri.quantity,
      couponAllocation: round2(perUnitAllocation * ri.quantity),
    };
  });

  let returnRequest;
  try {
    returnRequest = await Return.create({
      order:    order._id,
      shipment: shipment._id,
      seller:   shipment.seller,
      customer: req.user._id,
      items:    returnItems,
      reason,
      description: description || '',
    });
  } catch (err) {
    // Compensate — a failed Return.create() must never leave units stuck
    // reserved as "returned" with no Return document tracking them.
    await releaseReservation(shipment._id, requestedItems.map(ri => ({ product: ri.product, quantity: ri.quantity })));
    throw err;
  }

  // Freeze settlement — escrow must NOT auto-release while a return is open.
  // ONLY this shipment. Sibling shipments (other sellers, other packages of
  // the same order) are never touched.
  shipment.returnHold = true;
  await shipment.save();

  // Send emails
  const {
    sendReturnRequestEmail,
    sendReturnRequestToSeller,
    sendNewReturnToAdmin,
  } = require('../utils/emailService');

  const customer = await User.findById(req.user._id);
  if (customer) sendReturnRequestEmail(customer, returnRequest, order);

  // Notify only THIS shipment's seller — not co-sellers on the same order.
  const seller = await User.findById(shipment.seller);
  if (seller) sendReturnRequestToSeller(seller, returnRequest, order);

  const admin = await User.findOne({ role: 'admin' });
  if (admin) sendNewReturnToAdmin(admin.email, returnRequest, order);

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
    .populate('order', '_id total status')
    .populate('shipment', 'status deliveredAt sellerSubtotal deliveryCharge commissionRate returnHold');

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
    .populate('order',    '_id total paymentMethod')
    .populate('seller',   'firstName lastName shopName')
    .populate('shipment', 'sellerSubtotal deliveryCharge commissionRate status deliveredAt pickupAddress items returnHold');

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

  returnRequest.adminNote   = adminNote || '';
  returnRequest.processedBy = req.user._id;
  returnRequest.processedAt = new Date();

  // ── REJECTED ────────────────────────────────────────────
  if (status === 'rejected') {
    // Atomic status transition — `status: 'pending'` is part of THIS
    // update's filter (not just the earlier read-then-branch check above),
    // so a concurrent/double reject on the same Return matches nothing the
    // second time. `returnRequest.save()` would NOT have been safe here:
    // Return's schema has no optimisticConcurrency, so .save() issues
    // `updateOne({_id}, {$set:...})` — filtered by _id alone, not status —
    // meaning two racing reject calls could both pass the `!== 'pending'`
    // check above (both read the doc before either writes) and both reach
    // releaseReservation, decrementing the same reservation twice.
    const rejected = await Return.findOneAndUpdate(
      { _id: returnRequest._id, status: 'pending' },
      { $set: {
        status: 'rejected',
        adminNote: adminNote || '',
        processedBy: req.user._id,
        processedAt: new Date(),
      } },
      { new: true }
    );
    if (!rejected) {
      res.status(400);
      throw new Error('Return request has already been processed');
    }
    returnRequest.status = rejected.status;

    // Release the reserved quantities back to the shipment — floored at 0
    // per line, so this can never drive returnedQuantity negative even if
    // (due to some other bug) this Return's reservation was never actually
    // taken. See releaseReservation's comment above. Only reachable once
    // per Return, since the atomic transition above guarantees exactly one
    // caller ever wins the 'pending' -> 'rejected' flip.
    await releaseReservation(returnRequest.shipment, returnRequest.items.map(it => ({ product: it.product, quantity: it.quantity })));
    // Hold re-derives from remaining open Return documents on this shipment
    // (another pending/approved return on a different item keeps it held).
    await refreshReturnHold(returnRequest.shipment);

    const { sendReturnRejectedEmail } = require('../utils/emailService');
    const customer = await User.findById(returnRequest.customer._id);
    if (customer) sendReturnRejectedEmail(customer, returnRequest, returnRequest.order);

    return res.status(200).json({
      success: true,
      message: 'Return request rejected. Item(s) are returnable again; seller funds will release normally.',
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

  const shipment = await Shipment.findById(returnRequest.shipment);

  // Email the customer — return approved, pickup coming
  const { sendReturnApprovedEmail, sendReturnPickupAssignedEmail } = require('../utils/emailService');
  const customer = await User.findById(returnRequest.customer._id);
  if (customer) sendReturnApprovedEmail(customer, returnRequest, returnRequest.order);

  // Email the assigned return agent — pickup address comes from THIS
  // shipment (order.pickupAddress only mirrors a single-shipment order; a
  // multi-seller order has no one "the" pickup address at order level).
  const returnAgentUser = await User.findById(returnAgentId);
  if (returnAgentUser && shipment) {
    returnRequest.customer = customer;
    const emailOrderView = {
      ...returnRequest.order.toObject(),
      pickupAddress: shipment.pickupAddress,
    };
    sendReturnPickupAssignedEmail(returnAgentUser, returnRequest, emailOrderView);
  }

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
    .populate('order', '_id total deliveryAddress')
    .populate('shipment', 'pickupAddress seller');

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

  const order = await Order.findById(returnRequest.order);

  // Notify customer + this shipment's seller only
  const {
    sendReturnPickedUpToCustomer,
    sendReturnPickedUpToSeller,
  } = require('../utils/emailService');

  const customer = await User.findById(order.customer);
  if (customer) sendReturnPickedUpToCustomer(customer, order);

  const seller = await User.findById(returnRequest.seller);
  if (seller) sendReturnPickedUpToSeller(seller, order);

  res.status(200).json({
    success: true,
    message: 'Return marked as picked up. Now deliver it to the seller.',
    return:  returnRequest,
  });
});

// Shared by both refund-preview endpoints below (customer pre-submit +
// admin review) — classification via the SAME isShipmentFullyReturned
// helper completeReturn uses, so no preview surface can ever show a
// full/partial verdict that diverges from what completion will actually
// apply. `items` is a plain [{ product, price, quantity, couponAllocation }]
// array — the candidate return's line items, not yet persisted.
const buildReturnPreview = async ({ shipment, items, excludeReturnId = null, pickupFee = 50 }) => {
  const returnedValue = round2(items.reduce((s, i) => s + i.price * i.quantity, 0));
  const voucherSlice  = round2(items.reduce((s, i) => s + (i.couponAllocation || 0), 0));

  const query = { shipment: shipment._id, status: 'refunded' };
  if (excludeReturnId) query._id = { $ne: excludeReturnId };
  const completedReturns = await Return.find(query).select('items');

  const isFullShipmentReturn = isShipmentFullyReturned({
    shipmentItems:         shipment.items,
    completedReturnsItems: completedReturns.flatMap(r => r.items),
    currentReturnItems:    items,
  });

  const sellerReversal = computeReturnReversal({
    returnedValue, voucherSlice, commissionRate: shipment.commissionRate,
    fault: 'seller', isFullShipmentReturn,
    shipmentDeliveryCharge: shipment.deliveryCharge, pickupFee,
  });
  const customerReversal = computeReturnReversal({
    returnedValue, voucherSlice, commissionRate: shipment.commissionRate,
    fault: 'customer', isFullShipmentReturn,
    shipmentDeliveryCharge: shipment.deliveryCharge, pickupFee,
  });

  return {
    returnedValue,
    voucherSlice,
    isFullShipmentReturn,
    pickupFee,
    deliveryCharge: shipment.deliveryCharge || 0,
    seller: {
      refundToCustomer:   sellerReversal.refundToCustomer,
      sellerReversal:     sellerReversal.sellerReversal,
      commissionReversal: sellerReversal.commissionReversal,
    },
    customer: {
      refundToCustomer: customerReversal.refundToCustomer,
    },
  };
};

// ─────────────────────────────────────────────────────────
// @desc    Refund preview BEFORE submitting a return request — same
//          classification/math the backend will actually apply, so the
//          customer never sees a number the system can't honor.
// @route   POST /api/returns/preview
// @access  Customer only
// ─────────────────────────────────────────────────────────
const previewReturn = asyncHandler(async (req, res) => {
  const { shipmentId, items } = req.body;

  if (!shipmentId || !Array.isArray(items) || items.length === 0) {
    res.status(400);
    throw new Error('shipmentId and at least one item are required');
  }

  const shipment = await Shipment.findById(shipmentId);
  if (!shipment) {
    res.status(404);
    throw new Error('Shipment not found');
  }

  const order = await Order.findById(shipment.order);
  if (!order || order.customer.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized');
  }

  const requestMap = new Map();
  for (const ri of items) {
    if (!ri.product || !ri.quantity || Number(ri.quantity) <= 0) {
      res.status(400);
      throw new Error('Each returned item needs a product and a positive quantity');
    }
    const key = ri.product.toString();
    requestMap.set(key, (requestMap.get(key) || 0) + Number(ri.quantity));
  }

  const previewItems = [];
  for (const [productId, quantity] of requestMap) {
    const shipmentItem = shipment.items.find(i => i.product.toString() === productId);
    if (!shipmentItem) {
      res.status(400);
      throw new Error('One of the selected items is not part of this package');
    }
    const perUnitAllocation = shipmentItem.quantity > 0
      ? round2((shipmentItem.couponAllocation || 0) / shipmentItem.quantity)
      : 0;
    previewItems.push({
      product:  shipmentItem.product,
      price:    shipmentItem.price,
      quantity,
      couponAllocation: round2(perUnitAllocation * quantity),
    });
  }

  const preview = await buildReturnPreview({ shipment, items: previewItems });

  res.status(200).json({ success: true, preview });
});

// ─────────────────────────────────────────────────────────
// @desc    Refund preview for an EXISTING (pending) return request — what
//          the admin sees before choosing fault/approving.
// @route   GET /api/returns/:id/preview
// @access  Admin only
// ─────────────────────────────────────────────────────────
const getReturnPreview = asyncHandler(async (req, res) => {
  const returnRequest = await Return.findById(req.params.id);
  if (!returnRequest) {
    res.status(404);
    throw new Error('Return request not found');
  }

  const shipment = await Shipment.findById(returnRequest.shipment);
  if (!shipment) {
    res.status(404);
    throw new Error('Shipment not found');
  }

  const preview = await buildReturnPreview({
    shipment,
    items:           returnRequest.items,
    excludeReturnId: returnRequest._id,
    pickupFee:       returnRequest.returnAgentEarning || 50,
  });

  res.status(200).json({ success: true, preview });
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

  const shipment = await Shipment.findById(returnRequest.shipment);
  if (!shipment) {
    res.status(404);
    throw new Error('Shipment not found');
  }
  const order = await Order.findById(returnRequest.order);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // ══ FAULT-BASED REVERSAL MATH (backend/utils/returnMath.js) ═══════════
  const fault         = returnRequest.fault;
  const returnedValue = round2(returnRequest.items.reduce((s, i) => s + i.price * i.quantity, 0));
  const voucherSlice  = round2(returnRequest.items.reduce((s, i) => s + (i.couponAllocation || 0), 0));

  // "Full shipment return" must mean every unit has actually been RETURNED
  // (completed), not merely RESERVED — see isShipmentFullyReturned's comment
  // in returnMath.js for why shipment.items[].returnedQuantity is unsafe here.
  const otherCompletedReturns = await Return.find({
    shipment: shipment._id,
    status:   'refunded',
    _id:      { $ne: returnRequest._id },
  }).select('items');

  const isFullShipmentReturn = isShipmentFullyReturned({
    shipmentItems:          shipment.items,
    completedReturnsItems:  otherCompletedReturns.flatMap(r => r.items),
    currentReturnItems:     returnRequest.items,
  });

  const reversal = computeReturnReversal({
    returnedValue,
    voucherSlice,
    commissionRate: shipment.commissionRate,
    fault,
    isFullShipmentReturn,
    shipmentDeliveryCharge: shipment.deliveryCharge,
    pickupFee: returnRequest.returnAgentEarning || 50,
  });

  // ── Apply settlement reversal — THIS shipment only ──────
  const alreadyLocked = shipment.settlement.sellerReleased || shipment.settlement.sellerPaidOut;
  if (alreadyLocked) {
    // Money already released/paid out — carry the debit as a ledger entry
    // netted into this seller's NEXT payout instead of rewriting history
    // (see adminController.getPayouts/paySeller).
    shipment.settlement.adjustment = round2((shipment.settlement.adjustment || 0) + reversal.sellerShareDelta);
  } else {
    shipment.settlement.sellerShare = round2((shipment.settlement.sellerShare || 0) + reversal.sellerShareDelta);
  }
  shipment.settlement.refundToCustomer = round2((shipment.settlement.refundToCustomer || 0) + reversal.refundToCustomer);
  shipment.settlement.settledAt        = new Date();

  if (isFullShipmentReturn) {
    // Entire shipment returned — permanently ineligible for the normal
    // release cron (status/settlement.status never match its filter again).
    shipment.settlement.status = 'refunded';
    shipment.status            = 'returned';
  } else if (!alreadyLocked) {
    // Partial return, resolved before the normal escrow release — settle it
    // now rather than leaving the (already-reversed) remainder to wait out
    // lockUntil like an ordinary undisturbed shipment. Mirrors the normal
    // cron's own 'partial' -> 'released' transition (see server.js).
    shipment.settlement.status           = 'released';
    shipment.settlement.commissionBooked = true;
  }

  // A resolved return (approved + completed, fault either way) pays out
  // immediately instead of waiting on lockUntil — only a REJECTED return
  // falls back to the normal escrow timeline (see processReturn, untouched).
  // Without this, a full-shipment return in particular would permanently
  // exit the release cron's filter (status/settlement.status go terminal)
  // while sellerReleased stays false — its reversed sellerShare would sit
  // invisible to getPayouts/paySeller forever. A shipment already
  // released/paid out before this return (alreadyLocked) already routed the
  // reversal into `adjustment` above and needs no change here.
  if (!alreadyLocked) {
    shipment.settlement.sellerReleased   = true;
    shipment.settlement.sellerReleasedAt = new Date();
  }
  // shipment.status itself only changes for a full-shipment return (above)
  // — a partial return leaves it 'delivered'; an open/completed Return
  // record communicates return progress, not shipment.status.

  await shipment.save();

  let updatedOrder = await recomputeOrder(order._id);

  // Order-level paymentStatus only flips to 'refunded' once EVERY shipment
  // on the order has ended up fully refunded (returned in full or cancelled)
  // — a partial or single-shipment-of-many return never touches it.
  const allShipments = await Shipment.find({ order: order._id }).select('settlement.status');
  const orderFullyRefunded = allShipments.length > 0 && allShipments.every(s => s.settlement.status === 'refunded');
  if (orderFullyRefunded && updatedOrder.paymentStatus === 'paid') {
    updatedOrder.paymentStatus = 'refunded';
    await updatedOrder.save();
  }

  // ── Complete the return record ──────────────────────────
  returnRequest.status             = 'refunded';
  returnRequest.returnedToSellerAt = new Date();
  returnRequest.fullShipmentReturn = isFullShipmentReturn;
  returnRequest.returnedValue      = reversal.returnedValue;
  returnRequest.refundToCustomer   = reversal.refundToCustomer;
  returnRequest.sellerReversal     = reversal.sellerReversal;
  returnRequest.commissionReversal = reversal.commissionReversal;
  returnRequest.voucherReclaimed   = reversal.voucherReclaimed;
  returnRequest.refundAmount       = reversal.refundToCustomer;
  await returnRequest.save();

  // Recompute returnHold AFTER this return's status is actually 'refunded'
  // in the DB — calling this any earlier (the old bug: it ran right after
  // shipment.save() above, while this very Return doc was still
  // 'picked_up') would count THIS return as still-open and leave the hold
  // stuck true forever, since nothing re-checked it afterward. Same helper
  // the reject path uses — not duplicated.
  await refreshReturnHold(shipment._id);

  // ── Restore stock to seller ─────────────────────────────
  const Product = require('../models/Product');
  for (const item of returnRequest.items) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: item.quantity },
    });
  }

  // ── Emails: customer refund, seller settlement, agent earning ──
  const {
    sendRefundProcessedToCustomer,
    sendReturnCompletedToSeller,
    sendReturnEarningToAgent,
  } = require('../utils/emailService');

  const customer = await User.findById(returnRequest.customer._id);
  if (customer) sendRefundProcessedToCustomer(customer, updatedOrder, reversal.refundToCustomer, fault);

  // Only THIS shipment's seller — not co-sellers on the same order.
  const seller = await User.findById(shipment.seller);
  if (seller) sendReturnCompletedToSeller(seller, updatedOrder, fault);

  const agent = await User.findById(returnRequest.returnAgent);
  if (agent) sendReturnEarningToAgent(agent, returnRequest, updatedOrder);

  res.status(200).json({
    success: true,
    message: `Return completed. Customer refunded Rs ${reversal.refundToCustomer}. Agent earned Rs ${returnRequest.returnAgentEarning || 50}.`,
    return:  returnRequest,
  });
});

module.exports = {
  requestReturn,
  getMyReturns,
  getAllReturns,
  previewReturn,
  getReturnPreview,
  processReturn,
  getMyReturnPickups,
  markReturnPickedUp,
  completeReturn,
  RETURN_WINDOW_MINUTES,
};
