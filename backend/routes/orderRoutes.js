const express = require('express');
const {
  placeOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  getSellerOrders,
  updateOrderStatus,
  cancelShipmentByCustomer,
} = require('../controllers/orderController');
const { protect, authorizeRoles, requireActive } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);
router.use(requireActive);

// ── Customer routes ───────────────────────────────────────
router.post('/',           authorizeRoles('customer'), placeOrder);
router.get('/my',          authorizeRoles('customer'), getMyOrders);
// Specific path before /:id/cancel — per-PACKAGE cancel (one shipment), as
// opposed to /:id/cancel below which cancels every eligible shipment on the
// whole order.
router.put('/shipments/:shipmentId/cancel', authorizeRoles('customer'), cancelShipmentByCustomer);
router.put('/:id/cancel',  authorizeRoles('customer'), cancelOrder);

// ── Seller routes ─────────────────────────────────────────
router.get('/seller',      authorizeRoles('seller'),   getSellerOrders);
router.put('/:id/status',  authorizeRoles('seller'),   updateOrderStatus);

// ── Shared route (customer, seller, admin, delivery) ──────
router.get('/:id',         authorizeRoles('customer', 'seller', 'admin', 'delivery'), getOrderById);

module.exports = router;