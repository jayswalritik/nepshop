const express = require('express');
const {
  initiateKhalti,
  verifyKhalti,
  initiateEsewa,
  verifyEsewa,
  esewaForm,
} = require('../controllers/paymentController');
const { protect, authorizeRoles, requireActive } = require('../middleware/authMiddleware');

const router = express.Router();

// PUBLIC — a browser address-bar GET (opened by expo-web-browser from a
// mobile deep-link redirect) can't carry a JWT, so this has to be reachable
// with no auth. Registered BEFORE router.use(protect) below so Express
// never routes it through the auth middleware chain — the four existing
// authed routes are untouched. See paymentController.js's esewaForm for
// the access-control rationale (unguessable uuid + initiated-status check).
router.get('/esewa/form/:transactionUuid', esewaForm);

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