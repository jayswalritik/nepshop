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

// Same GET /api/orders/my endpoint and query params as web's OrdersPage
// (frontend/src/pages/customer/OrdersPage.jsx fetchOrders) — status filter
// optional, limit fixed at 20 to match web. Response's `orders[].shipments`
// already carries every per-package money field (sellerSubtotal,
// deliveryCharge, couponAllocation, settlement) as-is from the DB — nothing
// here recomputes any of it.
export const getMyOrders = async (status) => {
  try {
    const params = new URLSearchParams({ limit: 20 });
    if (status) params.append('status', status);
    const { data } = await API.get(`/orders/my?${params}`);
    return { success: true, orders: data.orders };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to load orders' };
  }
};

// Same GET /api/orders/:id endpoint as web's order detail — customer view
// returns { order, shipments } (backend/controllers/orderController.js's
// getOrderById).
export const getOrderById = async (orderId) => {
  try {
    const { data } = await API.get(`/orders/${orderId}`);
    return { success: true, order: data.order, shipments: data.shipments };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to load order' };
  }
};

// Same PUT /api/orders/:id/cancel endpoint as web's handleCancel — cancels
// every still-cancellable (pending/confirmed) shipment on the whole order.
export const cancelOrder = async (orderId) => {
  try {
    await API.put(`/orders/${orderId}/cancel`);
    return { success: true };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to cancel order' };
  }
};

// Same PUT /api/orders/shipments/:shipmentId/cancel endpoint as web's
// handleCancelShipment — cancels one seller's package within an order.
export const cancelShipment = async (shipmentId) => {
  try {
    const { data } = await API.put(`/orders/shipments/${shipmentId}/cancel`);
    return { success: true, message: data.message, shipment: data.shipment, order: data.order };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to cancel package' };
  }
};

// GET /api/orders/:id/summary — server-computed Paid / To-pay-on-delivery /
// Refunded buckets plus per-shipment customerPayable/cancelRefundPreview
// (backend/controllers/orderController.js's getOrderSummary, delegating to
// backend/utils/orderSummary.js). Every figure here reproduces EXACTLY what
// frontend/src/pages/customer/OrdersPage.jsx computes client-side — nothing
// is computed on the mobile side.
export const getOrderSummary = async (orderId) => {
  try {
    const { data } = await API.get(`/orders/${orderId}/summary`);
    return { success: true, orderId: data.orderId, buckets: data.buckets, shipments: data.shipments };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to load order summary' };
  }
};
