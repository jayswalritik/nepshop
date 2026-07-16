const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const { cloudinary, uploadToCloudinary } = require('../config/cloudinary');
const { sendLowStockEmail } = require('../utils/emailService');
const User = require('../models/User');
const { embedDocument, buildProductText } = require('../services/embeddingService'); //Phase 2
// ─────────────────────────────────────────────────────────
// @desc    Create a new product
// @route   POST /api/products
// @access  Seller only
// ─────────────────────────────────────────────────────────
const createProduct = asyncHandler(async (req, res) => {
  const {
    name, description, price, comparePrice,
    category, stock, discount,
  } = req.body;

  // Upload images to Cloudinary from memory buffer
if (!req.files || req.files.length === 0) {
  res.status(400);
  throw new Error('At least one product image is required');
}

const uploadPromises = req.files.map((file) => uploadToCloudinary(file.buffer));
const uploadedImages = await Promise.all(uploadPromises);

const images = uploadedImages.map((result) => ({
  url:      result.secure_url,
  publicId: result.public_id,
}));

  // Phase 2: compute the semantic embedding from the product's text.
  // Non-fatal — if embedding hiccups, the product is still created; text search
  // still works and a later backfill can fill the vector in.
  let embedding;
  try {
    embedding = await embedDocument(buildProductText({ name, description, category }));
  } catch (err) {
    console.warn('Embedding failed on create (product will still be saved):', err.message);
  }

  const product = await Product.create({
    name,
    description,
    price:        Number(price),
    comparePrice: comparePrice ? Number(comparePrice) : null,
    category,
    stock:        Number(stock),
    discount:     discount ? Number(discount) : 0,
    images,
    seller: req.user._id,
    embedding,
  });

  // Don't expose the raw 384-number vector in the API response.
  const productData = product.toObject();
  delete productData.embedding;

  res.status(201).json({
    success: true,
    message: 'Product created successfully',
    product: productData,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Get all products for the logged-in seller
// @route   GET /api/products/seller
// @access  Seller only
// ─────────────────────────────────────────────────────────
const getSellerProducts = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, category, status } = req.query;

  const query = { seller: req.user._id };

  if (search) {
    query.$or = [
      { name:        { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }
  if (category) query.category = category;
  if (status === 'active')   query.isActive = true;
  if (status === 'inactive') query.isActive = false;

  const total    = await Product.countDocuments(query);
  const products = await Product.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  res.status(200).json({
    success: true,
    total,
    page:       Number(page),
    totalPages: Math.ceil(total / limit),
    products,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Get all active products (for customers)
// @route   GET /api/products
// @access  Public
// ─────────────────────────────────────────────────────────
const getAllProducts = asyncHandler(async (req, res) => {
  const { page = 1, limit = 12, search, category, minPrice, maxPrice, sort } = req.query;

  const query = { isActive: true, stock: { $gt: 0 } };

  if (search) {
    query.$or = [
      { name:     { $regex: search, $options: 'i' } },
      { category: { $regex: search, $options: 'i' } },
    ];
  }
  if (category) query.category = category;
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = Number(minPrice);
    if (maxPrice) query.price.$lte = Number(maxPrice);
  }

  // Sort options
  const sortMap = {
    newest:      { createdAt: -1 },
    price_asc:   { price: 1 },
    price_desc:  { price: -1 },
    top_rated:   { rating: -1 },
  };
  const sortBy = sortMap[sort] || { createdAt: -1 };

  const total    = await Product.countDocuments(query);
  const products = await Product.find(query)
    .populate('seller', 'firstName lastName shopName')
    .sort(sortBy)
    .skip((page - 1) * limit)
    .limit(Number(limit));

  res.status(200).json({
    success: true,
    total,
    page:       Number(page),
    totalPages: Math.ceil(total / limit),
    products,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Get single product by ID
// @route   GET /api/products/:id
// @access  Public
// ─────────────────────────────────────────────────────────
const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate('seller', 'firstName lastName shopName phone');

  // Same "hidden platform-wide" rule every other customer-facing surface
  // already applies (browse/search/recommendations) — a deactivated
  // product's direct-URL page must 404 too, not just be absent from lists.
  if (!product || !product.isActive) {
    res.status(404);
    throw new Error('Product not found');
  }

  res.status(200).json({ success: true, product });
});

// ─────────────────────────────────────────────────────────
// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Seller only (own products)
// ─────────────────────────────────────────────────────────
const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // Make sure seller owns this product
  if (product.seller.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('You can only edit your own products');
  }

  const {
    name, description, price, comparePrice,
    category, stock, discount, isActive,
  } = req.body;

  // New images are APPENDED, existing images are only ever removed when the
  // seller explicitly marks them in the edit form (ProductList.jsx's
  // EditProductModal) and sends their publicId back here — this is the one
  // legitimate destructive path, so it's built to a strict order of
  // operations: (1) validate everything, including that every removal
  // publicId actually belongs to THIS product — anything sent that doesn't
  // match is silently dropped from the destroy list (and reported in the
  // response message), never trusted blindly; (2) upload new images;
  // (3) save the product with the final image set; (4) ONLY once that save
  // has succeeded, destroy the validated removals on Cloudinary. If destroy
  // ran before the save and the save then failed, the images would be gone
  // while the product still referenced them — data loss plus broken image
  // links. The reverse (save succeeds, a destroy call fails) just orphans
  // an asset on Cloudinary, which is harmless, so destroy failures are
  // logged, never thrown.

  // FormData sends repeated fields under the same name for the removal
  // list (matching how `images` files are already sent), which multer
  // collects into req.body.removePublicIds as either a single string (one
  // value) or an array (multiple) — [].concat() normalizes both cases
  // without needing JSON stringify/parse on either side of the request.
  const removePublicIds = req.body.removePublicIds
    ? [].concat(req.body.removePublicIds)
    : [];

  const existingIds = new Set(product.images.map((img) => img.publicId));
  const validRemoveIds = removePublicIds.filter((id) => existingIds.has(id));
  const invalidRemoveIds = removePublicIds.filter((id) => !existingIds.has(id));

  const keptImages = product.images.filter((img) => !validRemoveIds.includes(img.publicId));
  const incomingFileCount = req.files ? req.files.length : 0;
  const finalImageCount = keptImages.length + incomingFileCount;

  if (finalImageCount < 1) {
    res.status(400);
    throw new Error(
      'A product needs at least 1 image — add a replacement before removing the last one.'
    );
  }
  if (finalImageCount > 5) {
    res.status(400);
    throw new Error(
      `This would leave ${finalImageCount} images — the maximum is 5. Remove more or add fewer.`
    );
  }

  // Upload new images only after every check above has passed.
  let images = keptImages;
  if (incomingFileCount > 0) {
    const uploadPromises = req.files.map((file) => uploadToCloudinary(file.buffer));
    const uploadedImages = await Promise.all(uploadPromises);
    const newImages = uploadedImages.map((result) => ({
      url:      result.secure_url,
      publicId: result.public_id,
    }));
    images = [...keptImages, ...newImages];
  }

  product.name         = name         || product.name;
  product.description  = description  || product.description;
  product.price        = price        ? Number(price)        : product.price;
  product.comparePrice = comparePrice ? Number(comparePrice) : product.comparePrice;
  product.category     = category     || product.category;
  product.stock        = stock        !== undefined ? Number(stock) : product.stock;
  product.discount     = discount     !== undefined ? Number(discount) : product.discount;
  product.isActive     = isActive     !== undefined ? isActive : product.isActive;
  product.images       = images;

  // Phase 2: re-embed from the updated text (non-fatal — see createProduct note).
  try {
    product.embedding = await embedDocument(buildProductText(product));
  } catch (err) {
    console.warn('Embedding failed on update (product will still be saved):', err.message);
  }

  const updated = await product.save();

  // Destroy removed images ONLY after the save above has succeeded, and
  // ONLY the validated list — never product.images generally (that was
  // exactly the previous bug).
  for (const publicId of validRemoveIds) {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (err) {
      console.warn(`Failed to delete Cloudinary image ${publicId} after product update:`, err.message);
    }
  }

  // Low stock alert — send email if stock drops to 5 or below
  if (updated.stock <= 5 && updated.stock > 0) {
    const seller = await User.findById(req.user._id);
    if (seller) sendLowStockEmail(seller, updated);
  }

  // Don't expose the raw 384-number vector in the API response.
  const productData = updated.toObject();
  delete productData.embedding;

  res.status(200).json({
    success: true,
    message: invalidRemoveIds.length > 0
      ? `Product updated successfully. ${invalidRemoveIds.length} requested image removal${invalidRemoveIds.length === 1 ? '' : 's'} ignored (not part of this product).`
      : 'Product updated successfully',
    product: productData,
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Seller only (own products)
// ─────────────────────────────────────────────────────────
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  if (product.seller.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('You can only delete your own products');
  }

  // Delete images from Cloudinary
  for (const img of product.images) {
    await cloudinary.uploader.destroy(img.publicId);
  }

  await product.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Product deleted successfully',
  });
});

// ─────────────────────────────────────────────────────────
// @desc    Toggle product active / inactive
// @route   PUT /api/products/:id/toggle
// @access  Seller only
// ─────────────────────────────────────────────────────────
const toggleProductStatus = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  if (product.seller.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized');
  }

  product.isActive = !product.isActive;
  await product.save();

  res.status(200).json({
    success: true,
    message: `Product ${product.isActive ? 'activated' : 'deactivated'} successfully`,
    isActive: product.isActive,
  });
});

module.exports = {
  createProduct,
  getSellerProducts,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  toggleProductStatus,
};