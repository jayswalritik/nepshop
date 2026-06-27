const asyncHandler = require('express-async-handler');
const Coupon = require('../models/Coupon');

// ─────────────────────────────────────────────────────────
// @desc    Create a coupon
// @route   POST /api/coupons
// @access  Admin only
// ─────────────────────────────────────────────────────────
const createCoupon = asyncHandler(async (req, res) => {
  const {
    code, description, type, value,
    minOrder, maxDiscount, usageLimit, expiresAt,
  } = req.body;

  if (!code || !type || value === undefined) {
    res.status(400);
    throw new Error('Code, type, and value are required');
  }

  if (!['fixed', 'percentage'].includes(type)) {
    res.status(400);
    throw new Error('Type must be fixed or percentage');
  }

  if (type === 'percentage' && (value <= 0 || value > 100)) {
    res.status(400);
    throw new Error('Percentage value must be between 1 and 100');
  }
  if (type === 'fixed' && value <= 0) {
    res.status(400);
    throw new Error('Fixed discount must be greater than 0');
  }

  // Check for duplicate code
  const existing = await Coupon.findOne({ code: code.toUpperCase().trim() });
  if (existing) {
    res.status(409);
    throw new Error('A coupon with this code already exists');
  }

  const coupon = await Coupon.create({
    code:        code.toUpperCase().trim(),
    description: description || '',
    type,
    value,
    minOrder:    minOrder || 0,
    maxDiscount: maxDiscount || 0,
    usageLimit:  usageLimit || null,
    expiresAt:   expiresAt || null,
    createdBy:   req.user._id,
  });

  res.status(201).json({
    success: true,
    message: 'Coupon created successfully',
    coupon,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Get all coupons
// @route   GET /api/coupons
// @access  Admin only
// ─────────────────────────────────────────────────────────
const getAllCoupons = asyncHandler(async (req, res) => {
  const coupons = await Coupon.find({}).sort({ createdAt: -1 });
  res.status(200).json({ success: true, coupons });
});

// ─────────────────────────────────────────────────────────
// @desc    Toggle coupon active status
// @route   PUT /api/coupons/:id/toggle
// @access  Admin only
// ─────────────────────────────────────────────────────────
const toggleCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) {
    res.status(404);
    throw new Error('Coupon not found');
  }

  coupon.isActive = !coupon.isActive;
  await coupon.save();

  res.status(200).json({
    success: true,
    message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'}`,
    coupon,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Delete a coupon
// @route   DELETE /api/coupons/:id
// @access  Admin only
// ─────────────────────────────────────────────────────────
const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) {
    res.status(404);
    throw new Error('Coupon not found');
  }
  await coupon.deleteOne();
  res.status(200).json({
    success: true,
    message: 'Coupon deleted',
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Validate a coupon code against a subtotal (checkout)
// @route   POST /api/coupons/validate
// @access  Customer only
// ─────────────────────────────────────────────────────────
const validateCoupon = asyncHandler(async (req, res) => {
  const { code, subtotal } = req.body;

  if (!code) {
    res.status(400);
    throw new Error('Coupon code is required');
  }

  const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });
  if (!coupon) {
    res.status(404);
    throw new Error('Invalid coupon code');
  }

  const result = coupon.validateFor(subtotal || 0);

  if (!result.valid) {
    res.status(400);
    throw new Error(result.message);
  }

  res.status(200).json({
    success:  true,
    message:  'Coupon applied successfully',
    code:     coupon.code,
    type:     coupon.type,
    value:    coupon.value,
    discount: result.discount,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Get available public coupons (for customers)
// @route   GET /api/coupons/available
// @access  Customer only
// ─────────────────────────────────────────────────────────
const getAvailableCoupons = asyncHandler(async (req, res) => {
  const now = new Date();

  const coupons = await Coupon.find({
    isActive: true,
    isPublic: true,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: now } },
    ],
  }).sort({ createdAt: -1 });

  // Filter out ones that hit their usage limit, and strip internal fields
  const available = coupons
    .filter(c => c.usageLimit === null || c.usedCount < c.usageLimit)
    .map(c => ({
      code:        c.code,
      description: c.description,
      type:        c.type,
      value:       c.value,
      minOrder:    c.minOrder,
      maxDiscount: c.maxDiscount,
      expiresAt:   c.expiresAt,
    }));

  res.status(200).json({ success: true, coupons: available });
});

module.exports = {
  createCoupon,
  getAllCoupons,
  toggleCoupon,
  deleteCoupon,
  validateCoupon,
  getAvailableCoupons,
};