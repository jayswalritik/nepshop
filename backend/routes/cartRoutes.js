const express = require('express');
const {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
} = require('../controllers/cartController');
const { protect, authorizeRoles, requireActive } = require('../middleware/authMiddleware');

const router = express.Router();

// All cart routes — customer only
router.use(protect);
router.use(authorizeRoles('customer'));
router.use(requireActive);

router.get('/',                  getCart);        // Get cart
router.post('/',                 addToCart);      // Add item
router.put('/:productId',        updateCartItem); // Update quantity
router.delete('/:productId',     removeFromCart); // Remove item
router.delete('/',               clearCart);      // Clear cart

module.exports = router;