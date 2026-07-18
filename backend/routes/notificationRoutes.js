const express = require('express');
const {
  getMyNotifications,
  getUnreadCount,
  markAllRead,
  markOneRead,
  setPushToken,
} = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

// Specific paths BEFORE any /:id routes
router.get('/unread-count', getUnreadCount);
router.put('/read-all',     markAllRead);
router.put('/push-token',   setPushToken);

router.get('/',        getMyNotifications);
router.put('/:id/read', markOneRead);

module.exports = router;
