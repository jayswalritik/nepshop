const asyncHandler = require('express-async-handler');
const Notification = require('../models/Notification');

// ─────────────────────────────────────────────────────────
// @desc    Get own notifications, newest first
// @route   GET /api/notifications?page=&limit=
// @access  Authenticated
// ─────────────────────────────────────────────────────────
const getMyNotifications = asyncHandler(async (req, res) => {
  const page  = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Number(req.query.limit) || 20);

  const notifications = await Notification.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit + 1);

  const hasMore = notifications.length > limit;
  if (hasMore) notifications.pop();

  res.status(200).json({
    success: true,
    notifications,
    page,
    hasMore,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Count of own unread notifications
// @route   GET /api/notifications/unread-count
// @access  Authenticated
// ─────────────────────────────────────────────────────────
const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({ user: req.user._id, readAt: null });
  res.status(200).json({ success: true, count });
});

// ─────────────────────────────────────────────────────────
// @desc    Mark all own notifications as read
// @route   PUT /api/notifications/read-all
// @access  Authenticated
// ─────────────────────────────────────────────────────────
const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { user: req.user._id, readAt: null },
    { $set: { readAt: new Date() } }
  );
  res.status(200).json({ success: true });
});

// ─────────────────────────────────────────────────────────
// @desc    Mark one own notification as read
// @route   PUT /api/notifications/:id/read
// @access  Authenticated
// ─────────────────────────────────────────────────────────
const markOneRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({ _id: req.params.id, user: req.user._id });
  if (!notification) {
    res.status(404);
    throw new Error('Notification not found');
  }

  if (!notification.readAt) {
    notification.readAt = new Date();
    await notification.save();
  }

  res.status(200).json({ success: true, notification });
});

// ─────────────────────────────────────────────────────────
// @desc    Set or clear the caller's Expo push token
// @route   PUT /api/notifications/push-token
// @access  Authenticated
// ─────────────────────────────────────────────────────────
const setPushToken = asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (token !== null && typeof token !== 'string') {
    res.status(400);
    throw new Error('token must be a string or null');
  }

  req.user.expoPushToken = token;
  await req.user.save();

  res.status(200).json({ success: true });
});

module.exports = {
  getMyNotifications,
  getUnreadCount,
  markAllRead,
  markOneRead,
  setPushToken,
};
