import API from './api';

// Delivery-agent role endpoints — mirrors frontend/src/pages/delivery/
// Dashboard.jsx and ReturnPickups.jsx exactly. Every shipment/return object
// returned here carries whatever money fields the backend controller put on
// it (customerPayable, packageValue, deliveryEarning, returnAgentEarning,
// deliveryEarnings, returnEarnings, etc.) as-is — nothing in this file
// computes, sums, or reduces any of them.

// GET /api/delivery/orders — backend/controllers/deliveryController.js's
// getDeliveryOrders. shipments[] already carries per-shipment
// customerPayable (voucher-aware COD collect amount) and packageValue
// (sellerSubtotal + deliveryCharge) computed server-side; deliveryEarnings/
// deliveredCount are pre-aggregated server-side too.
export const getDeliveryOrders = async () => {
  try {
    const { data } = await API.get('/delivery/orders');
    return {
      success: true,
      shipments: data.shipments,
      returnEarnings: data.returnEarnings || 0,
      returnPickupCount: data.returnPickupCount || 0,
      deliveryEarnings: data.deliveryEarnings || 0,
      deliveredCount: data.deliveredCount || 0,
    };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to load deliveries' };
  }
};

// PUT /api/delivery/orders/:id/delivered (:id = shipmentId) — marks a
// dispatched shipment delivered. Backend enforces status transition + agent
// ownership; nothing re-validated client-side.
export const markDelivered = async (shipmentId) => {
  try {
    const { data } = await API.put(`/delivery/orders/${shipmentId}/delivered`);
    return { success: true, message: data.message, shipment: data.shipment, order: data.order };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to update status' };
  }
};

// PUT /api/delivery/availability — self-toggle only, UI/sorting signal per
// backend/models/User.js, never gates assignment/deliveries/settlements.
export const updateAvailability = async (isAvailable) => {
  try {
    const { data } = await API.put('/delivery/availability', { isAvailable });
    return { success: true, isAvailable: data.isAvailable, message: data.message };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to update availability' };
  }
};

// GET /api/returns/pickups — backend/controllers/returnController.js's
// getMyReturnPickups. Returns assigned to this agent with status
// approved|picked_up only (Option A: push-assigned, no browse/claim).
export const getMyReturnPickups = async () => {
  try {
    const { data } = await API.get('/returns/pickups');
    return { success: true, returns: data.returns };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to load return pickups' };
  }
};

// PUT /api/returns/:id/pickup — agent collected the item from the customer.
export const markReturnPickedUp = async (returnId) => {
  try {
    const { data } = await API.put(`/returns/${returnId}/pickup`);
    return { success: true, message: data.message, return: data.return };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to mark pickup' };
  }
};

// PUT /api/returns/:id/complete — agent delivered the item back to the
// seller; backend fires the refund/settlement reversal. `message` embeds the
// refund + agent-earning summary (e.g. "Return completed. Customer refunded
// Rs 139.47. Agent earned Rs 50.") — same string web shows via `alert()`.
export const completeReturn = async (returnId) => {
  try {
    const { data } = await API.put(`/returns/${returnId}/complete`);
    return { success: true, message: data.message, return: data.return };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to complete return' };
  }
};
