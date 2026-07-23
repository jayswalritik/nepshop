// ─────────────────────────────────────────────────────────────────────────────
// cartSummary.js — the checkout-preview summary builder, extracted VERBATIM
// from cartController.getCartSummary so the HTTP handler and any service can
// share ONE implementation.
// ─────────────────────────────────────────────────────────────────────────────
// No req / res / Express here: it loads the Cart itself and does the coupon
// lookup itself. All money math still delegates to the shared helpers
// (utils/orderPricing.js) — groupItemsBySeller for per-seller packages/
// delivery, allocateCouponDiscount for the per-line coupon split, and the same
// round2(subtotal + deliveryCharge - couponDiscount) total formula. Nothing
// here computes a pricing formula of its own; the logic was MOVED, not
// rewritten.
//
// The coupon check uses coupon.validateFor — the SAME instance method
// POST /coupons/validate calls — NOT Coupon.redeemFor (which order creation
// uses and which CONSUMES usage limits); a preview must never consume.
// ─────────────────────────────────────────────────────────────────────────────

const Cart = require('../models/Cart');
const { isSelected, isStale } = require('./cartSelection');
const { groupItemsBySeller, allocateCouponDiscount, round2 } = require('./orderPricing');

// Same nested populate getCartSummary used to load each item's product +
// seller shop name (mirrors cartController.PRODUCT_POPULATE).
const PRODUCT_POPULATE = {
  path: 'items.product',
  select: 'name images price stock isActive seller',
  populate: { path: 'seller', select: 'shopName firstName lastName' },
};

// The exact empty-cart shape getCartSummary returns (same keys, same order).
const emptySummary = () => ({
  packages: [],
  itemsSubtotal: 0,
  totalDelivery: 0,
  totalDiscount: 0,
  grandTotal: 0,
  coupon: null,
});

// Why an item is stale — derived from EXACTLY what cartSelection.isStale tests
// (product inactive, or stock below the requested quantity). Inventory/text
// only; no money.
const staleReasonFor = (item) => {
  const p = item.product;
  if (!p || !p.isActive) return 'no longer available';
  if (p.stock <= 0)      return 'out of stock';
  return `only ${p.stock} left (you asked for ${item.quantity})`;
};

// The two excluded groups the CHATBOT shows (never the HTTP summary). Partition
// of product-bearing items that did NOT make it into checkout:
//   stale       — product && isStale (the reason it can't be bought)
//   notSelected — product && !isSelected && !isStale (just not ticked)
// Items with no product (deleted) are dropped, exactly as the summary already
// drops them. No money — name/qty/unit-price only (+ reason for stale).
const excludedGroups = (items) => {
  const notSelectedItems = [];
  const staleItems = [];
  for (const item of items || []) {
    if (!item.product) continue;
    if (isStale(item)) {
      staleItems.push({ name: item.product.name, quantity: item.quantity, price: item.price, staleReason: staleReasonFor(item) });
    } else if (!isSelected(item)) {
      notSelectedItems.push({ name: item.product.name, quantity: item.quantity, price: item.price });
    }
  }
  return { notSelectedItems, staleItems };
};

// buildCartSummary({ userId, couponCode, includeExcluded }) -> summary object.
// `couponCode` is the raw preview code (may be undefined) — same truthiness
// gate the handler applied to req.query.coupon.
// `includeExcluded` (default false) is CHATBOT-ONLY: when true, the returned
// object ALSO carries `notSelectedItems` and `staleItems`. The getCartSummary
// HTTP handler never passes it, so those keys never appear in the `summary`
// response — existing web/mobile cart screens are byte-for-byte unaffected.
const buildCartSummary = async ({ userId, couponCode, includeExcluded = false }) => {
  const cart = await Cart.findOne({ customer: userId }).populate(PRODUCT_POPULATE);

  // Attach the excluded groups only when a caller asked for them.
  const withExcluded = (core, items) =>
    includeExcluded ? { ...core, ...excludedGroups(items) } : core;

  if (!cart || cart.items.length === 0) {
    return withExcluded(emptySummary(), cart ? cart.items : []);
  }

  // Same eligibility as checkout itself would apply: selected AND not stale
  // (isSelected/isStale — utils/cartSelection.js), product present.
  const eligibleItems = cart.items.filter(
    (item) => item.product && isSelected(item) && !isStale(item)
  );
  if (eligibleItems.length === 0) {
    // No checkout money, but the excluded groups may still hold items to show.
    return withExcluded(emptySummary(), cart.items);
  }

  const orderItems = eligibleItems.map((item) => ({
    product: item.product._id,
    name:    item.product.name,
    image:   item.product.images?.[0]?.url || '',
    price:   item.price,
    quantity: item.quantity,
    seller:  item.product.seller?._id || item.product.seller,
    sellerName:
      item.product.seller?.shopName ||
      `${item.product.seller?.firstName || ''} ${item.product.seller?.lastName || ''}`.trim() ||
      'Seller',
  }));

  const { groups, subtotal, deliveryCharge } = groupItemsBySeller(orderItems);

  // ── Coupon preview — never consumes usage limits ────────────────────
  let couponResult = null;
  let couponDiscount = 0;
  if (couponCode) {
    const Coupon = require('../models/Coupon');
    const code = String(couponCode).toUpperCase().trim();
    const coupon = await Coupon.findOne({ code });

    if (!coupon) {
      // Same message POST /coupons/validate returns for an unknown code.
      couponResult = { code, valid: false, message: 'Invalid coupon code', discount: 0 };
    } else {
      const result = coupon.validateFor(subtotal, userId);
      couponResult = {
        code: coupon.code,
        valid: result.valid,
        message: result.valid ? 'Coupon applied successfully' : result.message,
        discount: result.valid ? result.discount : 0,
      };
      if (result.valid) couponDiscount = result.discount;
    }
  }

  // Mutates orderItems (and, via reference, groups[].items) with
  // .couponAllocation — same call placeOrder makes; a no-op when
  // couponDiscount is 0 (no coupon, or an invalid one).
  allocateCouponDiscount(orderItems, couponDiscount);

  const packages = groups.map((g) => ({
    seller:     g.seller,
    sellerName: g.items[0]?.sellerName || 'Seller',
    items: g.items.map((i) => ({
      product:  i.product,
      name:     i.name,
      image:    i.image,
      price:    i.price,
      quantity: i.quantity,
      couponAllocation: i.couponAllocation || 0,
    })),
    packageSubtotal:  g.sellerSubtotal,
    deliveryCharge:   g.deliveryCharge,
    couponAllocation: round2(g.items.reduce((s, i) => s + (i.couponAllocation || 0), 0)),
  }));

  const grandTotal = round2(subtotal + deliveryCharge - couponDiscount);

  return withExcluded({
    packages,
    itemsSubtotal: subtotal,
    totalDelivery: deliveryCharge,
    totalDiscount: round2(couponDiscount),
    grandTotal,
    coupon: couponResult,
  }, cart.items);
};

module.exports = { buildCartSummary };
