import { useEffect } from 'react';
import { timeAgo } from '../hooks/useNotifications';

// Full-content notifications page — seller/delivery/admin's "Notifications"
// nav tab. Deliberately stateless for fetching: every piece (list, paging,
// actions) is passed down from the single useNotifications() instance the
// host dashboard already owns, so this component never starts its own
// unread-count poller. On mount (= the tab becoming active), it refetches
// both the list and the unread count once, matching the focus-refetch
// discipline the dropdown bell already follows.
const NotificationsPage = ({
  unreadCount,
  notifications,
  hasMore,
  loadingList,
  loadingMore,
  listError,
  fetchList,
  fetchUnreadCount,
  loadMore,
  markAllRead,
  markOneRead,
  onNavigate,
}) => {
  useEffect(() => {
    fetchList();
    fetchUnreadCount();
  }, [fetchList, fetchUnreadCount]);

  const handleClick = async (n) => {
    await markOneRead(n);
    onNavigate?.(n);
  };

  return (
    <div>
      {unreadCount > 0 && (
        <div className="flex items-center justify-end mb-4">
          <button
            onClick={markAllRead}
            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Mark all read
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loadingList ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : listError ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">⚠️</div>
            <p className="text-gray-500 text-sm">Couldn't load notifications</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🔔</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No notifications yet</h3>
            <p className="text-gray-500 text-sm">Updates about your orders, returns, and payouts will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map((n) => (
              <button
                key={n._id}
                onClick={() => handleClick(n)}
                className={`w-full text-left px-5 py-4 transition-colors hover:bg-gray-50 ${!n.readAt ? 'bg-indigo-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className={`text-sm font-medium ${!n.readAt ? 'text-indigo-900' : 'text-gray-900'}`}>{n.title}</p>
                  {!n.readAt && <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5"></span>}
                </div>
                {n.body && <p className="text-sm text-gray-500 mt-1">{n.body}</p>}
                <p className="text-xs text-gray-400 mt-1.5">{timeAgo(n.createdAt)}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {!loadingList && !listError && hasMore && (
        <div className="flex justify-center mt-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium px-4 py-2 rounded-lg border border-gray-200 hover:border-gray-300 disabled:opacity-60 transition-all"
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
