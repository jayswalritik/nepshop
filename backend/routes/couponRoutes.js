const express = require('express');
const {
  createCoupon,
  getAllCoupons,
  toggleCoupon,
  deleteCoupon,
  validateCoupon,
  getAvailableCoupons,
} = require('../controllers/couponController');
const { protect, authorizeRoles, requireActive } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

// Customer — available offers + validate at checkout
router.get('/available', requireActive, authorizeRoles('customer'), getAvailableCoupons);
router.post('/validate', requireActive, authorizeRoles('customer'), validateCoupon);

// Admin — manage coupons
router.post('/',            authorizeRoles('admin'), createCoupon);
router.get('/',             authorizeRoles('admin'), getAllCoupons);
router.put('/:id/toggle',   authorizeRoles('admin'), toggleCoupon);
router.delete('/:id',       authorizeRoles('admin'), deleteCoupon);

module.exports = router;