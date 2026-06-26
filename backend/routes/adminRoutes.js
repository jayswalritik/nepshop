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
  getUserById,
  deleteUser,
  getPlatformStats,
  getAllOrders,
  adminUpdateOrderStatus,
  getCommissionReport,
  updateSellerCommission,
} = require('../controllers/adminController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

// ── Shared route — sellers and admins ─────────────────────
router.get(
  '/delivery-agents',
  protect,
  authorizeRoles('seller', 'admin'),
  asyncHandler(async (req, res) => {
    const agents = await User.find({ role: 'delivery', status: 'active' })
      .select('firstName lastName phone vehicleType');
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
router.put('/users/:id/suspend',      suspendUser);
router.put('/users/:id/reactivate',   reactivateUser);
router.delete('/users/:id',           deleteUser);

// Order monitoring
router.get('/orders',                 getAllOrders);
router.put('/orders/:id/status',      adminUpdateOrderStatus);

// Commission
router.get('/commission',             getCommissionReport);
router.put('/commission/:sellerId',   updateSellerCommission);

module.exports = router;