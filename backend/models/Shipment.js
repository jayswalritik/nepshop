const mongoose = require('mongoose');

// Mirrors Order's orderItemSchema — same snapshot shape, scoped to one seller.
const shipmentItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  name:     { type: String, required: true },
  image:    { type: String, required: true },
  price:    { type: Number, required: true },
  quantity: { type: Number, required: true },
  // This line's PER-LINE share of the order's coupon discount (Rs, not a
  // per-unit rate) — see Order.js orderItemSchema.couponAllocation, same
  // shape/meaning, copied from the order item at shipment-creation time.
  couponAllocation: { type: Number, default: 0 },
  // How many units of THIS line have already been reserved/returned across
  // all Return documents against this shipment (pending, approved, picked_up,
  // or refunded — everything except rejected). Incremented atomically at
  // return-request time (race-safe reservation) and decremented back on
  // rejection. requestedQty for a new return must satisfy
  // requestedQty <= quantity - returnedQuantity.
  returnedQuantity: { type: Number, default: 0 },
}, { _id: false });

const shipmentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    items: [shipmentItemSchema],

    // Same enum as Order.status today — per-shipment.
    status: {
      type: String,
      enum: [
        'pending', 'confirmed', 'packed',
        'dispatched', 'delivered', 'cancelled',
        'return_assigned',
        'return_in_transit',
        'returned',
      ],
      default: 'pending',
    },

    deliveryAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    pickupAddress: {
      shopName: { type: String, default: null },
      street:   { type: String, default: null },
      city:     { type: String, default: null },
      district: { type: String, default: null },
      phone:    { type: String, default: null },
    },

    // ── Pricing (this seller's slice only) ────────────────
    sellerSubtotal:   { type: Number, required: true },
    deliveryCharge:   { type: Number, default: 0 },
    commissionRate:   { type: Number, default: 5 },
    commissionAmount: { type: Number, default: 0 },
    deliveryEarning:  { type: Number, default: 50 },
    // Sum of this shipment's items' couponAllocation — convenience field so
    // refund math (orderController cancellation) doesn't have to re-sum
    // `items` every time. 0/absent on orders without a coupon.
    couponAllocation: { type: Number, default: 0 },

    // ── Settlement (escrow model) — scoped to this shipment ─
    settlement: {
      status: {
        type: String,
        enum: ['held', 'partial', 'return_pending', 'released', 'refunded'],
        default: 'held',
      },
      deliveryAgentPaid:   { type: Boolean, default: false },
      deliveryAgentPaidAt: { type: Date, default: null },

      sellerShare:      { type: Number, default: 0 },
      sellerReleased:   { type: Boolean, default: false },
      sellerReleasedAt: { type: Date, default: null },

      commissionBooked: { type: Boolean, default: false },
      lockUntil:        { type: Date, default: null },

      refundToCustomer: { type: Number, default: 0 },
      settledAt:        { type: Date, default: null },

      sellerPaidOut:   { type: Boolean, default: false },
      sellerPaidOutAt: { type: Date, default: null },
      agentPaidOut:    { type: Boolean, default: false },
      agentPaidOutAt:  { type: Date, default: null },

      // Signed Rs ledger entry for a return reversal that landed AFTER this
      // shipment's seller share was already released or paid out (so it can
      // no longer be corrected by just editing sellerShare directly).
      // Negative = seller owes this back; netted into admin's per-seller
      // payout total the next time getPayouts/paySeller runs for them, then
      // reset to 0 (see adminController.getPayouts/paySeller).
      adjustment: { type: Number, default: 0 },
    },

    // Held while a return is open on THIS shipment specifically (set at
    // return-request time, cleared once every open Return against this
    // shipment is rejected or completed — see returnController.refreshReturnHold).
    returnHold: { type: Boolean, default: false },

    // ── Timestamps for each status ────────────────────────
    confirmedAt:  { type: Date, default: null },
    packedAt:     { type: Date, default: null },
    dispatchedAt: { type: Date, default: null },
    deliveredAt:  { type: Date, default: null },
    cancelledAt:  { type: Date, default: null },
  },
  { timestamps: true }
);

shipmentSchema.index({ seller: 1, createdAt: -1 });
shipmentSchema.index({ deliveryAgent: 1, status: 1 });
shipmentSchema.index({ order: 1 });

module.exports = mongoose.model('Shipment', shipmentSchema);
