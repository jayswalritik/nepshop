import API from './api';

// Same GET /api/coupons/available endpoint web's CheckoutPage calls
// (frontend/src/pages/customer/CartPage.jsx) — public, active, unexpired,
// not-yet-exhausted coupons a customer can tap to apply at checkout.
export const getAvailableCoupons = async () => {
  try {
    const { data } = await API.get('/coupons/available');
    return { success: true, coupons: data.coupons || [] };
  } catch (err) {
    return { success: false, coupons: [], message: err.data?.message };
  }
};
