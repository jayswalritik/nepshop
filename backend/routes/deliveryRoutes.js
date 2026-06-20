const express = require('express');
const { getDeliveryOrders, markDelivered } = require('../controllers/deliveryController');
const { protect, authorizeRoles, requireActive } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);
router.use(authorizeRoles('delivery'));
router.use(requireActive);

router.get('/orders',                  getDeliveryOrders);
router.put('/orders/:id/delivered',    markDelivered);

module.exports = router;