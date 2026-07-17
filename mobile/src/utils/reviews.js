import API from './api';

// Same POST /api/reviews endpoint and payload shape as web's ReviewModal
// (frontend/src/pages/customer/OrdersPage.jsx) — { productId, orderId,
// rating, comment }. All eligibility (delivered-shipment check, one review
// per product per order, product/order ownership) is enforced server-side
// in backend/controllers/reviewController.js's addReview; this just relays
// whatever message the API returns (success or the rejection reason) the
// same way web's ReviewModal does with err.response?.data?.message.
export const submitReview = async ({ productId, orderId, rating, comment }) => {
  try {
    const { data } = await API.post('/reviews', { productId, orderId, rating, comment });
    return { success: true, review: data.review };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to submit review' };
  }
};
