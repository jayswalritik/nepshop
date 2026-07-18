import { useState, useEffect, useCallback } from 'react';
import API from '../utils/api';

const POLL_MS = 45000;

// Small, dependency-free "5m ago" helper.
export const timeAgo = (dateStr) => {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(dateStr).toLocaleDateString('en-NP', { day: 'numeric', month: 'short' });
};

// Shared notifications data/actions — unread-count polling (45s + refetch on
// window focus), paginated list, mark-all-read, mark-one-read. One call site
// of this hook = one poller: NotificationBell owns its own single call
// (customer's only mount); the seller/delivery/admin dashboards call it ONCE
// at the dashboard level and pass the pieces down to their nav-tab badge,
// mobile header bell, and NotificationsPage — never call this hook a second
// time per dashboard, or the 45s poll duplicates.
export const useNotifications = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState(false);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const { data } = await API.get('/notifications/unread-count');
      setUnreadCount(data.count);
    } catch {
      // Silent — badge just keeps its last known value, no crash, no toast.
    }
  }, []);

  // Initial fetch + 45s poll + refetch on window focus. Cleaned up on
  // unmount (which happens on logout too, since the call site only renders
  // inside a protected dashboard that unmounts when ProtectedRoute redirects away).
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, POLL_MS);
    window.addEventListener('focus', fetchUnreadCount);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', fetchUnreadCount);
    };
  }, [fetchUnreadCount]);

  const fetchPage = async (pageNum) => {
    const { data } = await API.get('/notifications', { params: { page: pageNum } });
    return data;
  };

  const fetchList = useCallback(async () => {
    setLoadingList(true);
    setListError(false);
    try {
      const data = await fetchPage(1);
      setNotifications(data.notifications);
      setPage(1);
      setHasMore(data.hasMore);
    } catch {
      setListError(true);
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const data = await fetchPage(page + 1);
      setNotifications((prev) => [...prev, ...data.notifications]);
      setPage(page + 1);
      setHasMore(data.hasMore);
    } catch {
      // Silent — user can retry via the same button.
    } finally {
      setLoadingMore(false);
    }
  }, [page]);

  const markAllRead = useCallback(async () => {
    try {
      await API.put('/notifications/read-all');
      setUnreadCount(0);
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || now })));
    } catch {
      // Silent — badge/rows just stay as they were, user can retry.
    }
  }, []);

  const markOneRead = useCallback(async (notification) => {
    const wasUnread = !notification.readAt;
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n._id === notification._id ? { ...n, readAt: n.readAt || now } : n)));
    if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await API.put(`/notifications/${notification._id}/read`);
    } catch {
      // Silent — the read-state may not have persisted server-side, but we
      // don't crash or block navigation over it.
    }
  }, []);

  return {
    unreadCount,
    fetchUnreadCount,
    notifications,
    hasMore,
    loadingList,
    loadingMore,
    listError,
    fetchList,
    loadMore,
    markAllRead,
    markOneRead,
  };
};
