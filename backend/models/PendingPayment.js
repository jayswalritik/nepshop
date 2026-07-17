const mongoose = require('mongoose');

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PendingPayment (backend/models/PendingPayment.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side PaymentIntent-style record created at Khalti/eSewa initiate
 * time and consumed at verify time. Replaces the prior design where the
 * pending order snapshot ("orderData") lived only on the client — web's
 * Khalti flow kept it in sessionStorage, eSewa embedded it base64-encoded in
 * the success_url query string. Verify handlers now look this record up by
 * gatewayRef instead of trusting anything the client sends back, which also
 * gives a real place to track a mobile deep-link return the same way.
 *
 * `gatewayRef` (pidx for Khalti, transaction_uuid for eSewa) is persisted
 * deliberately, not just used as a transient lookup key — it's the
 * documented prerequisite for future gateway-refund integration (both
 * Khalti's and eSewa's refund/reconciliation APIs are keyed off the original
 * pidx/transaction_uuid).
 *
 * TTL: documents expire 30 minutes after creation (createdAt, via
 * `{ timestamps: true }`) — long enough to cover a real gateway round-trip,
 * short enough that abandoned/never-returned-to payment attempts don't
 * accumulate.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const pendingPaymentSchema = new mongoose.Schema(
  {
    gateway: {
      type: String,
      enum: ['khalti', 'esewa'],
      required: true,
    },
    // pidx (Khalti) or transaction_uuid (eSewa) — see file header.
    gatewayRef: {
      type: String,
      required: true,
      unique: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Exact snapshot previously returned to the client as `orderData`:
    // { deliveryAddress, customerNote, paymentMethod, couponCode, total }.
    orderData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    source: {
      type: String,
      enum: ['web', 'mobile'],
      required: true,
      default: 'web',
    },
    status: {
      type: String,
      enum: ['initiated', 'completed', 'failed'],
      default: 'initiated',
    },
  },
  { timestamps: true }
);

// TTL: MongoDB auto-deletes any document 30 minutes after its createdAt.
// 30 minutes = 1800 seconds.
pendingPaymentSchema.index({ createdAt: 1 }, { expireAfterSeconds: 1800 });

module.exports = mongoose.model('PendingPayment', pendingPaymentSchema);
