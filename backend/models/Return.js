const mongoose = require('mongoose');

const returnSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    // The ONE shipment this return is against — a return never spans
    // multiple sellers/packages. Item-level: only the affected shipment's
    // settlement is ever touched or held (see returnController).
    shipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shipment',
      required: true,
      index: true,
    },
    // Denormalized from shipment.seller at request time — lets seller-scoped
    // queries/emails avoid a populate round-trip.
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // The SUBSET of the shipment's items being returned — quantity here is
    // the returned quantity for that line, not the original order quantity.
    items: [
      {
        product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name:     { type: String, required: true },
        image:    { type: String },
        quantity: { type: Number, required: true },
        price:    { type: Number, required: true },
        // This return's slice of the line's couponAllocation — line
        // allocation ÷ line quantity × returned quantity (see orderPricing.js
        // comments on couponAllocation for the per-line/per-unit distinction).
        couponAllocation: { type: Number, default: 0 },
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

    // Whether this return covered EVERY remaining unit of every item in the
    // shipment (computed + stored at completion, for auditability/display).
    fullShipmentReturn: { type: Boolean, default: false },

    // ── Fault & settlement (set by admin on approval) ─────
    fault: {
      type: String,
      enum: ['seller', 'customer', null],
      default: null,
    },

    // ── Money — computed at completion, stored for auditability ──────
    returnedValue:      { type: Number, default: 0 }, // V: sticker value of the returned units
    refundToCustomer:    { type: Number, default: 0 }, // voucher-aware amount actually refunded
    sellerReversal:      { type: Number, default: 0 }, // amount seller gives back (before pickup/delivery add-ons)
    commissionReversal:  { type: Number, default: 0 }, // amount NepShop gives back
    voucherReclaimed:    { type: Number, default: 0 }, // NepShop's absorbed voucher, shrunk by this

    // ── Return pickup (reverse delivery job) ──────────────
    returnAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    pickedUpAt:        { type: Date, default: null },
    returnedToSellerAt:{ type: Date, default: null },
    returnAgentEarning:{ type: Number, default: 50 },
    // Paid-tracking for the return-pickup leg, mirrors
    // Shipment.settlement.agentPaidOut/agentPaidOutAt exactly. Only ever
    // meaningful once status is 'refunded' (the only terminal status where a
    // pickup leg was actually performed — see adminController.getPayouts).
    pickupPaidOut:     { type: Boolean, default: false },
    pickupPaidOutAt:   { type: Date, default: null },
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

returnSchema.index({ shipment: 1, status: 1 });

module.exports = mongoose.model('Return', returnSchema);
