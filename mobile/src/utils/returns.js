import API from './api';

// Same endpoints/payload shapes as web's OrdersPage return flow
// (frontend/src/pages/customer/OrdersPage.jsx's fetchMyReturns/ReturnModal).

// GET /api/returns/my — flat list of the customer's return requests, all
// statuses, each populated with its order/shipment summary fields.
export const getMyReturns = async () => {
  try {
    const { data } = await API.get('/returns/my');
    return { success: true, returns: data.returns };
  } catch (err) {
    return { success: false, returns: [], message: err.data?.message };
  }
};

// POST /api/returns/preview — server-computed refund preview for a
// candidate item/quantity selection, BEFORE submitting. Every Rupee figure
// in the return modal's preview box comes from this response
// (backend/controllers/returnController.js's buildReturnPreview) — nothing
// is computed client-side.
export const previewReturn = async ({ shipmentId, items }) => {
  try {
    const { data } = await API.post('/returns/preview', { shipmentId, items });
    return { success: true, preview: data.preview };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to load refund preview' };
  }
};

// POST /api/returns — submit the return request.
export const requestReturn = async ({ shipmentId, items, reason, description }) => {
  try {
    const { data } = await API.post('/returns', { shipmentId, items, reason, description });
    return { success: true, message: data.message, return: data.return };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to submit return request' };
  }
};
