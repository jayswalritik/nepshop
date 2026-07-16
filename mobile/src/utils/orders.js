import API from './api';

// Same POST /api/orders endpoint and payload shape as web's CheckoutPage
// (frontend/src/pages/customer/CartPage.jsx handlePlaceOrder, COD branch)
// — { deliveryAddress, paymentMethod, customerNote, couponCode }. Only COD
// is wired up here; Khalti/eSewa are a separate gateway task.
export const placeOrder = async ({ deliveryAddress, customerNote, couponCode }) => {
  try {
    const { data } = await API.post('/orders', {
      deliveryAddress,
      paymentMethod: 'cash_on_delivery',
      customerNote,
      couponCode: couponCode || null,
    });
    return { success: true, order: data.order };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to place order' };
  }
};
