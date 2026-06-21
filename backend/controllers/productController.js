
const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const { cloudinary, uploadToCloudinary } = require('../config/cloudinary');
const { sendLowStockEmail } = require('../utils/emailService');
const User = require('../models/User');
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
  });

  res.status(201).json({
    success: true,
    message: 'Product created successfully',
    product,
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

  if (!product) {
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

  // Handle new image uploads
let images = product.images;
if (req.files && req.files.length > 0) {
  // Delete old images from Cloudinary
  for (const img of product.images) {
    await cloudinary.uploader.destroy(img.publicId);
  }
  // Upload new images
  const uploadPromises = req.files.map((file) => uploadToCloudinary(file.buffer));
  const uploadedImages = await Promise.all(uploadPromises);
  images = uploadedImages.map((result) => ({
    url:      result.secure_url,
    publicId: result.public_id,
  }));
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

  const updated = await product.save();

  // Low stock alert — send email if stock drops to 5 or below
  if (updated.stock <= 5 && updated.stock > 0) {
    const seller = await User.findById(req.user._id);
    if (seller) sendLowStockEmail(seller, updated);
  }

  res.status(200).json({
    success: true,
    message: 'Product updated successfully',
    product: updated,
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