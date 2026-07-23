const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const { generateToken } = require('../utils/generateToken');
const { SUSPENDED_MESSAGE } = require('../middleware/authMiddleware');

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

  // 6b. Generate email verification token and send the email
  const verifyToken = user.generateEmailVerifyToken();
  await user.save();

  const { sendVerificationEmail } = require('../utils/emailService');
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email/${verifyToken}`;
  sendVerificationEmail(user, verifyUrl);

  // 7. Build response
  const {
    sendWelcomeEmail,
    sendSellerApplicationEmail,
    sendDeliveryApplicationEmail,
    sendNewApplicationToAdmin,
  } = require('../utils/emailService');

  
  if (role === 'customer') {
    // Send welcome email
    sendWelcomeEmail(user);

    // NOTE: no token issued — user must verify email before logging in
    return res.status(201).json({
      success: true,
      message: 'Account created! Please check your email to verify your account before signing in.',
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
      message: `Your ${role} account has been submitted. Please verify your email, and an admin will review your application.`,
      user: user.toPublicJSON(),
    });
  }
});

// ─────────────────────────────────────────────────────────
// @desc    Login user (all roles) — multi-role aware
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

  // 1. Find user by email only
  const user = await User.findOne({ email }).select('+password');

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

  // 2b. Require verified email before login
  if (!user.isEmailVerified) {
    res.status(403);
    throw new Error('EMAIL_NOT_VERIFIED');
  }

  // 3. Verify the user actually has the role they're trying to log in as
  const userRoles = user.roles && user.roles.length ? user.roles : [user.role];

  if (role && !userRoles.includes(role)) {
    res.status(403);
    const roleLabels = { customer: 'customer', seller: 'seller', delivery: 'delivery agent' };
    throw new Error(
      `This email is not registered as a ${roleLabels[role] || role}. ` +
      `You have access to: ${userRoles.join(', ')}.`
    );
  }

  // 4. Check account status
  if (user.status === 'pending') {
    res.status(403);
    throw new Error(
      'Your account is pending admin approval. You will receive an email once your account is activated.'
    );
  }

  if (user.status === 'suspended') {
    res.status(403);
    throw new Error(SUSPENDED_MESSAGE);
  }

  if (user.status === 'rejected') {
    res.status(403);
    throw new Error('Your account application was rejected. Please contact support for more information.');
  }

  // 5. Set activeRole to the role they logged in as (Approach B)
  const loginRole = role && userRoles.includes(role) ? role : (user.activeRole || userRoles[0]);
  user.activeRole = loginRole;
  await user.save();

  // 6. Issue token and return
  const token = generateToken(user._id, loginRole);

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

  // Roles-array/legacy-role fallback (same pattern as authMiddleware's
  // authorizeRoles) — the old `user.role !== 'seller'` check used only the
  // legacy single-role field, which never updates once a second role is
  // added (e.g. a customer-first account later approved as seller keeps
  // `user.role === 'customer'` forever, wrongly locking them out of their
  // own seller settings).
  const heldRoles = user.roles && user.roles.length ? user.roles : [user.role];
  if (!heldRoles.includes('seller')) {
    res.status(403);
    throw new Error('Only sellers can update shop settings');
  }

  // Sellers are identity-verified in person (documents checked at office
  // visit) — name is locked platform-wide, in every active role, from every
  // endpoint. Reject a genuine change attempt rather than silently
  // dropping it, so nothing fails silently. Resubmitting the SAME name is
  // NOT a change — the web/mobile forms always send the full payload
  // (including their own disabled name fields), so this must stay a no-op
  // or sellers could never save phone/shop/payout edits either.
  // Whitespace-insensitive: trim both sides before comparing so a purely
  // cosmetic resubmission (e.g. a trailing space the form/keyboard added)
  // isn't misread as an identity-change attempt. undefined/null submitted
  // fields are "not a change" (`!= null` catches both).
  const nameChanged =
    (firstName != null && firstName.trim() !== (user.firstName ?? '').trim()) ||
    (lastName != null && lastName.trim() !== (user.lastName ?? '').trim());
  if (nameChanged) {
    res.status(403);
    throw new Error('Your name is verified and locked. Contact support to change verified identity details.');
  }

  // Update fields if provided
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

  // Route middleware (authorizeRoles('customer')) already guarantees this
  // account holds the customer role via the same roles-array/legacy-role
  // fallback — this check is the identity-lock policy, not a role gate: an
  // account that holds seller OR delivery in ADDITION to customer is
  // blocked from this endpoint entirely, even for name-unrelated edits and
  // even while active in customer mode. `user.role` alone can't express
  // this — it's the legacy single-role field, frozen at whatever role the
  // account first registered as, never updated when addCustomerRole later
  // appends 'customer' to `roles`. A seller who added customer as a SECOND
  // role would have `user.role === 'customer'` (unchanged) forever, so the
  // old `user.role !== 'customer'` check let them straight through here.
  const heldRoles = user.roles && user.roles.length ? user.roles : [user.role];
  if (heldRoles.includes('seller') || heldRoles.includes('delivery')) {
    res.status(403);
    throw new Error("Verified seller/delivery accounts can't edit profile details from the customer profile.");
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

  // Roles-array/legacy-role fallback — same reasoning as
  // updateSellerSettings above (a customer-first account later approved as
  // delivery would keep `user.role === 'customer'` forever under the old
  // check, wrongly locking them out of their own delivery profile).
  const heldRoles = user.roles && user.roles.length ? user.roles : [user.role];
  if (!heldRoles.includes('delivery')) {
    res.status(403);
    throw new Error('Only delivery agents can update their profile here');
  }

  // Delivery agents are identity-verified in person — name is locked
  // platform-wide, in every active role, from every endpoint. Reject a
  // genuine change attempt rather than silently dropping it, so nothing
  // fails silently. Resubmitting the SAME name is NOT a change — the
  // web/mobile forms always send the full payload (including their own
  // disabled name fields), so this must stay a no-op or agents could never
  // save phone/payout edits either.
  // Whitespace-insensitive: trim both sides before comparing so a purely
  // cosmetic resubmission (e.g. a trailing space the form/keyboard added)
  // isn't misread as an identity-change attempt. undefined/null submitted
  // fields are "not a change" (`!= null` catches both).
  const nameChanged =
    (firstName != null && firstName.trim() !== (user.firstName ?? '').trim()) ||
    (lastName != null && lastName.trim() !== (user.lastName ?? '').trim());
  if (nameChanged) {
    res.status(403);
    throw new Error('Your name is verified and locked. Contact support to change verified identity details.');
  }

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
  const { email, role, client } = req.body;

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

  // Build reset URL — environment-aware (matches FRONTEND_URL convention used
  // across the backend, e.g. the verify-email flow above); falls back to the
  // Vite dev origin for local development.
  // Carry an app-origin marker through the link so the web forgot-password
  // page can narrow role options for app-originated users if they need a new
  // link. Only the exact value 'app' is honored; anything else is ignored.
  const clientSuffix = client === 'app' ? '?client=app' : '';
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${resetToken}${clientSuffix}`;

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

