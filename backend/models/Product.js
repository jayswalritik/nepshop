const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    // ── Basic info ────────────────────────────────────────
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [200, 'Product name cannot exceed 200 characters'],
    },
    description: {
      type: String,
      required: [true, 'Product description is required'],
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    price: {
      type: Number,
      required: [true, 'Product price is required'],
      min: [0, 'Price cannot be negative'],
    },
    comparePrice: {
      type: Number,
      default: null, // Original price before discount
      min: [0, 'Compare price cannot be negative'],
    },

    // ── Images ───────────────────────────────────────────
    // Stored as Cloudinary URLs
    images: [
      {
        url: { type: String, required: true },
        publicId: { type: String, required: true }, // Cloudinary public_id for deletion
      },
    ],

    // ── Category ─────────────────────────────────────────
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: [
        'Electronics',
        'Clothing',
        'Food & Grocery',
        'Home & Kitchen',
        'Beauty & Health',
        'Sports & Outdoors',
        'Books & Stationery',
        'Toys & Games',
        'Automotive',
        'Other',
      ],
    },

    // ── Stock ─────────────────────────────────────────────
    stock: {
      type: Number,
      required: [true, 'Stock quantity is required'],
      min: [0, 'Stock cannot be negative'],
      default: 0,
    },

    // ── Seller reference ──────────────────────────────────
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ── Status ───────────────────────────────────────────
    isActive: {
      type: Boolean,
      default: true, // Seller can deactivate without deleting
    },
    isFeatured: {
      type: Boolean,
      default: false, // Admin can feature products on homepage
    },

    // ── Ratings ──────────────────────────────────────────
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    numReviews: {
      type: Number,
      default: 0,
    },

    // ── Discount coupon ───────────────────────────────────
    discount: {
      type: Number,
      default: 0, // Percentage e.g. 10 means 10% off
      min: 0,
      max: 100,
    },
  },
  {
    timestamps: true,
  }
);

// ── Virtual: discounted price ─────────────────────────────
productSchema.virtual('discountedPrice').get(function () {
  if (this.discount > 0) {
    return +(this.price - (this.price * this.discount) / 100).toFixed(2);
  }
  return this.price;
});

// ── Virtual: in stock ─────────────────────────────────────
productSchema.virtual('inStock').get(function () {
  return this.stock > 0;
});

// ── Index for search ──────────────────────────────────────
productSchema.index({ name: 'text', description: 'text', category: 'text' });
productSchema.index({ seller: 1 });
productSchema.index({ category: 1 });
productSchema.index({ price: 1 });
productSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);