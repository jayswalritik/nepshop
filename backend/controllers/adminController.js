const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { round2 } = require('../utils/orderPricing');

const {
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
} = require('../utils/emailService');
const {
  notifyOrderStatus,
  notifyPayoutProcessed,
} = require('../utils/notificationService');

// @desc  Get all users
// @route GET /api/admin/users
// @access Admin only
const getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find({}).sort({ createdAt: -1 });
  res.status(200).json({ success: true, users });
});

// @desc  Get all users with a pending role request
// @route GET /api/admin/role-requests
// @access Admin only
const getRoleRequests = asyncHandler(async (req, res) => {
  const users = await User.find({ 'pendingRoleRequest.status': 'pending' })
    .sort({ 'pendingRoleRequest.requestedAt': -1 });
  res.status(200).json({ success: true, users });
});

// @desc  Approve a user
// @route PUT /api/admin/users/:id/approve
// @access Admin only
const approveUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  user.status = 'active';
  user.approvedBy = req.user._id;
  user.approvedAt = new Date();
  await user.save();
  // Send approval email
  sendAccountApprovedEmail(user);
  res.status(200).json({
    success: true,
    message: `${user.firstName}'s account has been approved`,
    user: user.toPublicJSON(),
  });
});

// @desc  Reject a user
// @route PUT /api/admin/users/:id/reject
// @access Admin only
const rejectUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  user.status = 'rejected';
  await user.save();
  // Send rejection email
  sendAccountRejectedEmail(user);
  res.status(200).json({
    success: true,
    message: `${user.firstName}'s account has been rejected`,
    user: user.toPublicJSON(),
  });
});

// @desc  Undo rejection — set back to pending
// @route PUT /api/admin/users/:id/undoreject
// @access Admin only
const undoRejectUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  if (user.status !== 'rejected') {
    res.status(400);
    throw new Error('User is not in rejected state');
  }
  user.status = 'pending';
  user.approvedBy = null;
  user.approvedAt = null;
  await user.save();
  res.status(200).json({
    success: true,
    message: `${user.firstName}'s account has been moved back to pending`,
    user: user.toPublicJSON(),
  });
});

// @desc  Reapply — user resubmits with same or updated details
// @route PUT /api/auth/reapply
// @access Public (rejected users only)
const reapplyUser = asyncHandler(async (req, res) => {
  const { email, role, shopName, panNumber, vehicleType, citizenshipNumber } = req.body;

  const user = await User.findOne({ email, role });
  if (!user) {
    res.status(404);
    throw new Error('Account not found');
  }
  if (user.status !== 'rejected') {
    res.status(400);
    throw new Error('Only rejected accounts can reapply');
  }

  // Update any new details they provide
  if (shopName)          user.shopName          = shopName;
  if (panNumber)         user.panNumber         = panNumber;
  if (vehicleType)       user.vehicleType       = vehicleType;
  if (citizenshipNumber) user.citizenshipNumber = citizenshipNumber;

  user.status = 'pending';
  user.approvedBy = null;
  user.approvedAt = null;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Your application has been resubmitted for review. Please visit the NepShop office with your documents.',
    user: user.toPublicJSON(),
  });
});

// Terminal shipment statuses — everything else counts as "in flight" for the
// seller-deactivation warning (backend/routes/adminRoutes.js's
// deactivation-preview) and is unaffected by suspending the account itself.
const IN_FLIGHT_SHIPMENT_STATUSES = ['pending', 'confirmed', 'packed', 'dispatched'];

// @desc  Suspend a user — for sellers this IS "deactivate": account login is
//        blocked (existing status machinery — loginUser/requireActive both
//        already reject non-'active' status, so this is the whole lockout
//        mechanism, nothing new needed there) and, ADDITIONALLY for sellers
//        only, every currently-active product is hidden platform-wide and
//        flagged deactivatedBySystem so reactivation knows to bring back
//        only these ones (not products the seller had already turned off).
//        Behavior for non-seller roles is untouched.
// @route PUT /api/admin/users/:id/suspend
// @access Admin only
const suspendUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  if (user.role === 'admin') {
    res.status(400);
    throw new Error('Cannot suspend an admin account');
  }

  if (user.status === 'suspended') {
    res.status(400);
    throw new Error('User is already suspended');
  }

  user.status = 'suspended';
  await user.save();

  // Product-hiding — sellers only. No settlement/payout field is touched:
  // held/released shipment money keeps flowing through its existing
  // schedule regardless of the seller's account status.
  const userRoles = user.roles && user.roles.length ? user.roles : [user.role];
  if (userRoles.includes('seller')) {
    const Product = require('../models/Product');
    await Product.updateMany(
      { seller: user._id, isActive: true },
      { $set: { isActive: false, deactivatedBySystem: true } }
    );
  }

  res.status(200).json({
    success: true,
    message: `${user.firstName}'s account has been suspended`,
    user: user.toPublicJSON(),
  });
});

