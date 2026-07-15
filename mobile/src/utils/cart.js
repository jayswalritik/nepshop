import API from './api';

// Same POST /cart endpoint and { success, message } contract as web's
// CartContext.addToCart (frontend/src/context/CartContext.jsx) — mobile has
// no cart context/global state yet, so screens call this directly and each
// manage their own toast/feedback.
export const addToCart = async (productId, quantity = 1) => {
  try {
    const { data } = await API.post('/cart', { productId, quantity });
    return { success: true, cart: data.cart };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to add to cart' };
  }
};
