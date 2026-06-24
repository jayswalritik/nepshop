const express = require('express');
const {
  initiateKhalti,
  verifyKhalti,
  initiateEsewa,
  verifyEsewa,
} = require('../controllers/paymentController');
const { protect, authorizeRoles, requireActive } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);
router.use(authorizeRoles('customer'));
router.use(requireActive);

// Khalti
router.post('/khalti/initiate', initiateKhalti);
router.post('/khalti/verify',   verifyKhalti);

// eSewa
router.post('/esewa/initiate',  initiateEsewa);
router.post('/esewa/verify',    verifyEsewa);

module.exports = router;