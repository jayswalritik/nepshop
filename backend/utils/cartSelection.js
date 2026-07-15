// Single source of truth for "is this cart item part of the checkout
// selection" — every consumer (cartController, orderController,
// paymentController) must treat a missing/undefined `selected` (carts
// predating the field) as true, never silently exclude it. Filtering only
// decides WHICH items reach the shared pricing helper
// (backend/utils/orderPricing.js) — it never touches a pricing formula.
const isSelected = (item) => item.selected !== false;

// Whether a cart item's product can no longer be checked out as-is —
// deactivated or insufficient stock for the item's current quantity.
// Deleted products (item.product missing after populate) are NOT "stale" —
// that's a separate, pre-existing case handled by dropping the item entirely.
const isStale = (item) => !!item.product && (!item.product.isActive || item.product.stock < item.quantity);

module.exports = { isSelected, isStale };
