const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const express = require('express');
const {
  getAllUsers,
  getRoleRequests,
  approveUser,
  rejectUser,
  undoRejectUser,
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
  getPayoutHistory,
  paySeller,
  payAgent,
} = require('../controllers/adminController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

// ── Shared route — sellers and admins ─────────────────────
router.get(
  '/delivery-agents',
  protect,
  authorizeRoles('seller', 'admin'),
  asyncHandler(async (req, res) => {
    // Available agents first (then alphabetical within each group) — the
    // ONLY place this needs sorting, since both the seller dispatch picker
    // and the admin return-pickup picker read this same endpoint.
    const agents = await User.find({ role: 'delivery', status: 'active' })
      .select('firstName lastName phone vehicleType isAvailable')
      .sort({ isAvailable: -1, firstName: 1 });
    res.status(200).json({ success: true, agents });
  })
);

// ── Admin only routes ─────────────────────────────────────
router.use(protect);
router.use(authorizeRoles('admin'));

// Stats
router.get('/stats', getPlatformStats);

// User management
router.get('/users',                  getAllUsers);
router.get('/role-requests',          getRoleRequests);
router.get('/users/:id',              getUserById);
router.put('/users/:id/approve',      approveUser);
router.put('/users/:id/reject',       rejectUser);
router.put('/users/:id/undoreject',   undoRejectUser);
// Seller-deactivation warning precheck — read-only, before the same
// suspend/reactivate actions below (extended to hide/restore seller
// products; see adminController.js).
router.get('/users/:id/deactivation-preview', getSellerDeactivationPreview);
router.put('/users/:id/suspend',      suspendUser);
router.put('/users/:id/reactivate',   reactivateUser);
router.delete('/users/:id',           deleteUser);

// Order monitoring
router.get('/orders',                 getAllOrders);
router.put('/orders/:id/status',      adminUpdateOrderStatus);

// Commission
router.get('/commission',             getCommissionReport);
router.put('/commission/:sellerId',   updateSellerCommission);

router.post('/settlement/release', releaseSettlements);

// Payouts
router.get('/payouts',                    getPayouts);
router.get('/payouts/history',            getPayoutHistory);
router.post('/payouts/seller/:sellerId',  paySeller);
router.post('/payouts/agent/:agentId',    payAgent);

module.exports = router;