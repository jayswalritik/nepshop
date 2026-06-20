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
  if (role === 'customer') {
    // Customer: issue token immediately — they can shop right away
    const token = generateToken(user._id, user.role);
    return res.status(201).json({
      success: true,
      message: 'Account created successfully. Welcome to NepShop!',
      token,
      user: user.toPublicJSON(),
    });
  } else {
    // Seller / Delivery: no token yet — pending approval
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

module.exports = { registerUser, loginUser, getMe };
