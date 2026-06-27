const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Coupon code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },

    description: {
      type: String,
      default: '',
      trim: true,
    },

    // ── Discount type ─────────────────────────────────────
    type: {
      type: String,
      enum: ['fixed', 'percentage'],
      required: true,
    },

    // Rs amount (for fixed) or percent (for percentage)
    value: {
      type: Number,
      required: true,
      min: 0,
    },

    // ── Conditions ────────────────────────────────────────
    // Minimum order subtotal (product price) to qualify
    minOrder: {
      type: Number,
      default: 0,
    },

    // Cap on discount for percentage coupons (e.g. 10% off, max Rs 200)
    // null/0 means no cap
    maxDiscount: {
      type: Number,
      default: 0,
    },

    // ── Usage limits ──────────────────────────────────────
    // Total times the coupon can be used across all customers.
    // null means unlimited.
    usageLimit: {
      type: Number,
      default: null,
    },
    usedCount: {
      type: Number,
      default: 0,
    },

    // ── Validity ──────────────────────────────────────────
    expiresAt: {
      type: Date,
      default: null, // null means no expiry
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // Public coupons show in the customer Offers page.
    // Secret coupons (isPublic: false) only work if you know the code.
    isPublic: {
      type: Boolean,
      default: true,
    },

    // Who created it (admin)
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

// ── Instance method: validate against an order subtotal ───
// Returns { valid: bool, message: string, discount: number }
couponSchema.methods.validateFor = function (subtotal) {
  if (!this.isActive) {
    return { valid: false, message: 'This coupon is not active', discount: 0 };
  }
  if (this.expiresAt && new Date() > this.expiresAt) {
    return { valid: false, message: 'This coupon has expired', discount: 0 };
  }
  if (this.usageLimit !== null && this.usedCount >= this.usageLimit) {
    return { valid: false, message: 'This coupon has reached its usage limit', discount: 0 };
  }
  if (subtotal < this.minOrder) {
    return {
      valid: false,
      message: `Minimum order of Rs ${this.minOrder} required for this coupon`,
      discount: 0,
    };
  }

  // Calculate discount
  let discount = 0;
  if (this.type === 'fixed') {
    discount = this.value;
  } else {
    discount = (subtotal * this.value) / 100;
    if (this.maxDiscount && this.maxDiscount > 0) {
      discount = Math.min(discount, this.maxDiscount);
    }
  }

  // Never let discount exceed subtotal
  discount = Math.min(discount, subtotal);
  discount = +discount.toFixed(2);

  return { valid: true, message: 'Coupon applied', discount };
};

module.exports = mongoose.model('Coupon', couponSchema);