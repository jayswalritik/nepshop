const express = require('express');
const { body } = require('express-validator');
const {
  registerUser,
  loginUser,
  getMe,
  updateSellerSettings,
  updateCustomerProfile,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');
const { reapplyUser } = require('../controllers/adminController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');


const router = express.Router();

// ── Validation rules ──────────────────────────────────────

const registerValidation = [
  body('firstName')
    .trim()
    .notEmpty().withMessage('First name is required')
    .isLength({ max: 50 }).withMessage('First name must be under 50 characters'),

  body('lastName')
    .trim()
    .notEmpty().withMessage('Last name is required')
    .isLength({ max: 50 }).withMessage('Last name must be under 50 characters'),

  body('email')
    .trim()
    .toLowerCase()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email address'),

  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^[0-9+\- ]{7,15}$/).withMessage('Please enter a valid phone number'),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number'),

  body('role')
    .notEmpty().withMessage('Role is required')
    .isIn(['customer', 'seller', 'delivery']).withMessage('Invalid role selected'),
];

const loginValidation = [
  body('email')
    .trim()
    .toLowerCase()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email address'),

  body('password')
    .notEmpty().withMessage('Password is required'),

  body('role')
    .notEmpty().withMessage('Role is required')
    .isIn(['customer', 'seller', 'delivery', 'admin']).withMessage('Invalid role'),
];

// ── Routes ────────────────────────────────────────────────

// POST /api/auth/register
router.post('/register', registerValidation, registerUser);

// POST /api/auth/login
router.post('/login', loginValidation, loginUser);

// GET /api/auth/me  (protected)
router.get('/me', protect, getMe);

// PUT /api/auth/reapply
router.put('/reapply', reapplyUser);

// PUT /api/auth/seller/settings
router.put('/seller/settings', protect, authorizeRoles('seller'), updateSellerSettings);

// PUT /api/auth/customer/profile
router.put('/customer/profile', protect, authorizeRoles('customer'), updateCustomerProfile);

// POST /api/auth/forgot-password
router.post('/forgot-password', forgotPassword);

// PUT /api/auth/reset-password/:token
router.put('/reset-password/:token', resetPassword);

module.exports = router;
