const asyncHandler = require('express-async-handler');
const User = require('../models/User');

const {
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
} = require('../utils/emailService');

// @desc  Get all users
// @route GET /api/admin/users
// @access Admin only
const getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find({}).sort({ createdAt: -1 });
  res.status(200).json({ success: true, users });
});

// @desc  Approve a user
// @route PUT /api/admin/users/:id/approve
// @access Admin only
const approveUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  user.status = 'active';
  user.approvedBy = req.user._id;
  user.approvedAt = new Date();
  await user.save();
  // Send approval email
  sendAccountApprovedEmail(user);
  res.status(200).json({
    success: true,
    message: `${user.firstName}'s account has been approved`,
    user: user.toPublicJSON(),
  });
});

// @desc  Reject a user
// @route PUT /api/admin/users/:id/reject
// @access Admin only
const rejectUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  user.status = 'rejected';
  await user.save();
  // Send rejection email
  sendAccountRejectedEmail(user);
  res.status(200).json({
    success: true,
    message: `${user.firstName}'s account has been rejected`,
    user: user.toPublicJSON(),
  });
});

// @desc  Undo rejection — set back to pending
// @route PUT /api/admin/users/:id/undoreject
// @access Admin only
const undoRejectUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  if (user.status !== 'rejected') {
    res.status(400);
    throw new Error('User is not in rejected state');
  }
  user.status = 'pending';
  user.approvedBy = null;
  user.approvedAt = null;
  await user.save();
  res.status(200).json({
    success: true,
    message: `${user.firstName}'s account has been moved back to pending`,
    user: user.toPublicJSON(),
  });
});

// @desc  Reapply — user resubmits with same or updated details
// @route PUT /api/auth/reapply
// @access Public (rejected users only)
const reapplyUser = asyncHandler(async (req, res) => {
  const { email, role, shopName, panNumber, vehicleType, citizenshipNumber } = req.body;

  const user = await User.findOne({ email, role });
  if (!user) {
    res.status(404);
    throw new Error('Account not found');
  }
  if (user.status !== 'rejected') {
    res.status(400);
    throw new Error('Only rejected accounts can reapply');
  }

  // Update any new details they provide
  if (shopName)          user.shopName          = shopName;
  if (panNumber)         user.panNumber         = panNumber;
  if (vehicleType)       user.vehicleType       = vehicleType;
  if (citizenshipNumber) user.citizenshipNumber = citizenshipNumber;

  user.status = 'pending';
  user.approvedBy = null;
  user.approvedAt = null;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Your application has been resubmitted for review. Please visit the NepShop office with your documents.',
    user: user.toPublicJSON(),
  });
});

module.exports = { getAllUsers, approveUser, rejectUser, undoRejectUser, reapplyUser };