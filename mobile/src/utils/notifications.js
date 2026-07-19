import API from './api';

// In-app notifications — mirrors frontend/src/hooks/useNotifications.js's
// contract exactly (same endpoints, same response shapes). Nothing here
// computes a Rupee figure; every notification's `body`/`data` is whatever
// backend/utils/notificationService.js already built.

// GET /api/notifications?page= — newest first, backend/controllers/
// notificationController.js's getMyNotifications (limit fixed server-side
// at 20/page, hasMore flag included).
export const getNotifications = async (page = 1) => {
  try {
    const { data } = await API.get(`/notifications?page=${page}`);
    return { success: true, notifications: data.notifications, page: data.page, hasMore: data.hasMore };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to load notifications' };
  }
};

// GET /api/notifications/unread-count
export const getUnreadCount = async () => {
  try {
    const { data } = await API.get('/notifications/unread-count');
    return { success: true, count: data.count };
  } catch (err) {
    return { success: false, count: 0, message: err.data?.message || 'Failed to load unread count' };
  }
};

// PUT /api/notifications/read-all
export const markAllRead = async () => {
  try {
    await API.put('/notifications/read-all');
    return { success: true };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to mark all read' };
  }
};

// PUT /api/notifications/:id/read
export const markOneRead = async (id) => {
  try {
    const { data } = await API.put(`/notifications/${id}/read`);
    return { success: true, notification: data.notification };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to mark read' };
  }
};

// PUT /api/notifications/push-token — token is a string (register) or null
// (clear, called on logout before the auth token itself is cleared).
export const setPushToken = async (token) => {
  try {
    await API.put('/notifications/push-token', { token });
    return { success: true };
  } catch (err) {
    return { success: false, message: err.data?.message || 'Failed to update push token' };
  }
};
