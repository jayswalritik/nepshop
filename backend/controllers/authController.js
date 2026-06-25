const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const { generateToken } = require('../utils/generateToken');

// ─────────────────────────────────────────────────────────
// @desc    Register a new user (customer / seller / delivery)
// @route   POST /api/auth/register
// @access  Public
// ─────────────────────────────────────────────────────────
const registerUser = asyncHandler(async (req, res) => {
  // 1. Validate request body
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map((e) => e.msg).join(', '));
  }

  const {
    firstName,
    lastName,
    email,
    phone,
    password,
    role,
    // Seller
    shopName,
    panNumber,
    shopAddress,
    // Delivery
    vehicleType,
    citizenshipNumber,
  } = req.body;

  // 2. Block admin self-registration from public API
  if (role === 'admin') {
    res.status(403);
    throw new Error('Admin accounts cannot be created via this endpoint');
  }

  // 3. Check if email already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    res.status(409);
    throw new Error('An account with this email already exists');
  }

  // 4. Validate role-specific required fields
  if (role === 'seller') {
    if (!shopName || !panNumber) {
      res.status(400);
      throw new Error('Shop name and PAN number are required for seller registration');
    }
  }

  if (role === 'delivery') {
    if (!vehicleType || !citizenshipNumber) {
      res.status(400);
      throw new Error('Vehicle type and citizenship number are required for delivery agent registration');
    }
  }

  // 5. Determine initial status
  // Customers are active immediately; seller/delivery need admin approval
  const status = role === 'customer' ? 'active' : 'pending';

  // 6. Create user
  const user = await User.create({
    firstName,
    lastName,
    email,
    phone,
    password, // will be hashed by pre-save hook in User model
    role,
    status,
    // Seller fields
    shopName:    role === 'seller' ? shopName    : null,
    panNumber:   role === 'seller' ? panNumber   : null,
    shopAddress: role === 'seller' ? shopAddress : null,
    // Delivery fields
    vehicleType: role === 'delivery' ? vehicleType : null,
    citizenshipNumber: role === 'delivery' ? citizenshipNumber : null,
  });

  // 7. Build response
  const {
    sendWelcomeEmail,
    sendSellerApplicationEmail,
    sendDeliveryApplicationEmail,
    sendNewApplicationToAdmin,
  } = require('../utils/emailService');

  if (role === 'customer') {
    const token = generateToken(user._id, user.role);

    // Send welcome email
    sendWelcomeEmail(user);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully. Welcome to NepShop!',
      token,
      user: user.toPublicJSON(),
    });
  } else {
    // Send application confirmation email
    if (role === 'seller') {
      sendSellerApplicationEmail(user);
    } else if (role === 'delivery') {
      sendDeliveryApplicationEmail(user);
    }

    // Notify admin
    const admin = await User.findOne({ role: 'admin' });
    if (admin) sendNewApplicationToAdmin(admin.email, user);

    return res.status(201).json({
      success: true,
      message: `Your ${role} account has been submitted for review. You will be notified by email once an admin approves your account.`,
      user: user.toPublicJSON(),
    });
  }
});

