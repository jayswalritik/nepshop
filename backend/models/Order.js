const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  name:     { type: String, required: true }, // Snapshot
  image:    { type: String, required: true }, // Snapshot
  price:    { type: Number, required: true }, // Snapshot
  quantity: { type: Number, required: true },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
});

const orderSchema = new mongoose.Schema(
  {
    // ── Customer ─────────────────────────────────────────
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ── Items ─────────────────────────────────────────────
    items: [orderItemSchema],

    // ── Delivery address ──────────────────────────────────
    deliveryAddress: {
      fullName:  { type: String, required: true },
      phone:     { type: String, required: true },
      street:    { type: String, required: true },
      city:      { type: String, required: true },
      district:  { type: String, required: true },
      landmark:  { type: String, default: '' },
    },

    // ── Payment ───────────────────────────────────────────
    paymentMethod: {
      type: String,
      enum: ['cash_on_delivery', 'khalti', 'esewa'],
      default: 'cash_on_delivery',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },

    // ── Order status ──────────────────────────────────────
    // pending     → order placed, waiting for seller
    // confirmed   → seller accepted
    // packed      → seller packed the order
    // dispatched  → handed to delivery agent
    // delivered   → delivery agent delivered
    // cancelled   → cancelled by customer or seller
    // returned    → customer returned
    status: {
      type: String,
      enum: [
        'pending', 'confirmed', 'packed',
        'dispatched', 'delivered', 'cancelled',
        'return_assigned',     // return approved, pickup agent assigned
        'return_in_transit',   // agent picked up from customer
        'returned'             // returned to seller, complete
      ],
      default: 'pending',
    },

    // ── Delivery agent ────────────────────────────────────
    deliveryAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // ── Pickup address (seller's shop address) ────────────────
    pickupAddress: {
        shopName: { type: String, default: null },
        street:   { type: String, default: null },
        city:     { type: String, default: null },
        district: { type: String, default: null },
        phone:    { type: String, default: null },
    },

    // ── Pricing ───────────────────────────────────────────
    subtotal:       { type: Number, required: true },
    deliveryCharge: { type: Number, default: 0 },
    discount:       { type: Number, default: 0 },
    total:          { type: Number, required: true },

    // ── Commission ────────────────────────────────────────
    commissionRate:   { type: Number, default: 5 }, // percentage
    commissionAmount: { type: Number, default: 0 },
    deliveryEarning: { type: Number, default: 50 }, // Rs 50 per delivery

    // ── Settlement (escrow model) ─────────────────────────
    settlement: {
      // Overall state of this order's money
      // held      → customer paid, nothing released yet
      // partial   → delivery agent paid, seller+commission locked
      // released  → 7-day window passed, seller paid, commission booked
      // refunded  → returned, money reversed per fault rules
      
      status: {
        type: String,
        enum: ['held', 'partial', 'return_pending', 'released', 'refunded'],
        default: 'held',
      },

      // Delivery agent earning — released immediately on delivery
      deliveryAgentPaid:   { type: Boolean, default: false },
      deliveryAgentPaidAt: { type: Date, default: null },

      // Seller share (product subtotal minus commission) — locked then released
      sellerShare:         { type: Number, default: 0 },
      sellerReleased:      { type: Boolean, default: false },
      sellerReleasedAt:    { type: Date, default: null },

      // Commission — booked on release, reversed on return
      commissionBooked:    { type: Boolean, default: false },

      // When the 7-day lock expires (set on delivery)
      lockUntil:           { type: Date, default: null },

      // Return / reversal tracking
      returnPickupAgent:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      returnPickupEarning: { type: Number, default: 0 },
      returnFault:         { type: String, enum: ['seller', 'customer', null], default: null },
      refundToCustomer:    { type: Number, default: 0 },
      sellerBearsDelivery: { type: Number, default: 0 }, // how much delivery cost seller absorbs
      customerBearsDelivery:{ type: Number, default: 0 }, // how much delivery cost customer absorbs
      settledAt:           { type: Date, default: null },

      // ── Payout tracking (admin marks these paid) ──────────
      sellerPaidOut:       { type: Boolean, default: false },
      sellerPaidOutAt:     { type: Date, default: null },
      agentPaidOut:        { type: Boolean, default: false },
      agentPaidOutAt:      { type: Date, default: null },
    },

    // ── Notes ─────────────────────────────────────────────
    customerNote: { type: String, default: '' },

    // ── Timestamps for each status ────────────────────────
    confirmedAt:  { type: Date, default: null },
    packedAt:     { type: Date, default: null },
    dispatchedAt: { type: Date, default: null },
    deliveredAt:  { type: Date, default: null },
    cancelledAt:  { type: Date, default: null },
  },
  { timestamps: true }
);

// Index for fast queries
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ 'items.seller': 1 });
orderSchema.index({ deliveryAgent: 1 });

module.exports = mongoose.model('Order', orderSchema);