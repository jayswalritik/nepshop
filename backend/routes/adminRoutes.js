const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const express = require('express');
const {
  getAllUsers,
  approveUser,
  rejectUser,
  undoRejectUser,
} = require('../controllers/adminController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

// ── Shared route — sellers and admins ─────────────────────
// Must be defined BEFORE the admin-only middleware below
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
// Everything below this line requires admin role
router.use(protect);
router.use(authorizeRoles('admin'));

router.get('/users', getAllUsers);
router.put('/users/:id/approve', approveUser);
router.put('/users/:id/reject', rejectUser);
router.put('/users/:id/undoreject', undoRejectUser);

module.exports = router;