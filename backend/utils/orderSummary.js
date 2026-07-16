// Pure functions behind GET /api/orders/:id/summary — reproduces EXACTLY
// what frontend/src/pages/customer/OrdersPage.jsx currently computes
// client-side (its Paid / To-pay-on-delivery / Refunded footer, ~lines
// 487-548, and CancelPackageModal's confirmation figure), so the website's
// client-computed numbers and this endpoint's numbers agree to the paisa.
// No DB access here — inputs are the already-loaded Order + Shipment[]
// (see backend/controllers/orderController.js's getOrderSummary), and every
// figure is delegated to orderPricing.js's round2 — nothing new is rounded
// here.

const { round2 } = require('./orderPricing');

// Same set OrdersPage.jsx's ACTIVE_STATUSES uses. Shipment.js's enum also
// lists legacy 'return_assigned'/'return_in_transit', but those are never
// actually set anymore (see adminController.js/orderActions.js's own
// comments) — deliberately absent here too, same as web.
const ACTIVE_STATUSES = ['pending', 'confirmed', 'packed', 'dispatched'];

// Same eligibility OrdersPage.jsx's per-package "Cancel package" button uses
// (and cancelShipmentByCustomer enforces server-side) — see
// backend/controllers/orderController.js cancelShipmentByCustomer.
const CANCEL_ELIGIBLE_STATUSES = ['pending', 'confirmed'];

// The ONE money formula this whole module is built around — literally
// `payable` in OrdersPage.jsx's footer closure AND CancelPackageModal's
// `refund` const. One seller-package's money if it stands alone: what the
// customer owes/gets back for just this shipment.
const shipmentPayable = (s) =>
  round2((s.sellerSubtotal || 0) + (s.deliveryCharge || 0) - (s.couponAllocation || 0));

// 'cancelled' AND 'returned' both count as "removed" — a returned shipment
// was refunded via the separate return flow, so (same as web's own comment)
// it must not reappear as payable here.
const isRemoved = (s) => s.status === 'cancelled' || s.status === 'returned';

// Mirrors OrdersPage.jsx's footer branch-for-branch, INCLUDING its
// "all-or-nothing" edge case: hasRemovedShipment requires a MIX of removed
// and non-removed shipments. An order where EVERY shipment ends up
// cancelled/returned does NOT satisfy that, so the web (and this function)
// silently falls through to the "nothing removed" branch — an all-zero
// bucket for a fully-cancelled order, no Refunded/Original-total signal at
// all in THIS footer (the order's own status badge still shows "cancelled"
// elsewhere on the page). This is the web's existing behavior, reproduced
// on purpose, not fixed — see orderSummary.test.js's E5 and the task
// summary's STOP-case note.
//
// Returns `hasRemovedShipment` alongside the three buckets so callers (and
// tests) can distinguish "genuinely nothing removed" from "everything
// removed" even though both produce the same numbers — the HTTP response
// only surfaces the three bucket numbers (see getOrderSummary).
const computeOrderBuckets = (order, shipments) => {
  const hasRemovedShipment = shipments.some(isRemoved) && shipments.some((s) => !isRemoved(s));

  if (order.paymentMethod === 'cash_on_delivery') {
    // COD's footer never surfaces a "refunded" figure at all — a cancelled
    // or returned COD shipment just disappears from both `paid` and
    // `toPayOnDelivery` (neither 'cancelled'/'returned' is 'delivered' or
    // in ACTIVE_STATUSES); only the (non-numeric) "Original total"
    // strikethrough hints something changed. `refunded` is therefore always
    // 0 for COD orders in this bucket set, by design, matching web exactly.
    const paid = round2(
      shipments.filter((s) => s.status === 'delivered').reduce((sum, s) => sum + shipmentPayable(s), 0)
    );
    const toPayOnDelivery = round2(
      shipments.filter((s) => ACTIVE_STATUSES.includes(s.status)).reduce((sum, s) => sum + shipmentPayable(s), 0)
    );
    return { paid, toPayOnDelivery, refunded: 0, hasRemovedShipment };
  }

  // Prepaid — web shows a plain "Total X" (no bucket at all) unless
  // hasRemovedShipment. `refunded` only ever sums CANCELLED shipments'
  // settlement.refundToCustomer — 'returned' shipments are deliberately
  // excluded here too (that story belongs to the return UI, same reasoning
  // as the COD branch above).
  if (!hasRemovedShipment) {
    return { paid: 0, toPayOnDelivery: 0, refunded: 0, hasRemovedShipment: false };
  }
  const refunded = round2(
    shipments
      .filter((s) => s.status === 'cancelled')
      .reduce((sum, s) => sum + (s.settlement?.refundToCustomer || 0), 0)
  );
  return { paid: 0, toPayOnDelivery: 0, refunded, hasRemovedShipment: true };
};

// Per-shipment figures for the response's `shipments[]` — customerPayable is
// always present (informational), cancelRefundPreview only for shipments
// currently cancel-eligible (same figure, just gated to when CancelPackageModal
// would actually be shown).
const computeShipmentSummaries = (shipments) =>
  shipments.map((s) => ({
    shipmentId: s._id,
    status: s.status,
    customerPayable: shipmentPayable(s),
    cancelRefundPreview: CANCEL_ELIGIBLE_STATUSES.includes(s.status) ? shipmentPayable(s) : null,
  }));

module.exports = {
  shipmentPayable,
  computeOrderBuckets,
  computeShipmentSummaries,
  ACTIVE_STATUSES,
  CANCEL_ELIGIBLE_STATUSES,
};
