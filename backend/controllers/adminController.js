const asyncHandler = require('express-async-handler');
const User = require('../models/User');

const {
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
} = require('../utils/emailService');

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

// @desc  Suspend a user
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

  // Send suspension email
  const { sendEmail } = require('../utils/emailService');

  res.status(200).json({
    success: true,
    message: `${user.firstName}'s account has been suspended`,
    user: user.toPublicJSON(),
  });
});

// @desc  Reactivate a suspended user
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

  res.status(200).json({
    success: true,
    message: `${user.firstName}'s account has been reactivated`,
    user: user.toPublicJSON(),
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
  const Order = require('../models/Order');
  const { status } = req.body;

  const validStatuses = ['pending', 'confirmed', 'packed', 'dispatched', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    res.status(400);
    throw new Error('Invalid status');
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  const previousStatus = order.status;
  order.status = status;

  if (status === 'confirmed')  order.confirmedAt  = new Date();
  if (status === 'packed')     order.packedAt     = new Date();
  if (status === 'dispatched') order.dispatchedAt = new Date();
  if (status === 'delivered')  order.deliveredAt  = new Date();
  if (status === 'cancelled')  order.cancelledAt  = new Date();

  await order.save();

  // Notify customer
  const customer = await User.findById(order.customer);
  if (customer) {
    const { sendOrderStatusEmail } = require('../utils/emailService');
    sendOrderStatusEmail(customer, order, status);
  }

  res.status(200).json({
    success: true,
    message: `Order status updated from "${previousStatus}" to "${status}"`,
    order,
  });
});

// @desc  Get commission settings and report
// @route GET /api/admin/commission
// @access Admin only
const getCommissionReport = asyncHandler(async (req, res) => {
  const Order = require('../models/Order');

// Confirmed stats — delivered orders only
const confirmedStats = await Order.aggregate([
  { $match: { status: 'delivered' } },
  { $unwind: '$items' },
  {
    $group: {
      _id:                 '$items.seller',
      confirmedOrders:     { $addToSet: '$_id' },
    },
  },
  {
    $lookup: {
      from:         'orders',
      localField:   'confirmedOrders',
      foreignField: '_id',
      as:           'orderDocs',
    },
  },
  {
    $project: {
      confirmedOrders:     { $size: '$confirmedOrders' },
      confirmedRevenue:    { $sum: '$orderDocs.subtotal' },        // product revenue, not total
      confirmedCommission: { $sum: '$orderDocs.commissionAmount' },
    },
  },
]);  
// Pending stats — in-progress orders
const pendingStats = await Order.aggregate([
  { $match: { status: { $in: ['pending', 'confirmed', 'packed', 'dispatched'] } } },
  { $unwind: '$items' },
  {
    $group: {
      _id:           '$items.seller',
      pendingOrders: { $addToSet: '$_id' },
    },
  },
  {
    $lookup: {
      from:         'orders',
      localField:   'pendingOrders',
      foreignField: '_id',
      as:           'orderDocs',
    },
  },
  {
    $project: {
      pendingOrders:  { $size: '$pendingOrders' },
      pendingRevenue: { $sum: '$orderDocs.subtotal' },
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

  const sellers = Object.values(sellerMap).sort(
    (a, b) => b.confirmedRevenue - a.confirmedRevenue
  );

  // Populate seller info
  const populated = await User.populate(sellers, {
    path:   '_id',
    select: 'firstName lastName shopName email commissionRate',
  });

// Overall confirmed stats — delivered orders only
  const overall = await Order.aggregate([
    { $match: { status: 'delivered' } },
    {
      $group: {
        _id:             null,
        totalRevenue:    { $sum: '$total' },          // what customers paid (after coupon)
        productRevenue:  { $sum: '$subtotal' },        // product portion
        totalCommission: { $sum: '$commissionAmount' },// NepShop commission income
        totalDeliveryCharge: { $sum: '$deliveryCharge' }, // delivery collected from customers
        totalDeliveryPaid:   { $sum: '$deliveryEarning' }, // paid to agents
        totalCouponDiscount: { $sum: '$couponDiscount' },  // discounts NepShop funded
        totalOrders:     { $sum: 1 },
      },
    },
    {
      $project: {
        totalRevenue:        1,
        productRevenue:      1,
        totalCommission:     1,
        totalDeliveryCharge: 1,
        totalDeliveryPaid:   1,
        totalCouponDiscount: 1,
        totalOrders:         1,
        // NepShop delivery margin = collected − paid to agents
        deliveryMargin: { $subtract: ['$totalDeliveryCharge', '$totalDeliveryPaid'] },
        // Total NepShop income = commission + delivery margin − coupons NepShop funded
        nepShopIncome: {
          $subtract: [
            { $add: ['$totalCommission', { $subtract: ['$totalDeliveryCharge', '$totalDeliveryPaid'] }] },
            '$totalCouponDiscount',
          ],
        },
      },
    },
  ]);
  
  // Overall pending stats
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
      ...(overall[0] || { totalRevenue: 0, totalCommission: 0, totalOrders: 0 }),
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
  const Order = require('../models/Order');
  const now = new Date();

  // For manual trigger: release any delivered 'partial' order whose lock passed
  const toRelease = await Order.find({
    status: 'delivered',
    'settlement.status': 'partial',
    'settlement.sellerReleased': false,
    'settlement.lockUntil': { $lte: now },
  });

  let released = 0;
  for (const order of toRelease) {
    order.settlement.status           = 'released';
    order.settlement.sellerReleased   = true;
    order.settlement.sellerReleasedAt = now;
    order.settlement.commissionBooked = true;
    order.settlement.settledAt        = now;
    await order.save();
    released++;
  }

  res.status(200).json({
    success: true,
    message: `Released ${released} order(s) that passed their return window.`,
    released,
  });
});

// @desc  Get pending payouts (sellers + delivery agents)
// @route GET /api/admin/payouts
// @access Admin only
const getPayouts = asyncHandler(async (req, res) => {
  const Order = require('../models/Order');

  // ── SELLER PAYOUTS ──────────────────────────────────────
  // Released seller earnings (cleared escrow) not yet paid out
  const sellerOrders = await Order.find({
    'settlement.sellerReleased': true,
    'settlement.sellerPaidOut':  false,
  }).select('items subtotal commissionAmount settlement total');

  const sellerMap = {};
  for (const order of sellerOrders) {
    // An order can have items from one seller in your model (single-seller orders)
    const sellerIds = [...new Set(order.items.map(i => i.seller.toString()))];
    for (const sid of sellerIds) {
      if (!sellerMap[sid]) sellerMap[sid] = { sellerId: sid, amount: 0, orders: 0, orderIds: [] };
      sellerMap[sid].amount  += order.settlement.sellerShare || 0;
      sellerMap[sid].orders  += 1;
      sellerMap[sid].orderIds.push(order._id);
    }
  }

  // ── AGENT PAYOUTS ───────────────────────────────────────
  // Delivery agent earnings (paid on delivery) not yet paid out.
  // Includes forward delivery (deliveryEarning) on delivered/returned orders.
  const agentOrders = await Order.find({
    'settlement.deliveryAgentPaid': true,
    'settlement.agentPaidOut':      false,
    deliveryAgent: { $ne: null },
  }).select('deliveryAgent deliveryEarning settlement');

  const agentMap = {};
  for (const order of agentOrders) {
    const aid = order.deliveryAgent.toString();
    if (!agentMap[aid]) agentMap[aid] = { agentId: aid, amount: 0, jobs: 0, orderIds: [] };
    agentMap[aid].amount += order.deliveryEarning || 50;
    agentMap[aid].jobs   += 1;
    agentMap[aid].orderIds.push(order._id);
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
  const escrowOrders = await Order.find({
    'settlement.status': 'partial',
    'settlement.sellerReleased': false,
  }).select('settlement');
  const inEscrow = escrowOrders.reduce((s, o) => s + (o.settlement.sellerShare || 0), 0);

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
  const Order = require('../models/Order');
  const now = new Date();

  const result = await Order.updateMany(
    {
      'items.seller': req.params.sellerId,
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

  // Optional: email the seller their payout was processed
  if (seller) {
    const { sendPayoutProcessedEmail } = require('../utils/emailService');
    // amount isn't recomputed here; email is informational
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
  const Order = require('../models/Order');
  const now = new Date();

  const result = await Order.updateMany(
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

  res.status(200).json({
    success: true,
    message: `Marked ${result.modifiedCount} delivery job(s) as paid out for this agent.`,
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
};