import API from './api';

// Same cart endpoints and { success, message } contract as web's
// CartContext (frontend/src/context/CartContext.jsx) — mobile has no cart
// context/global state yet, so screens call these directly and each manage
// their own toast/feedback.

export const addToCart = async (productId, quantity = 1) => {
  try {
    const { data } = await API.post('/cart', { productId, quantity });
    return { success: true, cart: data.cart };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to add to cart' };
  }
};

export const updateCartQuantity = async (productId, quantity) => {
  try {
    const { data } = await API.put(`/cart/${productId}`, { quantity });
    return { success: true, cart: data.cart };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to update quantity' };
  }
};

// itemIds may be cart-item _ids or product ids (matches backend/controllers/
// cartController.js's updateSelection) — covers single-item, seller-group,
// and select-all toggles with one call, same as web's updateSelection.
export const updateCartSelection = async (itemIds, selected) => {
  try {
    const { data } = await API.patch('/cart/selection', { itemIds, selected });
    return { success: true, cart: data.cart };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to update selection' };
  }
};

export const removeCartItem = async (productId) => {
  try {
    const { data } = await API.delete(`/cart/${productId}`);
    return { success: true, cart: data.cart };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to remove item' };
  }
};

export const clearCart = async () => {
  try {
    const { data } = await API.delete('/cart');
    return { success: true, cart: data.cart };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to clear cart' };
  }
};

// Checkout preview — GET /api/cart/summary?coupon=CODE. Delegates every
// money figure (per-package delivery, coupon allocation, grand total) to
// the backend; nothing is computed here. couponCode is optional.
export const getCartSummary = async (couponCode) => {
  try {
    const path = couponCode
      ? `/cart/summary?coupon=${encodeURIComponent(couponCode)}`
      : '/cart/summary';
    const { data } = await API.get(path);
    return { success: true, summary: data.summary };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to load checkout summary' };
  }
};