// @desc  Reactivate a suspended user — for sellers, ALSO restores only the
//        products this system deactivated (deactivatedBySystem:true);
//        anything the seller had turned off themselves stays off. Behavior
//        for non-seller roles is untouched.
// @route PUT /api/admin/users/:id/reactivate
// @access Admin only
const reactivateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  if (user.status !== 'suspended') {
    res.status(400);
    throw new Error('User is not suspended');
  }

  user.status = 'active';
  await user.save();

  const userRoles = user.roles && user.roles.length ? user.roles : [user.role];
  if (userRoles.includes('seller')) {
    const Product = require('../models/Product');
    await Product.updateMany(
      { seller: user._id, deactivatedBySystem: true },
      { $set: { isActive: true, deactivatedBySystem: false } }
    );
  }

  res.status(200).json({
    success: true,
    message: `${user.firstName}'s account has been reactivated`,
    user: user.toPublicJSON(),
  });
});

// @desc  Pre-check before deactivating a seller — in-flight shipment counts
//        by status, so the admin UI can warn before the account is
//        suspended (read-only, no side effects).
// @route GET /api/admin/users/:id/deactivation-preview
// @access Admin only
const getSellerDeactivationPreview = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const userRoles = user.roles && user.roles.length ? user.roles : [user.role];
  if (!userRoles.includes('seller')) {
    res.status(400);
    throw new Error('This account is not a seller');
  }

  const Shipment = require('../models/Shipment');
  const shipments = await Shipment.find({
    seller: user._id,
    status: { $in: IN_FLIGHT_SHIPMENT_STATUSES },
  }).select('status');

  const byStatus = { pending: 0, confirmed: 0, packed: 0, dispatched: 0 };
  shipments.forEach((s) => { byStatus[s.status] = (byStatus[s.status] || 0) + 1; });

  res.status(200).json({
    success:       true,
    inFlightCount: shipments.length,
    byStatus,
  });
});

// @desc  Get single user details
// @route GET /api/admin/users/:id
// @access Admin only
const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  res.status(200).json({ success: true, user });
});

// @desc  Delete a user
// @route DELETE /api/admin/users/:id
// @access Admin only
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  if (user.role === 'admin') {
    res.status(400);
    throw new Error('Cannot delete an admin account');
  }

  await user.deleteOne();

  res.status(200).json({
    success: true,
    message: `${user.firstName}'s account has been deleted`,
  });
});

// @desc  Get platform stats for admin dashboard
// @route GET /api/admin/stats
// @access Admin only
const getPlatformStats = asyncHandler(async (req, res) => {
  const Order   = require('../models/Order');
  const Product = require('../models/Product');

  const [
    totalUsers,
    totalCustomers,
    totalSellers,
    totalDelivery,
    pendingApprovals,
    totalProducts,
    totalOrders,
    deliveredOrders,
    totalRevenue,
  ] = await Promise.all([
    User.countDocuments({ role: { $ne: 'admin' } }),
    User.countDocuments({ role: 'customer' }),
    User.countDocuments({ role: 'seller' }),
    User.countDocuments({ role: 'delivery' }),
    User.countDocuments({ status: 'pending' }),
    Product.countDocuments({ isActive: true }),
    Order.countDocuments(),
    Order.countDocuments({ status: 'delivered' }),
    Order.aggregate([
      { $match: { status: 'delivered' } },
      { $group: { _id: null, total: { $sum: '$total' }, commission: { $sum: '$commissionAmount' } } },
    ]),
  ]);

  const revenue    = totalRevenue[0]?.total      || 0;
  const commission = totalRevenue[0]?.commission || 0;

  res.status(200).json({
    success: true,
    stats: {
      totalUsers,
      totalCustomers,
      totalSellers,
      totalDelivery,
      pendingApprovals,
      totalProducts,
      totalOrders,
      deliveredOrders,
      totalRevenue:    revenue,
      totalCommission: commission,
    },
  });
});

// @desc  Get all orders platform-wide
// @route GET /api/admin/orders
// @access Admin only
const getAllOrders = asyncHandler(async (req, res) => {
  const Order = require('../models/Order');
  const { page = 1, limit = 15, status, search } = req.query;

  const query = {};
  if (status) query.status = status;

  const total  = await Order.countDocuments(query);
  const orders = await Order.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .populate('customer',      'firstName lastName email phone')
    .populate('deliveryAgent', 'firstName lastName phone')
    .populate('items.seller',  'firstName lastName shopName');

  res.status(200).json({
    success: true,
    total,
    page:       Number(page),
    totalPages: Math.ceil(total / limit),
    orders,
  });
});

