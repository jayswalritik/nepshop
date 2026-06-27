const express = require('express');
const {
  requestReturn,
  getMyReturns,
  getAllReturns,
  processReturn,
  getMyReturnPickups,
  markReturnPickedUp,
  completeReturn,
} = require('../controllers/returnController');
const { protect, authorizeRoles, requireActive } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);
router.use(requireActive);

// Customer
router.post('/',  authorizeRoles('customer'), requestReturn);
router.get('/my', authorizeRoles('customer'), getMyReturns);

// Delivery agent — specific routes BEFORE any /:id routes
router.get('/pickups', authorizeRoles('delivery'), getMyReturnPickups);

// Admin
router.get('/', authorizeRoles('admin'), getAllReturns);

// Parameterized routes (must come after specific paths above)
router.put('/:id/process',  authorizeRoles('admin'),    processReturn);
router.put('/:id/pickup',   authorizeRoles('delivery'), markReturnPickedUp);
router.put('/:id/complete', authorizeRoles('delivery'), completeReturn);

module.exports = router;