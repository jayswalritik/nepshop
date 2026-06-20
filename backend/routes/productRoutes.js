const express = require('express');
const {
  createProduct,
  getSellerProducts,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  toggleProductStatus,
} = require('../controllers/productController');
const { protect, authorizeRoles, requireActive } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinary');

const router = express.Router();

// ── Public routes ─────────────────────────────────────────
router.get('/',     getAllProducts);
router.get('/:id',  getProductById);

// ── Seller only routes ────────────────────────────────────
router.get('/seller/myproducts',
  protect, authorizeRoles('seller'), requireActive,
  getSellerProducts
);

router.post('/',
  protect, authorizeRoles('seller'), requireActive,
  upload.array('images', 5), createProduct
);

router.put('/:id/toggle',
  protect, authorizeRoles('seller'), requireActive,
  toggleProductStatus
);

router.put('/:id',
  protect, authorizeRoles('seller'), requireActive,
  upload.array('images', 5), updateProduct
);

router.delete('/:id',
  protect, authorizeRoles('seller'), requireActive,
  deleteProduct
);

module.exports = router;