// @desc  Admin override order status
// @route PUT /api/admin/orders/:id/status
// @access Admin only
const adminUpdateOrderStatus = asyncHandler(async (req, res) => {
  const Order    = require('../models/Order');
  const Shipment = require('../models/Shipment');
  const { recomputeOrder } = require('../utils/orderAggregate');
  const { cancelShipment, finalizeOrderCancellation } = require('../utils/shipmentCancellation');
  const { status } = req.body;

  // Restricted to the three statuses admin override can safely apply.
  // 'delivered' and 'dispatched' are deliberately EXCLUDED here — both
  // bypass real side-effects a bare status write can't reproduce (settlement
  // init / delivery-agent assignment — see the diagnosis this gate came
  // from), and 'returned' is never admin-settable at all (it's a derived,
  // shipment-scoped outcome of the return flow, not a status to jump to).
  // The underlying per-status branches later in this function are left
  // intact, not deleted — this is a gate, not a capability removal.
  const validStatuses = ['pending', 'confirmed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    res.status(400);
    throw new Error(
      `Admin override only supports these statuses: ${validStatuses.join(', ')}. ` +
      `"${status}" must go through its normal flow (seller dispatch, delivery agent confirmation, or the return process) — not an admin override.`
    );
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  const previousStatus = order.status;
  const now = new Date();

  // The admin UI today only sends an order-level override (it doesn't list
  // shipments yet) — apply it to every non-terminal shipment on this order.
  const shipments = await Shipment.find({ order: order._id });
  for (const shipment of shipments) {
    if (['delivered', 'cancelled'].includes(shipment.status)) continue; // terminal — leave alone

    if (status === 'cancelled') {
      // Route through the SAME shared helper the customer/seller cancel
      // paths use — stock restore + paid-order refund recording here, and
      // (via finalizeOrderCancellation below) atomic voucher restore once
      // every shipment on the order ends up cancelled. Unlike the customer
      // path (gated to pending/confirmed only), admin can reach packed/
      // dispatched shipments too — cancelShipment's stock-restore and
      // refund math are unconditional on the shipment's prior status, so
      // this is safe for any non-terminal state.
      await cancelShipment(shipment, order);
      continue;
    }

    shipment.status = status;
    if (status === 'confirmed')  shipment.confirmedAt  = now;
    if (status === 'packed')     shipment.packedAt     = now;
    if (status === 'dispatched') shipment.dispatchedAt = now;
    if (status === 'delivered')  shipment.deliveredAt  = now;
    await shipment.save();
  }

  let updatedOrder = status === 'cancelled'
    ? (await finalizeOrderCancellation(order._id)).updatedOrder
    : await recomputeOrder(order._id);

  // Admin override is authoritative — force the order-level status even if
  // some shipments were already terminal and the derived rule disagrees.
  // ('return_assigned'/'return_in_transit' no longer apply at all — returns
  // are shipment-scoped now and never write those two order-status values;
  // 'returned' still can, once every shipment on the order is fully returned.)
  if (updatedOrder.status !== status && updatedOrder.status !== 'returned') {
    updatedOrder.status = status;
    if (status === 'confirmed')  updatedOrder.confirmedAt  = now;
    if (status === 'packed')     updatedOrder.packedAt     = now;
    if (status === 'dispatched') updatedOrder.dispatchedAt = now;
    if (status === 'delivered')  updatedOrder.deliveredAt  = now;
    if (status === 'cancelled')  updatedOrder.cancelledAt  = now;
    await updatedOrder.save();
  }

  // Notify customer
  const customer = await User.findById(updatedOrder.customer);
  if (customer) {
    const { sendOrderStatusEmail } = require('../utils/emailService');
    sendOrderStatusEmail(customer, updatedOrder, status);
    notifyOrderStatus(customer, updatedOrder, status);
  }

  res.status(200).json({
    success: true,
    message: `Order status updated from "${previousStatus}" to "${status}"`,
    order: updatedOrder,
  });
});

// @desc  Get commission settings and report
// @route GET /api/admin/commission
// @access Admin only
const getCommissionReport = asyncHandler(async (req, res) => {
  const Order    = require('../models/Order');
  const Shipment = require('../models/Shipment');
  const Return   = require('../models/Return');

  // Confirmed stats — shipments that REACHED delivery, grouped by their OWN
  // seller. Includes 'returned' alongside 'delivered' — a full-shipment
  // return is a terminal state a shipment only reaches FROM 'delivered'
  // (see orderAggregate.js), so its original commission/revenue are just as
  // real as any other delivered shipment's; only the reversal below should
  // net it back down, not a status filter dropping it from the base figures
  // entirely (that was the root cause of reversals-without-originals: a
  // shipment's own commission vanishing from this aggregate the moment it
  // finished returning, while its Return doc's reversal counted regardless).
  // (Also: previously this double-attributed a shared order's whole subtotal
  // to every seller in it — see DIAGNOSIS.md section 5/7. Aggregating over
  // Shipment fixes that at the source: each shipment belongs to one seller.)
  const confirmedStats = await Shipment.aggregate([
    { $match: { status: { $in: ['delivered', 'returned'] } } },
    {
      $group: {
        _id:                 '$seller',
        confirmedOrders:     { $sum: 1 },
        confirmedRevenue:    { $sum: '$sellerSubtotal' },
        confirmedCommission: { $sum: '$commissionAmount' },
      },
    },
  ]);

  // Pending stats — in-progress shipments
  const pendingStats = await Shipment.aggregate([
    { $match: { status: { $in: ['pending', 'confirmed', 'packed', 'dispatched'] } } },
    {
      $group: {
        _id:            '$seller',
        pendingOrders:  { $sum: 1 },
        pendingRevenue: { $sum: '$sellerSubtotal' },
      },
    },
  ]);

  // Merge both into one map
  const sellerMap = {};

  confirmedStats.forEach(s => {
    sellerMap[s._id] = {
      _id:                 s._id,
      confirmedOrders:     s.confirmedOrders,
      confirmedRevenue:    s.confirmedRevenue,
      confirmedCommission: s.confirmedCommission,
      pendingOrders:       0,
      pendingRevenue:      0,
    };
  });

  pendingStats.forEach(s => {
    if (sellerMap[s._id]) {
      sellerMap[s._id].pendingOrders  = s.pendingOrders;
      sellerMap[s._id].pendingRevenue = s.pendingRevenue;
    } else {
      sellerMap[s._id] = {
        _id:                 s._id,
        confirmedOrders:     0,
        confirmedRevenue:    0,
        confirmedCommission: 0,
        pendingOrders:       s.pendingOrders,
        pendingRevenue:      s.pendingRevenue,
      };
    }
  });

  // Completed returns give back commission (shrinks what NepShop keeps) and
  // reclaim voucher (shrinks what NepShop absorbed) — fold those reversals
  // in per-seller so "Commission" stays truthful after returns. Revenue
  // itself stays GROSS (not netted) — a return doesn't erase that the sale
  // happened; only NepShop's commission and the customer's voucher get
  // reversed. The reversal amount is kept on the row too so the UI can show
  // it explicitly rather than silently folding it away.
  const sellerReversals = await Return.aggregate([
    { $match: { status: 'refunded' } },
    { $group: { _id: '$seller', commissionReversal: { $sum: '$commissionReversal' } } },
  ]);
  const reversalBySeller = {};
  sellerReversals.forEach(r => { reversalBySeller[r._id.toString()] = r.commissionReversal; });

  Object.values(sellerMap).forEach(s => {
    const reversal = reversalBySeller[s._id.toString()] || 0;
    s.commissionReversal = round2(reversal);
    if (reversal) s.confirmedCommission = round2(s.confirmedCommission - reversal);
  });

  const sellers = Object.values(sellerMap).sort(
    (a, b) => b.confirmedRevenue - a.confirmedRevenue
  );

  // Populate seller info
  const populated = await User.populate(sellers, {
    path:   '_id',
    select: 'firstName lastName shopName email commissionRate',
  });

  // Overall confirmed stats. totalRevenue/totalOrders stay order-level and
  // 'delivered'-only, unchanged — those are whole-order concepts (an order
  // spanning multiple sellers only reads a single status, the least-advanced
  // of its shipments, so they're a coarser, pre-existing granularity choice
  // this fix doesn't touch). totalCouponDiscount moves OFF Order.aggregate
  // onto Shipment.aggregate (summing shipment.couponAllocation, exactly
  // parallel to productRevenue/totalCommission below) — a multi-seller
  // order's status can stay stuck below 'delivered' indefinitely even once
  // ONE of its shipments has fully delivered-then-returned, so gating this
  // figure on order.status silently drops shipments no matter what status
  // set is used there. Gating on shipment.status (like everything else here
  // already does) is both correct and consistent.
  const overallOrders = await Order.aggregate([
    { $match: { status: 'delivered' } },
    {
      $group: {
        _id:          null,
        totalRevenue: { $sum: '$total' },
        totalOrders:  { $sum: 1 },
      },
    },
  ]);

  // Shipments that REACHED delivery (see confirmedStats' comment above for
  // why 'returned' belongs alongside 'delivered').
  const overallShipments = await Shipment.aggregate([
    { $match: { status: { $in: ['delivered', 'returned'] } } },
    {
      $group: {
        _id:                    null,
        productRevenue:         { $sum: '$sellerSubtotal' },
        totalCommission:        { $sum: '$commissionAmount' },
        totalDeliveryCharge:    { $sum: '$deliveryCharge' },
        totalDeliveryPaid:      { $sum: '$deliveryEarning' },
        totalCouponAllocation:  { $sum: '$couponAllocation' },
      },
    },
  ]);

  const ordersAgg    = overallOrders[0]    || { totalRevenue: 0, totalOrders: 0 };
  const shipmentsAgg = overallShipments[0] || { productRevenue: 0, totalCommission: 0, totalDeliveryCharge: 0, totalDeliveryPaid: 0, totalCouponAllocation: 0 };

  // Completed returns give back commission, reclaim voucher, and pay a
  // SECOND agent leg (the return-pickup, on top of the original delivery)
  // — all three must flow through here so "Commission", "Coupons Funded",
  // and "Paid to Agents" stay truthful after a return.
  const overallReversal = await Return.aggregate([
    { $match: { status: 'refunded' } },
    {
      $group: {
        _id: null,
        totalCommissionReversal: { $sum: '$commissionReversal' },
        totalVoucherReclaimed:   { $sum: '$voucherReclaimed' },
        totalPickupEarnings:     { $sum: '$returnAgentEarning' },
      },
    },
  ]);
  const reversalAgg = overallReversal[0] || { totalCommissionReversal: 0, totalVoucherReclaimed: 0, totalPickupEarnings: 0 };

  const totalCommission     = round2(shipmentsAgg.totalCommission - reversalAgg.totalCommissionReversal);
  const totalCouponDiscount = round2(shipmentsAgg.totalCouponAllocation - reversalAgg.totalVoucherReclaimed);
  const totalDeliveryPaid   = round2(shipmentsAgg.totalDeliveryPaid + reversalAgg.totalPickupEarnings);

  const deliveryMargin = round2(shipmentsAgg.totalDeliveryCharge - totalDeliveryPaid);
  const nepShopIncome  = round2(totalCommission + deliveryMargin - totalCouponDiscount);

  // Overall pending stats — unaffected by the split, order-level total is still correct
  const overallPending = await Order.aggregate([
    { $match: { status: { $in: ['pending', 'confirmed', 'packed', 'dispatched'] } } },
    {
      $group: {
        _id:            null,
        pendingRevenue: { $sum: '$total' },
        pendingOrders:  { $sum: 1 },
      },
    },
  ]);

  res.status(200).json({
    success: true,
    overall: {
      totalRevenue:        ordersAgg.totalRevenue,
      productRevenue:      shipmentsAgg.productRevenue,
      totalCommission,
      totalDeliveryCharge: shipmentsAgg.totalDeliveryCharge,
      totalDeliveryPaid,
      totalCouponDiscount,
      totalOrders:         ordersAgg.totalOrders,
      deliveryMargin,
      nepShopIncome,
      pendingRevenue: overallPending[0]?.pendingRevenue || 0,
      pendingOrders:  overallPending[0]?.pendingOrders  || 0,
    },
    sellers: populated,
  });
});

// @desc  Update commission rate for a seller
// @route PUT /api/admin/commission/:sellerId
// @access Admin only
const updateSellerCommission = asyncHandler(async (req, res) => {
  const { commissionRate } = req.body;

  if (commissionRate < 0 || commissionRate > 50) {
    res.status(400);
    throw new Error('Commission rate must be between 0 and 50 percent');
  }

  const seller = await User.findById(req.params.sellerId);
  if (!seller || seller.role !== 'seller') {
    res.status(404);
    throw new Error('Seller not found');
  }

  seller.commissionRate = commissionRate;
  await seller.save();

  res.status(200).json({
    success: true,
    message: `Commission rate updated to ${commissionRate}% for ${seller.shopName}`,
    seller: seller.toPublicJSON(),
  });
});

// @desc  Manually trigger settlement release (testing/admin)
// @route POST /api/admin/settlement/release
// @access Admin only
const releaseSettlements = asyncHandler(async (req, res) => {
  const Shipment = require('../models/Shipment');
  const now = new Date();

  // For manual trigger: release any delivered 'partial' shipment whose lock passed.
  // Shipments held for an active return (returnHold) are excluded.
  const toRelease = await Shipment.find({
    status: 'delivered',
    returnHold: false,
    'settlement.status': 'partial',
    'settlement.sellerReleased': false,
    'settlement.lockUntil': { $lte: now },
  });

  let released = 0;
  for (const shipment of toRelease) {
    shipment.settlement.status           = 'released';
    shipment.settlement.sellerReleased   = true;
    shipment.settlement.sellerReleasedAt = now;
    shipment.settlement.commissionBooked = true;
    shipment.settlement.settledAt        = now;
    await shipment.save();
    released++;
  }

  res.status(200).json({
    success: true,
    message: `Released ${released} shipment(s) that passed their return window.`,
    released,
  });
});

// @desc  Get pending payouts (sellers + delivery agents)
// @route GET /api/admin/payouts
// @access Admin only
const getPayouts = asyncHandler(async (req, res) => {
  const Shipment = require('../models/Shipment');

  // ── SELLER PAYOUTS ──────────────────────────────────────
  // Released seller earnings (cleared escrow) not yet paid out — one shipment
  // = one seller, counted once, for that seller only. ALSO pull in any
  // shipment carrying a nonzero settlement.adjustment regardless of its own
  // paidOut state — that's a return reversal that landed AFTER release/payout
  // (see returnController.completeReturn), netted here so it offsets this
  // seller's pending total (possibly making it negative) until reconciled.
  const sellerShipments = await Shipment.find({
    $or: [
      { 'settlement.sellerReleased': true, 'settlement.sellerPaidOut': false },
      { 'settlement.adjustment': { $ne: 0 } },
    ],
  }).select('seller settlement');

  const sellerMap = {};
  for (const shipment of sellerShipments) {
    const sid = shipment.seller.toString();
    if (!sellerMap[sid]) sellerMap[sid] = { sellerId: sid, amount: 0, orders: 0, orderIds: [] };
    if (shipment.settlement.sellerReleased && !shipment.settlement.sellerPaidOut) {
      sellerMap[sid].amount += shipment.settlement.sellerShare || 0;
      sellerMap[sid].orders += 1;
      sellerMap[sid].orderIds.push(shipment._id);
    }
    sellerMap[sid].amount += shipment.settlement.adjustment || 0;
  }

  // ── AGENT PAYOUTS ───────────────────────────────────────
  // Delivery agent earnings (paid on delivery) not yet paid out.
  const agentShipments = await Shipment.find({
    'settlement.deliveryAgentPaid': true,
    'settlement.agentPaidOut':      false,
    deliveryAgent: { $ne: null },
  }).select('deliveryAgent deliveryEarning settlement');

  const agentMap = {};
  for (const shipment of agentShipments) {
    const aid = shipment.deliveryAgent.toString();
    if (!agentMap[aid]) agentMap[aid] = { agentId: aid, amount: 0, jobs: 0, deliveryJobs: 0, pickupJobs: 0, orderIds: [] };
    agentMap[aid].amount += shipment.deliveryEarning || 50;
    agentMap[aid].jobs   += 1;
    agentMap[aid].deliveryJobs += 1;
    agentMap[aid].orderIds.push(shipment._id);
  }

  // Return-pickup leg — a SEPARATE leg, possibly a different agent than the
  // shipment's own deliveryAgent, earned only once a return actually
  // completes (status 'refunded' — see Return.pickupPaidOut's comment).
  // Grouped into the SAME agentMap entry as that agent's delivery earnings,
  // so one "Mark Paid" pays both legs together.
  const Return = require('../models/Return');
  const pickupReturns = await Return.find({
    status: 'refunded',
    pickupPaidOut: false,
    returnAgent: { $ne: null },
  }).select('returnAgent returnAgentEarning');

  for (const ret of pickupReturns) {
    const aid = ret.returnAgent.toString();
    if (!agentMap[aid]) agentMap[aid] = { agentId: aid, amount: 0, jobs: 0, deliveryJobs: 0, pickupJobs: 0, orderIds: [] };
    agentMap[aid].amount += ret.returnAgentEarning || 50;
    agentMap[aid].jobs   += 1;
    agentMap[aid].pickupJobs += 1;
  }

  // Populate seller + agent names
  const sellers = await User.populate(Object.values(sellerMap), {
    path: 'sellerId', select: 'firstName lastName shopName email payoutDetails',
  });
  const agents = await User.populate(Object.values(agentMap), {
    path: 'agentId', select: 'firstName lastName email vehicleType payoutDetails',
  });

  const totalSellerPayout = sellers.reduce((s, x) => s + x.amount, 0);
  const totalAgentPayout  = agents.reduce((s, x) => s + x.amount, 0);

  // Seller money still locked in escrow (delivered, not yet released)
  const escrowShipments = await Shipment.find({
    'settlement.status': 'partial',
    'settlement.sellerReleased': false,
  }).select('settlement');
  const inEscrow = escrowShipments.reduce((s, x) => s + (x.settlement.sellerShare || 0), 0);

  res.status(200).json({
    success: true,
    sellers,
    agents,
    totals: {
      sellerPayout: totalSellerPayout,
      agentPayout:  totalAgentPayout,
      grandTotal:   totalSellerPayout + totalAgentPayout,
      inEscrow,
    },
  });
});

// @desc  Mark a seller's released earnings as paid out
// @route POST /api/admin/payouts/seller/:sellerId
// @access Admin only
const paySeller = asyncHandler(async (req, res) => {
  const Shipment = require('../models/Shipment');
  const now = new Date();

  // Guard — mirror getPayouts' per-seller amount computation exactly, so
  // "Mark Paid" can never fire on a balance that isn't actually payable. A
  // seller can carry a NEGATIVE net (a return reversal landing in
  // settlement.adjustment can exceed what's newly released) — that means
  // the seller owes NepShop money back, not the other way around, and must
  // be resolved out-of-band, not "paid". Read-only; runs BEFORE any write.
  const guardShipments = await Shipment.find({
    seller: req.params.sellerId,
    $or: [
      { 'settlement.sellerReleased': true, 'settlement.sellerPaidOut': false },
      { 'settlement.adjustment': { $ne: 0 } },
    ],
  }).select('settlement');

  let payableAmount = 0;
  for (const s of guardShipments) {
    if (s.settlement.sellerReleased && !s.settlement.sellerPaidOut) {
      payableAmount += s.settlement.sellerShare || 0;
    }
    payableAmount += s.settlement.adjustment || 0;
  }
  payableAmount = round2(payableAmount);

  if (payableAmount <= 0) {
    res.status(400);
    throw new Error(`This seller's balance is not positive (Rs ${payableAmount}) — nothing to pay out. A negative balance means the seller owes NepShop back from a return reversal; it must be recovered, not marked paid.`);
  }

  const result = await Shipment.updateMany(
    {
      seller: req.params.sellerId,
      'settlement.sellerReleased': true,
      'settlement.sellerPaidOut':  false,
    },
    {
      $set: {
        'settlement.sellerPaidOut':   true,
        'settlement.sellerPaidOutAt': now,
      },
    }
  );

  const seller = await User.findById(req.params.sellerId);

  // Compute the amount we just paid (sum of released, now-paid sellerShares) —
  // scoped to THIS seller's shipments only, so a co-seller sharing an order
  // is completely unaffected.
  const paidShipments = await Shipment.find({
    seller: req.params.sellerId,
    'settlement.sellerPaidOut': true,
    'settlement.sellerPaidOutAt': now,
  }).select('settlement');
  let paidAmount = paidShipments.reduce((s, x) => s + (x.settlement.sellerShare || 0), 0);

  // Net any outstanding adjustments (return reversals that landed after an
  // earlier release/payout) into THIS payout event, then clear them — they've
  // now been reconciled against the seller's payout, possibly reducing (or
  // going negative on) the amount actually disbursed.
  const adjustedShipments = await Shipment.find({
    seller: req.params.sellerId,
    'settlement.adjustment': { $ne: 0 },
  }).select('settlement');
  for (const shipment of adjustedShipments) {
    paidAmount += shipment.settlement.adjustment;
    shipment.settlement.adjustment = 0;
    await shipment.save();
  }
  paidAmount = round2(paidAmount);

  if (seller && (result.modifiedCount > 0 || adjustedShipments.length > 0)) {
    const { sendPayoutProcessedEmail } = require('../utils/emailService');
    const method = seller.payoutDetails?.preferredMethod || 'registered payout method';
    sendPayoutProcessedEmail(seller, paidAmount, method);
    notifyPayoutProcessed(seller, paidAmount, method);
  }

  res.status(200).json({
    success: true,
    message: `Marked ${result.modifiedCount} order(s) as paid out for this seller.`,
  });
});

// @desc  Mark a delivery agent's earnings as paid out
// @route POST /api/admin/payouts/agent/:agentId
// @access Admin only
const payAgent = asyncHandler(async (req, res) => {
  const Shipment = require('../models/Shipment');
  const Return   = require('../models/Return');
  const now = new Date();

  const result = await Shipment.updateMany(
    {
      deliveryAgent: req.params.agentId,
      'settlement.deliveryAgentPaid': true,
      'settlement.agentPaidOut':      false,
    },
    {
      $set: {
        'settlement.agentPaidOut':   true,
        'settlement.agentPaidOutAt': now,
      },
    }
  );

  // Return-pickup leg — same idempotent, filter-encoded status-transition
  // pattern as the reject fix (returnController.processReturn): the current
  // unpaid state (pickupPaidOut: false) is part of THIS update's filter, so
  // a concurrent/double pay call matches nothing the second time.
  const pickupResult = await Return.updateMany(
    {
      returnAgent: req.params.agentId,
      status: 'refunded',
      pickupPaidOut: false,
    },
    {
      $set: {
        pickupPaidOut:   true,
        pickupPaidOutAt: now,
      },
    }
  );

  const agent = await User.findById(req.params.agentId);
  const paidJobs = await Shipment.find({
    deliveryAgent: req.params.agentId,
    'settlement.agentPaidOut': true,
    'settlement.agentPaidOutAt': now,
  }).select('deliveryEarning');
  const paidPickups = await Return.find({
    returnAgent: req.params.agentId,
    pickupPaidOut: true,
    pickupPaidOutAt: now,
  }).select('returnAgentEarning');
  const paidAmount = paidJobs.reduce((s, x) => s + (x.deliveryEarning || 50), 0)
    + paidPickups.reduce((s, x) => s + (x.returnAgentEarning || 50), 0);

  if (agent && (result.modifiedCount > 0 || pickupResult.modifiedCount > 0)) {
    const { sendPayoutProcessedEmail } = require('../utils/emailService');
    const method = agent.payoutDetails?.preferredMethod || 'registered payout method';
    sendPayoutProcessedEmail(agent, paidAmount, method);
    notifyPayoutProcessed(agent, paidAmount, method);
  }

  res.status(200).json({
    success: true,
    message: `Marked ${result.modifiedCount} delivery job(s) and ${pickupResult.modifiedCount} return pickup(s) as paid out for this agent.`,
  });
});

// @desc  Get payout history (already-paid disbursements)
// @route GET /api/admin/payouts/history
// @access Admin only
const getPayoutHistory = asyncHandler(async (req, res) => {
  const Shipment = require('../models/Shipment');

  // ── Seller payouts already made ─────────────────────────
  const sellerPaid = await Shipment.find({
    'settlement.sellerPaidOut': true,
  })
    .select('seller settlement')
    .populate('seller', 'firstName lastName shopName email');

  // Group by seller + payout timestamp (one click = one payout event)
  const sellerEvents = {};
  for (const shipment of sellerPaid) {
    const paidAt = shipment.settlement.sellerPaidOutAt;
    if (!paidAt || !shipment.seller) continue;
    const sid = shipment.seller._id.toString();
    const key = `${sid}_${new Date(paidAt).getTime()}`;
    if (!sellerEvents[key]) {
      sellerEvents[key] = {
        type:       'seller',
        name:       shipment.seller.shopName || `${shipment.seller.firstName} ${shipment.seller.lastName}`,
        email:      shipment.seller.email || '',
        amount:     0,
        orderCount: 0,
        paidAt,
      };
    }
    sellerEvents[key].amount     += shipment.settlement.sellerShare || 0;
    sellerEvents[key].orderCount += 1;
  }

  // ── Agent payouts already made ──────────────────────────
  const agentPaid = await Shipment.find({
    'settlement.agentPaidOut': true,
  })
    .select('deliveryAgent deliveryEarning settlement')
    .populate('deliveryAgent', 'firstName lastName email vehicleType');

  const agentEvents = {};
  for (const shipment of agentPaid) {
    const paidAt = shipment.settlement.agentPaidOutAt;
    if (!paidAt || !shipment.deliveryAgent) continue;
    const aid = shipment.deliveryAgent._id.toString();
    const key = `${aid}_${new Date(paidAt).getTime()}`;
    if (!agentEvents[key]) {
      agentEvents[key] = {
        type:       'agent',
        name:       `${shipment.deliveryAgent.firstName} ${shipment.deliveryAgent.lastName}`,
        email:      shipment.deliveryAgent.email || '',
        amount:     0,
        orderCount: 0,
        paidAt,
      };
    }
    agentEvents[key].amount     += shipment.deliveryEarning || 50;
    agentEvents[key].orderCount += 1;
  }

  // ── Return-pickup payouts already made ──────────────────
  // Merges into the SAME agentEvents entry as that agent's delivery payouts
  // when they share a timestamp — payAgent stamps both legs with one `now`
  // per click, so one payout click always reads back as one history row.
  const Return = require('../models/Return');
  const pickupPaid = await Return.find({
    pickupPaidOut: true,
  })
    .select('returnAgent returnAgentEarning pickupPaidOutAt')
    .populate('returnAgent', 'firstName lastName email vehicleType');

  for (const ret of pickupPaid) {
    const paidAt = ret.pickupPaidOutAt;
    if (!paidAt || !ret.returnAgent) continue;
    const aid = ret.returnAgent._id.toString();
    const key = `${aid}_${new Date(paidAt).getTime()}`;
    if (!agentEvents[key]) {
      agentEvents[key] = {
        type:       'agent',
        name:       `${ret.returnAgent.firstName} ${ret.returnAgent.lastName}`,
        email:      ret.returnAgent.email || '',
        amount:     0,
        orderCount: 0,
        paidAt,
      };
    }
    agentEvents[key].amount     += ret.returnAgentEarning || 50;
    agentEvents[key].orderCount += 1;
  }

  // Combine and sort by date (newest first)
  const history = [...Object.values(sellerEvents), ...Object.values(agentEvents)]
    .sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));

  const totalPaid = history.reduce((s, h) => s + h.amount, 0);

  res.status(200).json({
    success: true,
    history,
    totalPaid,
  });
});

module.exports = {
  getAllUsers,
  getRoleRequests,
  approveUser,
  rejectUser,
  undoRejectUser,
  reapplyUser,
  suspendUser,
  reactivateUser,
  getSellerDeactivationPreview,
  getUserById,
  deleteUser,
  getPlatformStats,
  getAllOrders,
  adminUpdateOrderStatus,
  getCommissionReport,
  updateSellerCommission,
  releaseSettlements,
  getPayouts,
  paySeller,
  payAgent,
  getPayoutHistory,
};
