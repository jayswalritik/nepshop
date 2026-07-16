import API from './api';

// Same endpoints frontend/src/context/WishlistContext.jsx calls directly —
// wrapped here only to match this app's existing utils/*.js convention
// (cart.js, orders.js, returns.js), same {success, ...} return shape.

export const getWishlist = async () => {
  try {
    const { data } = await API.get('/wishlist');
    return { success: true, wishlist: data.wishlist };
  } catch (err) {
    return { success: false, wishlist: [], message: err.data?.message };
  }
};

export const addToWishlist = async (productId) => {
  try {
    await API.post(`/wishlist/${productId}`);
    return { success: true };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to add to wishlist' };
  }
};

export const removeFromWishlist = async (productId) => {
  try {
    await API.delete(`/wishlist/${productId}`);
    return { success: true };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to remove from wishlist' };
  }
};