// ─────────────────────────────────────────────────────────
// @desc    Switch active role (which dashboard the user is using)
// @route   POST /api/auth/switch-role
// @access  Authenticated users
// ─────────────────────────────────────────────────────────
const switchActiveRole = asyncHandler(async (req, res) => {
  const { role } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const userRoles = user.roles && user.roles.length ? user.roles : [user.role];

  if (!userRoles.includes(role)) {
    res.status(403);
    throw new Error(`You don't have access to the ${role} role`);
  }

  user.activeRole = role;
  await user.save();

  res.status(200).json({
    success: true,
    message: `Switched to ${role} mode`,
    user:    user.toPublicJSON(),
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Verify email via token link
// @route   GET /api/auth/verify-email/:token
// @access  Public
// ─────────────────────────────────────────────────────────
const verifyEmail = asyncHandler(async (req, res) => {
  const crypto = require('crypto');
  const hashed = crypto.createHash('sha256').update(req.params.token).digest('hex');

  const user = await User.findOne({
    emailVerifyToken:  hashed,
    emailVerifyExpire: { $gt: Date.now() },
  });

  if (!user) {
    res.status(400);
    throw new Error('Verification link is invalid or has expired. Please request a new one.');
  }

  user.isEmailVerified  = true;
  user.emailVerifyToken = null;
  user.emailVerifyExpire = null;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Email verified successfully! You can now sign in.',
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Resend verification email
// @route   POST /api/auth/resend-verification
// @access  Public
// ─────────────────────────────────────────────────────────
const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    res.status(400);
    throw new Error('Email is required');
  }

  const user = await User.findOne({ email });

  // Always respond success (don't reveal whether the email exists)
  if (!user || user.isEmailVerified) {
    return res.status(200).json({
      success: true,
      message: 'If an unverified account exists for this email, a new verification link has been sent.',
    });
  }

  const verifyToken = user.generateEmailVerifyToken();
  await user.save();

  const { sendVerificationEmail } = require('../utils/emailService');
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email/${verifyToken}`;
  sendVerificationEmail(user, verifyUrl);

  res.status(200).json({
    success: true,
    message: 'A new verification link has been sent to your email.',
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
  switchActiveRole,
  verifyEmail,
  resendVerification,
};