const express = require('express');
const {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
} = require('../controllers/wishlistController');
const { protect, authorizeRoles, requireActive } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);
router.use(requireActive);
router.use(authorizeRoles('customer'));

router.get('/',             getWishlist);
router.post('/:productId',  addToWishlist);
router.delete('/:productId', removeFromWishlist);

module.exports = router;