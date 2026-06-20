const asyncHandler = require('express-async-handler');
const User = require('../models/User');

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
  res.status(200).json({
    success: true,
    message: `${user.firstName}'s account has been rejected`,
    user: user.toPublicJSON(),
  });
});

module.exports = { getAllUsers, approveUser, rejectUser };