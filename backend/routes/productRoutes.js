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
router.get('/',    getAllProducts);   // Browse all products
router.get('/:id', getProductById);  // Single product

// ── Seller only routes ────────────────────────────────────
router.use(protect);
router.use(authorizeRoles('seller'));
router.use(requireActive);

router.get('/seller/myproducts', getSellerProducts);           // Own products
router.post('/', upload.array('images', 5), createProduct);    // Add product (max 5 images)
router.put('/:id', upload.array('images', 5), updateProduct);  // Edit product
router.delete('/:id', deleteProduct);                          // Delete product
router.put('/:id/toggle', toggleProductStatus);                // Toggle active

module.exports = router;