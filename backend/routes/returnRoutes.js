const express = require('express');
const {
  requestReturn,
  getMyReturns,
  getAllReturns,
  processReturn,
} = require('../controllers/returnController');
const { protect, authorizeRoles, requireActive } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);
router.use(requireActive);

// Customer
router.post('/',     authorizeRoles('customer'), requestReturn);
router.get('/my',    authorizeRoles('customer'), getMyReturns);

// Admin
router.get('/',              authorizeRoles('admin'), getAllReturns);
router.put('/:id/process',   authorizeRoles('admin'), processReturn);

module.exports = router;