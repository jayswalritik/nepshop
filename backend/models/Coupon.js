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

    // Max redemptions per customer (Daraz-style — default 1: one use each).
    // Existing coupons predating this field get the default on hydration.
    perUserLimit: {
      type: Number,
      default: 1,
    },
    // Per-customer redemption ledger. Missing on coupons created before this
    // field existed — Mongoose applies the [] default on hydration, and
    // every read site also falls back to [] defensively (see redeemFor/
    // restoreFor below and every call site's `coupon.usedBy || []`).
    usedBy: [{
      user:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      count: { type: Number, default: 0 },
    }],

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

// ── Instance method: validate against an order subtotal + (optionally) a
// customer's own redemption history ────────────────────────────────────
// Returns { valid: bool, message: string, discount: number }.
// `userId` is optional so old call sites that genuinely have no user
// context still work (the per-user check is simply skipped, matching prior
// behavior) — but every real call site in this codebase now passes it.
// `options.skipLimits` skips BOTH the global and per-user count checks —
// used by Coupon.redeemFor below, which re-checks those two atomically
// against the database instead (see comment there for why).
couponSchema.methods.validateFor = function (subtotal, userId, options = {}) {
  const { skipLimits = false } = options;

  if (!this.isActive) {
    return { valid: false, message: 'This coupon is not active', discount: 0 };
  }
  if (this.expiresAt && new Date() > this.expiresAt) {
    return { valid: false, message: 'This coupon has expired', discount: 0 };
  }

  if (!skipLimits) {
    if (this.usageLimit !== null && this.usedCount >= this.usageLimit) {
      return { valid: false, message: 'This voucher has been fully redeemed', discount: 0 };
    }
    if (userId) {
      const entry = (this.usedBy || []).find(u => u.user?.toString() === userId.toString());
      const perUserCount = entry ? entry.count : 0;
      const perUserLimit = this.perUserLimit ?? 1;
      if (perUserCount >= perUserLimit) {
        return { valid: false, message: 'You have already used this voucher', discount: 0 };
      }
    }
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

// ── Static: atomic, race-safe redemption ──────────────────────────────
// Validates the coupon (active/expiry/minOrder, non-atomically — those
// never change based on concurrent requests) and then, in a SINGLE
// conditional findOneAndUpdate, checks AND consumes one redemption against
// both the global usageLimit and this customer's perUserLimit. No
// read-then-write gap: if two checkouts race for the last slot, MongoDB
// serializes the two updates against the same document, and the loser's
// filter re-evaluation (against the already-incremented document) simply
// fails to match — it never sees a stale/pre-race view.
// Returns { ok: true, coupon, discount } or { ok: false, message }.
couponSchema.statics.redeemFor = async function (code, userId, subtotal) {
  if (!code) return { ok: false, message: 'Coupon code is required' };
  const normalizedCode = code.toUpperCase().trim();

  const coupon = await this.findOne({ code: normalizedCode });
  if (!coupon) return { ok: false, message: 'Invalid coupon code' };

  const preCheck = coupon.validateFor(subtotal, userId, { skipLimits: true });
  if (!preCheck.valid) return { ok: false, message: preCheck.message };

  const globalOk = { $or: [{ usageLimit: null }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] };

  // Attempt 1 — this customer already has a usedBy entry: increment it in
  // place, only if still under perUserLimit (and the global limit holds).
  let updated = await this.findOneAndUpdate(
    {
      code: normalizedCode,
      isActive: true,
      'usedBy.user': userId,
      ...globalOk,
      $expr: {
        $lt: [
          { $let: {
              vars: {
                entry: { $first: { $filter: { input: '$usedBy', cond: { $eq: ['$$this.user', userId] } } } },
              },
              in: '$$entry.count',
          } },
          '$perUserLimit',
        ],
      },
    },
    { $inc: { usedCount: 1, 'usedBy.$.count': 1 } },
    { new: true }
  );

  // Attempt 2 — no existing usedBy entry for this customer: push a new one.
  if (!updated) {
    updated = await this.findOneAndUpdate(
      {
        code: normalizedCode,
        isActive: true,
        'usedBy.user': { $ne: userId },
        perUserLimit: { $gt: 0 },
        ...globalOk,
      },
      { $inc: { usedCount: 1 }, $push: { usedBy: { user: userId, count: 1 } } },
      { new: true }
    );
  }

  if (!updated) {
    // Both atomic attempts failed — figure out which limit was hit, for a
    // clean message. A further race here only changes which message is
    // shown, never whether money/redemptions move (already decided above).
    const latest = await this.findOne({ code: normalizedCode });
    if (latest && latest.usageLimit !== null && latest.usedCount >= latest.usageLimit) {
      return { ok: false, message: 'This voucher has been fully redeemed' };
    }
    return { ok: false, message: 'You have already used this voucher' };
  }

  return { ok: true, coupon: updated, discount: preCheck.discount };
};

// ── Static: reverse one redemption ─────────────────────────────────────
// Used when a FULLY-cancelled order's coupon use should be given back to
// the customer. Floors usedCount at 0 via the query filter (`$gt: 0`) rather
// than letting $inc go negative, then decrements this user's usedBy entry
// and PULLS it once it reaches 0 — a zeroed-but-still-present entry is not
// "restored": redeemFor's Attempt-1 path would still require an existing
// usedBy entry for this user, and more importantly the customer would stay
// visibly "in usedBy" (the exact defect this fixes; see the two live data
// points that traced back to this single shared call site). MongoDB doesn't
// allow $inc on 'usedBy.$.count' and $pull on 'usedBy' in the same update
// (same top-level path), so this is three sequential, independently
// idempotent steps — each re-checks the CURRENT state via its filter, so
// calling restoreFor twice in a row is a no-op the second time, not a
// double-decrement or a corrupt array.
couponSchema.statics.restoreFor = async function (code, userId) {
  if (!code) return;
  const normalizedCode = code.toUpperCase().trim();

  await this.findOneAndUpdate(
    { code: normalizedCode, usedCount: { $gt: 0 } },
    { $inc: { usedCount: -1 } }
  );
  if (userId) {
    await this.findOneAndUpdate(
      { code: normalizedCode, 'usedBy.user': userId, 'usedBy.count': { $gt: 0 } },
      { $inc: { 'usedBy.$.count': -1 } }
    );
    // Self-healing: also cleans up any pre-existing zeroed-but-not-pulled
    // entry from before this fix, not just ones this call just decremented.
    await this.updateOne(
      { code: normalizedCode },
      { $pull: { usedBy: { user: userId, count: { $lte: 0 } } } }
    );
  }
};

module.exports = mongoose.model('Coupon', couponSchema);