// ─────────────────────────────────────────────────────────
// @desc    Login user (all roles)
// @route   POST /api/auth/login
// @access  Public
// ─────────────────────────────────────────────────────────
const loginUser = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map((e) => e.msg).join(', '));
  }

  const { email, password, role } = req.body;

  // 1. Find user by email AND role
  // This prevents a customer token from working on the seller dashboard
  const user = await User.findOne({ email, role }).select('+password');

  if (!user) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  // 2. Check password
  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  // 3. Check account status
  if (user.status === 'pending') {
    res.status(403);
    throw new Error(
      'Your account is pending admin approval. You will receive an email once your account is activated.'
    );
  }

  if (user.status === 'suspended') {
    res.status(403);
    throw new Error('Your account has been suspended. Please contact support.');
  }

  if (user.status === 'rejected') {
    res.status(403);
    throw new Error('Your account application was rejected. Please contact support for more information.');
  }

  // 4. Issue token and return
  const token = generateToken(user._id, user.role);

  res.status(200).json({
    success: true,
    message: 'Signed in successfully',
    token,
    user: user.toPublicJSON(),
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Get current logged-in user profile
// @route   GET /api/auth/me
// @access  Private (any authenticated user)
// ─────────────────────────────────────────────────────────
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  res.status(200).json({
    success: true,
    user: user.toPublicJSON(),
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Update seller shop settings
// @route   PUT /api/auth/seller/settings
// @access  Seller only
// ─────────────────────────────────────────────────────────
const updateSellerSettings = asyncHandler(async (req, res) => {
  const {
    shopName,
    shopAddress,
    phone,
    firstName,
    lastName,
  } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  if (user.role !== 'seller') {
    res.status(403);
    throw new Error('Only sellers can update shop settings');
  }

  // Update fields if provided
  if (firstName)   user.firstName = firstName;
  if (lastName)    user.lastName  = lastName;
  if (phone)       user.phone     = phone;
  if (shopName)    user.shopName  = shopName;
  if (shopAddress) user.shopAddress = {
    street:   shopAddress.street   || user.shopAddress?.street,
    city:     shopAddress.city     || user.shopAddress?.city,
    district: shopAddress.district || user.shopAddress?.district,
    phone:    shopAddress.phone    || user.shopAddress?.phone,
  };

  if (req.body.payoutDetails) {
    user.payoutDetails = {
      preferredMethod:   req.body.payoutDetails.preferredMethod   || user.payoutDetails?.preferredMethod,
      bankName:          req.body.payoutDetails.bankName          || user.payoutDetails?.bankName,
      accountNumber:     req.body.payoutDetails.accountNumber     || user.payoutDetails?.accountNumber,
      accountHolderName: req.body.payoutDetails.accountHolderName || user.payoutDetails?.accountHolderName,
      khaltiNumber:      req.body.payoutDetails.khaltiNumber      || user.payoutDetails?.khaltiNumber,
      esewaNumber:       req.body.payoutDetails.esewaNumber       || user.payoutDetails?.esewaNumber,
    };
  }

  const updated = await user.save();

  res.status(200).json({
    success: true,
    message: 'Settings updated successfully',
    user: updated.toPublicJSON(),
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Update customer profile
// @route   PUT /api/auth/customer/profile
// @access  Customer only
// ─────────────────────────────────────────────────────────
const updateCustomerProfile = asyncHandler(async (req, res) => {
  const { firstName, lastName, phone } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  if (user.role !== 'customer') {
    res.status(403);
    throw new Error('Only customers can update their profile here');
  }

  if (firstName) user.firstName = firstName;
  if (lastName)  user.lastName  = lastName;
  if (phone)     user.phone     = phone;

  const updated = await user.save();

  // Update localStorage data on frontend by returning new user
  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    user: updated.toPublicJSON(),
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Update delivery agent profile
// @route   PUT /api/auth/delivery/profile
// @access  Delivery agent only
// ─────────────────────────────────────────────────────────
const updateDeliveryProfile = asyncHandler(async (req, res) => {
  const { firstName, lastName, phone, payoutDetails } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  if (user.role !== 'delivery') {
    res.status(403);
    throw new Error('Only delivery agents can update their profile here');
  }

  if (firstName)     user.firstName = firstName;
  if (lastName)      user.lastName  = lastName;
  if (phone)         user.phone     = phone;
  if (payoutDetails) {
    user.payoutDetails = {
      preferredMethod:   payoutDetails.preferredMethod   || user.payoutDetails?.preferredMethod,
      bankName:          payoutDetails.bankName          || user.payoutDetails?.bankName,
      accountNumber:     payoutDetails.accountNumber     || user.payoutDetails?.accountNumber,
      accountHolderName: payoutDetails.accountHolderName || user.payoutDetails?.accountHolderName,
      khaltiNumber:      payoutDetails.khaltiNumber      || user.payoutDetails?.khaltiNumber,
      esewaNumber:       payoutDetails.esewaNumber       || user.payoutDetails?.esewaNumber,
    };
  }

  const updated = await user.save();

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    user: updated.toPublicJSON(),
  });
}); 

// ─────────────────────────────────────────────────────────
// @desc    Forgot password — send reset email
// @route   POST /api/auth/forgot-password
// @access  Public
// ─────────────────────────────────────────────────────────
const forgotPassword = asyncHandler(async (req, res) => {
  const { email, role } = req.body;

  if (!email) {
    res.status(400);
    throw new Error('Email is required');
  }

  // Find user by email and role
  const query = role ? { email, role } : { email };
  const user  = await User.findOne(query);

  if (!user) {
    // Don't reveal if email exists or not — security best practice
    return res.status(200).json({
      success: true,
      message: 'If an account with that email exists, a reset link has been sent.',
    });
  }

  // Generate reset token
  const resetToken = user.generateResetToken();
  await user.save({ validateBeforeSave: false });

  // Build reset URL
  const resetUrl = `http://localhost:5173/reset-password/${resetToken}`;

  // Send email
  const { sendPasswordResetEmail } = require('../utils/emailService');
  await sendPasswordResetEmail(user, resetUrl);

  res.status(200).json({
    success: true,
    message: 'If an account with that email exists, a reset link has been sent.',
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Reset password using token
// @route   PUT /api/auth/reset-password/:token
// @access  Public
// ─────────────────────────────────────────────────────────
const resetPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const { token }    = req.params;

  if (!password || password.length < 8) {
    res.status(400);
    throw new Error('Password must be at least 8 characters');
  }

  // Hash token to compare with stored
  const crypto = require('crypto');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  // Find user with valid token
  const user = await User.findOne({
    resetPasswordToken:  hashedToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    res.status(400);
    throw new Error('Reset link is invalid or has expired. Please request a new one.');
  }

  // Set new password
  user.password           = password;
  user.resetPasswordToken  = null;
  user.resetPasswordExpire = null;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password reset successfully. You can now sign in with your new password.',
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Apply to add a new role (seller or delivery)
// @route   POST /api/auth/apply-role
// @access  Authenticated users
// ─────────────────────────────────────────────────────────
const applyForRole = asyncHandler(async (req, res) => {
  const { role, shopName, panNumber, shopAddress, vehicleType, citizenshipNumber, payoutDetails } = req.body;

  // Only seller or delivery can be applied for
  if (!['seller', 'delivery'].includes(role)) {
    res.status(400);
    throw new Error('You can only apply to become a seller or delivery agent');
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Normalize current roles (fallback to legacy role)
  const currentRoles = user.roles && user.roles.length ? user.roles : [user.role];

  // Admin cannot apply for other roles
  if (currentRoles.includes('admin')) {
    res.status(403);
    throw new Error('Admin accounts cannot apply for other roles');
  }

  // Already has this role
  if (currentRoles.includes(role)) {
    res.status(409);
    throw new Error(`You are already a ${role}`);
  }

  // Block seller + delivery combination (conflict of interest)
  if (role === 'seller' && currentRoles.includes('delivery')) {
    res.status(409);
    throw new Error('Delivery agents cannot also become sellers');
  }
  if (role === 'delivery' && currentRoles.includes('seller')) {
    res.status(409);
    throw new Error('Sellers cannot also become delivery agents');
  }

  // Already has a pending request
  if (user.pendingRoleRequest?.status === 'pending') {
    res.status(409);
    throw new Error(`You already have a pending ${user.pendingRoleRequest.role} application`);
  }

  // Validate and save role-specific info
  if (role === 'seller') {
    if (!shopName || !panNumber) {
      res.status(400);
      throw new Error('Shop name and PAN number are required to become a seller');
    }
    user.shopName    = shopName;
    user.panNumber   = panNumber;
    if (shopAddress) {
      user.shopAddress = {
        street:   shopAddress.street   || null,
        city:     shopAddress.city     || null,
        district: shopAddress.district || null,
        phone:    shopAddress.phone    || null,
      };
    }
  }

  if (role === 'delivery') {
    if (!vehicleType || !citizenshipNumber) {
      res.status(400);
      throw new Error('Vehicle type and citizenship number are required to become a delivery agent');
    }
    user.vehicleType       = vehicleType;
    user.citizenshipNumber = citizenshipNumber;
  }

  if (payoutDetails) {
    user.payoutDetails = {
      preferredMethod:   payoutDetails.preferredMethod   || user.payoutDetails?.preferredMethod,
      bankName:          payoutDetails.bankName          || user.payoutDetails?.bankName,
      accountNumber:     payoutDetails.accountNumber     || user.payoutDetails?.accountNumber,
      accountHolderName: payoutDetails.accountHolderName || user.payoutDetails?.accountHolderName,
      khaltiNumber:      payoutDetails.khaltiNumber      || user.payoutDetails?.khaltiNumber,
      esewaNumber:       payoutDetails.esewaNumber       || user.payoutDetails?.esewaNumber,
    };
  }

  user.pendingRoleRequest = {
    role,
    requestedAt: new Date(),
    status:      'pending',
  };

  await user.save();

  // Email the applicant
  const {
    sendSellerApplicationEmail,
    sendDeliveryApplicationEmail,
    sendNewApplicationToAdmin,
  } = require('../utils/emailService');

  if (role === 'seller')   sendSellerApplicationEmail(user);
  if (role === 'delivery') sendDeliveryApplicationEmail(user);

  // Notify admin
  const admin = await User.findOne({ role: 'admin' });
  if (admin) {
    // Pass a temp object so the email shows the right role being applied for
    sendNewApplicationToAdmin(admin.email, { ...user.toObject(), role });
  }

  res.status(200).json({
    success: true,
    message: `Your application to become a ${role} has been submitted and is pending admin review.`,
    user:    user.toPublicJSON(),
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Approve a pending role request (admin)
// @route   PUT /api/auth/role-request/:userId/approve
// @access  Admin only
// ─────────────────────────────────────────────────────────
const approveRoleRequest = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  if (user.pendingRoleRequest?.status !== 'pending') {
    res.status(400);
    throw new Error('This user has no pending role request');
  }

  const newRole = user.pendingRoleRequest.role;

  // Add the new role
  const currentRoles = user.roles && user.roles.length ? user.roles : [user.role];
  if (!currentRoles.includes(newRole)) {
    currentRoles.push(newRole);
  }
  user.roles  = currentRoles;
  user.status = 'active';

  // Clear the pending request
  user.pendingRoleRequest = { role: null, requestedAt: null, status: null };

  user.approvedBy = req.user._id;
  user.approvedAt = new Date();

  await user.save();

  // Email the user
  const { sendAccountApprovedEmail } = require('../utils/emailService');
  sendAccountApprovedEmail({ ...user.toObject(), role: newRole });

  res.status(200).json({
    success: true,
    message: `Role "${newRole}" approved for ${user.firstName} ${user.lastName}`,
    user:    user.toPublicJSON(),
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Reject a pending role request (admin)
// @route   PUT /api/auth/role-request/:userId/reject
// @access  Admin only
// ─────────────────────────────────────────────────────────
const rejectRoleRequest = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  if (user.pendingRoleRequest?.status !== 'pending') {
    res.status(400);
    throw new Error('This user has no pending role request');
  }

  const rejectedRole = user.pendingRoleRequest.role;

  // Clear the pending request — existing roles untouched
  user.pendingRoleRequest = { role: null, requestedAt: null, status: null };
  await user.save();

  // Email the user
  const { sendAccountRejectedEmail } = require('../utils/emailService');
  sendAccountRejectedEmail({ ...user.toObject(), role: rejectedRole });

  res.status(200).json({
    success: true,
    message: `Role request rejected for ${user.firstName} ${user.lastName}`,
    user:    user.toPublicJSON(),
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Instantly add customer role (no approval needed)
// @route   POST /api/auth/add-customer-role
// @access  Authenticated users (seller/delivery)
// ─────────────────────────────────────────────────────────
const addCustomerRole = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const currentRoles = user.roles && user.roles.length ? user.roles : [user.role];

  if (currentRoles.includes('admin')) {
    res.status(403);
    throw new Error('Admin accounts cannot add other roles');
  }

  if (currentRoles.includes('customer')) {
    res.status(409);
    throw new Error('You already have a customer account');
  }

  currentRoles.push('customer');
  user.roles = currentRoles;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'You can now shop on NepShop! Switch to customer mode anytime.',
    user:    user.toPublicJSON(),
  });
});

module.exports = {
  registerUser,
  loginUser,
  getMe,
  updateSellerSettings,
  updateCustomerProfile,
  updateDeliveryProfile,
  forgotPassword,
  resetPassword,
  applyForRole,
  approveRoleRequest,
  rejectRoleRequest,
  addCustomerRole,
};