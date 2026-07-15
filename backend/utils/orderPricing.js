// Shared per-seller-group pricing helper — the ONLY place that computes
// shipment groups + their money split. Used by orderController.placeOrder,
// paymentController (createOrderFromCart AND payment initiation), so the
// three call sites can never drift from each other.

const FREE_DELIVERY_THRESHOLD = 2000; // per seller-group subtotal
const FLAT_DELIVERY_CHARGE    = 100;  // per seller-group
const DEFAULT_COMMISSION_RATE = 5;    // percent
const DEFAULT_DELIVERY_EARNING = 50;  // Rs, flat per shipment

const round2 = (n) => +Number(n).toFixed(2);

// items: array of { price, quantity, seller, ... } (order/shipment item shape).
// Returns per-seller groups plus order-level sums (subtotal/deliveryCharge/commissionAmount).
// Group order is insertion order (first-seen seller in the cart/order items).
const groupItemsBySeller = (items, commissionRate = DEFAULT_COMMISSION_RATE) => {
  const bySeller = new Map();

  for (const item of items) {
    const sellerId = item.seller.toString();
    if (!bySeller.has(sellerId)) bySeller.set(sellerId, []);
    bySeller.get(sellerId).push(item);
  }

  const groups = [];
  let subtotal = 0;
  let deliveryCharge = 0;
  let commissionAmount = 0;

  for (const [sellerId, groupItems] of bySeller) {
    const sellerSubtotal = round2(
      groupItems.reduce((sum, i) => sum + i.price * i.quantity, 0)
    );
    const groupDeliveryCharge = sellerSubtotal >= FREE_DELIVERY_THRESHOLD ? 0 : FLAT_DELIVERY_CHARGE;
    const groupCommission     = round2(sellerSubtotal * commissionRate / 100);

    groups.push({
      seller:           sellerId,
      items:            groupItems,
      sellerSubtotal,
      deliveryCharge:   groupDeliveryCharge,
      commissionRate,
      commissionAmount: groupCommission,
      deliveryEarning:  DEFAULT_DELIVERY_EARNING,
    });

    subtotal         += sellerSubtotal;
    deliveryCharge   += groupDeliveryCharge;
    commissionAmount += groupCommission;
  }

  return {
    groups,
    subtotal:         round2(subtotal),
    deliveryCharge:   round2(deliveryCharge),
    commissionAmount: round2(commissionAmount),
  };
};

// Allocates a coupon discount across ALL of an order's items, proportional
// to each item's line value (price * quantity). MUTATES each item in place
// (sets `.couponAllocation`) rather than returning copies, so this works
// whether it's called on the flat order-items array or on references
// already partitioned into groupItemsBySeller's per-seller groups — same
// objects, so either view sees the result. Call this AFTER
// groupItemsBySeller + coupon validation (the discount amount depends on
// the subtotal groupItemsBySeller produces, so it can't be folded into that
// same call — see orderController.js/paymentController.js for the call
// order both creation paths use).
//
// Rounding is done at PER-UNIT granularity (each unit of a line's quantity
// gets its own independently-rounded fair share) so a qty-N line allocates
// identically to N separate qty-1 lines of the same unit price would — then
// units are summed back into their line for storage (couponAllocation is
// PER-LINE, not per-unit — see Order.js/Shipment.js item schema comments).
// The very last unit absorbs the total rounding remainder, so allocations
// across ALL items always sum EXACTLY to discountAmount.
const allocateCouponDiscount = (items, discountAmount) => {
  if (!discountAmount || discountAmount <= 0) {
    items.forEach(i => { i.couponAllocation = 0; });
    return items;
  }

  const grandTotal = round2(items.reduce((sum, i) => sum + i.price * i.quantity, 0));
  if (grandTotal <= 0) {
    items.forEach(i => { i.couponAllocation = 0; });
    return items;
  }

  // Flatten to one weight entry per UNIT, not per line.
  const units = [];
  items.forEach((item, itemIndex) => {
    for (let u = 0; u < item.quantity; u++) units.push({ itemIndex, price: item.price });
  });

  const unitAllocations = units.map(u => round2((u.price / grandTotal) * discountAmount));
  const allocatedSum = round2(unitAllocations.reduce((s, a) => s + a, 0));
  const remainder = round2(discountAmount - allocatedSum);
  unitAllocations[unitAllocations.length - 1] = round2(unitAllocations[unitAllocations.length - 1] + remainder);

  items.forEach(i => { i.couponAllocation = 0; });
  units.forEach((u, i) => {
    items[u.itemIndex].couponAllocation = round2((items[u.itemIndex].couponAllocation || 0) + unitAllocations[i]);
  });

  return items;
};

module.exports = {
  groupItemsBySeller,
  allocateCouponDiscount,
  round2,
  FREE_DELIVERY_THRESHOLD,
  FLAT_DELIVERY_CHARGE,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_DELIVERY_EARNING,
};
