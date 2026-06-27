const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    // ── Core fields (all roles) ──────────────────────────
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // Never return password in queries by default
    },

    // ── Role (legacy single role — kept for compatibility) ─
    role: {
      type: String,
      enum: ['customer', 'seller', 'delivery', 'admin'],
      required: true,
      default: 'customer',
    },

    // ── Multi-role capabilities ──────────────────────────
    // What this user is allowed to do. A user can hold multiple
    // roles (e.g. ['customer','seller']) but admin is never mixed.
    roles: {
      type: [String],
      enum: ['customer', 'seller', 'delivery', 'admin'],
      default: undefined, // set during migration/registration
    },

    // ── Active role (which dashboard they're currently using) ─
    activeRole: {
      type: String,
      enum: ['customer', 'seller', 'delivery', 'admin'],
      default: undefined,
    },

    // ── Pending role request ─────────────────────────────
    // When a user applies to add a new role, it sits here until
    // an admin approves it. They keep using existing roles meanwhile.
    pendingRoleRequest: {
      role:        { type: String, enum: ['seller', 'delivery', null], default: null },
      requestedAt: { type: Date, default: null },
      status:      { type: String, enum: ['pending', 'rejected', null], default: null },
    },

    // ── Account status ───────────────────────────────────
    // customer  → always 'active' on signup
    // seller    → 'pending' until admin approves
    // delivery  → 'pending' until admin approves
    // admin     → seeded directly as 'active'
    status: {
      type: String,
      enum: ['active', 'pending', 'suspended', 'rejected'],
      default: 'pending',
    },

    // ── Seller-specific fields ───────────────────────────
    shopName: {
      type: String,
      trim: true,
      default: null,
    },
    panNumber: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Seller shop address ───────────────────────────────────
shopAddress: {
  street:   { type: String, default: null },
  city:     { type: String, default: null },
  district: { type: String, default: null },
  phone:    { type: String, default: null },
},

    // ── Delivery agent-specific fields ───────────────────
    vehicleType: {
      type: String,
      enum: ['Motorcycle', 'Scooter', 'Bicycle', 'Van / Car', null],
      default: null,
    },
    citizenshipNumber: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Profile ──────────────────────────────────────────
    profileImage: {
      type: String,
      default: null,
    },

    // Wishlist — products the customer saved
    wishlist: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    }],

    // ── Payout details (seller + delivery) ───────────────────
    payoutDetails: {
      preferredMethod: {
        type:    String,
        enum:    ['bank', 'khalti', 'esewa', null],
        default: null,
      },
      bankName:          { type: String, default: null },
      accountNumber:     { type: String, default: null },
      accountHolderName: { type: String, default: null },
      khaltiNumber:      { type: String, default: null },
      esewaNumber:       { type: String, default: null },
    },

    // ── Commission rate (seller specific) ────────────────────
    commissionRate: {
      type:    Number,
      default: 5, // Default 5%
      min:     0,
      max:     50,
    },

    // ── Admin metadata ───────────────────────────────────
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },

    // ── Password reset ───────────────────────────────────
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpire: { type: Date, default: null },
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

// ── Hash password before saving ──────────────────────────
userSchema.pre('save', async function (next) {
  // Only hash if password was modified
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ── Instance method: compare password ────────────────────
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// ── Generate password reset token ─────────────────────────
userSchema.methods.generateResetToken = function () {
  const crypto = require('crypto');
  const resetToken = crypto.randomBytes(32).toString('hex');

  // Hash and store
  this.resetPasswordToken  = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.resetPasswordExpire = Date.now() + 15 * 60 * 1000; // 15 minutes

  return resetToken; // Return unhashed token for email
};

// ── Instance method: get public profile (no sensitive data) ──
userSchema.methods.toPublicJSON = function () {
  return {
    _id:                this._id,
    firstName:          this.firstName,
    lastName:           this.lastName,
    email:              this.email,
    phone:              this.phone,
    role:               this.role,
    roles:              this.roles && this.roles.length ? this.roles : [this.role],
    activeRole:         this.activeRole || this.role,
    pendingRoleRequest: this.pendingRoleRequest,
    status:             this.status,
    shopName:           this.shopName,
    shopAddress:        this.shopAddress,
    panNumber:          this.panNumber,
    vehicleType:        this.vehicleType,
    citizenshipNumber:  this.citizenshipNumber,
    profileImage:       this.profileImage,
    payoutDetails:      this.payoutDetails,
    commissionRate:     this.commissionRate,
    createdAt:          this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
