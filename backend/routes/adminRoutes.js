const express = require('express');
const {
  getAllUsers,
  approveUser,
  rejectUser,
  undoRejectUser,
} = require('../controllers/adminController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

// All admin routes are protected and admin-only
router.use(protect);
router.use(authorizeRoles('admin'));

router.get('/users', getAllUsers);
router.put('/users/:id/approve', approveUser);
router.put('/users/:id/reject', rejectUser);
router.put('/users/:id/undoreject', undoRejectUser);

module.exports = router;