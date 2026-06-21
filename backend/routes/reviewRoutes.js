const express = require('express');
const {
  addReview,
  getProductReviews,
  getSellerReviews,
  deleteReview,
  canReview,
} = require('../controllers/reviewController');
const { protect, authorizeRoles, requireActive } = require('../middleware/authMiddleware');

const router = express.Router();

// ── Public ────────────────────────────────────────────────
router.get('/:productId', getProductReviews);

// ── Customer only ─────────────────────────────────────────
router.post('/',
  protect, authorizeRoles('customer'), requireActive,
  addReview
);
router.get('/can-review/:productId',
  protect, authorizeRoles('customer'), requireActive,
  canReview
);
router.delete('/:id',
  protect, authorizeRoles('customer', 'admin'), requireActive,
  deleteReview
);

// ── Seller only ───────────────────────────────────────────
router.get('/seller/all',
  protect, authorizeRoles('seller'), requireActive,
  getSellerReviews
);

module.exports = router;