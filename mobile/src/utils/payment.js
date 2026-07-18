import API from './api';

// Same POST /payment/khalti/initiate and /payment/esewa/initiate endpoints
// web's checkout uses (frontend/src/pages/customer/CartPage.jsx
// handlePlaceOrder) — source:'mobile' selects the nepshop:// deep-link
// entries in the backend's return-URL allowlist (backend/controllers/
// paymentController.js's RETURN_URLS) instead of web's https://FRONTEND_URL
// ones. Mobile never constructs a URL itself — the backend is the only
// thing that ever produces a return URL, matching the "client can never
// supply a URL" contract exactly.
export const initiateKhalti = async ({ deliveryAddress, customerNote, couponCode }) => {
  try {
    const { data } = await API.post('/payment/khalti/initiate', {
      deliveryAddress, customerNote, couponCode: couponCode || null, source: 'mobile',
    });
    return { success: true, paymentUrl: data.paymentUrl, pidx: data.pidx };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to start Khalti payment' };
  }
};

// formUrl (added alongside gatewayUrl/formData/transactionUuid) is what
// mobile actually opens — GET /api/payment/esewa/form/:transactionUuid,
// which server-renders + auto-submits the same signed form web builds as a
// DOM <form>. gatewayUrl/formData are kept for parity with web's response
// shape but mobile has no way to perform the form POST itself (see
// checkout.js's comment on openAuthSessionAsync's GET-only limitation).
export const initiateEsewa = async ({ deliveryAddress, customerNote, couponCode }) => {
  try {
    const { data } = await API.post('/payment/esewa/initiate', {
      deliveryAddress, customerNote, couponCode: couponCode || null, source: 'mobile',
    });
    return {
      success: true,
      gatewayUrl: data.gatewayUrl,
      formData: data.formData,
      formUrl: data.formUrl,
      transactionUuid: data.transactionUuid,
    };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to start eSewa payment' };
  }
};

// Same POST /payment/khalti/verify / /payment/esewa/verify endpoints as
// web's KhaltiVerify.jsx/EsewaVerify.jsx post-PendingPayment-refactor — body
// is gateway-specific (pidx vs data) and mobile never sends orderData, same
// as web.
export const verifyKhalti = async (pidx) => {
  try {
    const { data } = await API.post('/payment/khalti/verify', { pidx });
    return { success: true, message: data.message, order: data.order };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Payment verification failed.' };
  }
};

export const verifyEsewa = async (data) => {
  try {
    const { data: resData } = await API.post('/payment/esewa/verify', { data });
    return { success: true, message: resData.message, order: resData.order };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Payment verification failed.' };
  }
};
