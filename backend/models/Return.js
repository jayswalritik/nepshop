const mongoose = require('mongoose');

const returnSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    items: [
      {
        product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name:     { type: String, required: true },
        image:    { type: String },
        quantity: { type: Number, required: true },
        price:    { type: Number, required: true },
      },
    ],
    reason: {
      type: String,
      required: [true, 'Return reason is required'],
      enum: [
        'Damaged product',
        'Wrong product delivered',
        'Product not as described',
        'Changed my mind',
        'Better price available',
        'Other',
      ],
    },
    description: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      // pending → admin reviews
      // approved → fault set, pickup agent assigned, awaiting pickup
      // picked_up → agent collected from customer
      // refunded → returned to seller, money reversed, complete
      // rejected → admin declined
      enum: ['pending', 'approved', 'picked_up', 'refunded', 'rejected'],
      default: 'pending',
    },

    // ── Fault & settlement (set by admin on approval) ─────
    fault: {
      type: String,
      enum: ['seller', 'customer', null],
      default: null,
    },

    // ── Return pickup (reverse delivery job) ──────────────
    returnAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    pickedUpAt:        { type: Date, default: null },
    returnedToSellerAt:{ type: Date, default: null },
    returnAgentEarning:{ type: Number, default: 50 },
    refundAmount: {
      type: Number,
      default: 0,
    },
    refundMethod: {
      type: String,
      enum: ['original_payment', 'khalti', 'esewa', 'bank', null],
      default: null,
    },
    adminNote: {
      type: String,
      default: '',
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Return', returnSchema);