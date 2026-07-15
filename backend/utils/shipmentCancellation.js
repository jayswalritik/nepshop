// Shared per-shipment cancellation mechanics — the ONE place that cancels a
// single shipment (stock restore + allocation-aware refund) and finalizes an
// order's cancellation bookkeeping (paymentStatus/settlement/voucher restore
// once EVERY shipment on the order ends up cancelled). Used identically by:
//   - orderController.cancelOrder        (customer, whole order)
//   - orderController.updateOrderStatus  (seller, one shipment)
//   - orderController.cancelShipmentByCustomer (customer, one shipment)
// No money formula lives anywhere else — extracted verbatim from the
// pre-existing inline logic, not reinterpreted.

const Product = require('../models/Product');
const { round2 } = require('./orderPricing');
const { recomputeOrder } = require('./orderAggregate');

// Cancels ONE shipment: restores stock for its items and, if the parent
// order was paid, records the allocation-aware refund on this shipment's
// settlement. Does NOT touch order-level fields — call
// finalizeOrderCancellation once every shipment you intend to cancel in this
// request has gone through here.
const cancelShipment = async (shipment, order) => {
  // Idempotency guard, enforced by the helper itself rather than relying on
  // every caller to pre-filter terminal shipments correctly — a second call
  // on an already-cancelled shipment must not re-restore stock or overwrite
  // an already-recorded refund.
  if (shipment.status === 'cancelled') return;

  for (const item of shipment.items) {
    await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
  }
  shipment.status      = 'cancelled';
  shipment.cancelledAt = new Date();

  if (order.paymentStatus === 'paid') {
    // Voucher-aware: this shipment's slice of the coupon discount was never
    // "theirs" to refund — it only ever discounted the order as a whole, and
    // is NOT restored on a partial cancellation, so the customer keeps that
    // saving on the rest of their order.
    const refund = round2(shipment.sellerSubtotal + shipment.deliveryCharge - (shipment.couponAllocation || 0));
    shipment.settlement.status           = 'refunded';
    shipment.settlement.refundToCustomer = refund;
    shipment.settlement.settledAt        = new Date();
  }
  await shipment.save();
};

// Recomputes order-level derived fields, and — ONLY once every shipment on
// the order has ended up cancelled — flips paymentStatus/settlement to
// refunded and restores the coupon (global + per-user counts).
// Returns { updatedOrder, orderFullyCancelled, refunded }.
const finalizeOrderCancellation = async (orderId) => {
  const updatedOrder       = await recomputeOrder(orderId);
  const orderFullyCancelled = updatedOrder.status === 'cancelled';
  let refunded = false;

  if (orderFullyCancelled && updatedOrder.paymentStatus === 'paid') {
    updatedOrder.paymentStatus = 'refunded';
    refunded = true;
    if (updatedOrder.settlement) {
      updatedOrder.settlement.status           = 'refunded';
      updatedOrder.settlement.refundToCustomer = updatedOrder.total;
      updatedOrder.settlement.settledAt        = new Date();
    }
    await updatedOrder.save();
  }

  // Restore the voucher only once the WHOLE order is cancelled — order
  // never completed, so give the customer their redemption back (both the
  // global count and their own per-user count).
  if (orderFullyCancelled && updatedOrder.couponCode) {
    const Coupon = require('../models/Coupon');
    await Coupon.restoreFor(updatedOrder.couponCode, updatedOrder.customer);
  }

  return { updatedOrder, orderFullyCancelled, refunded };
};

module.exports = { cancelShipment, finalizeOrderCancellation };
