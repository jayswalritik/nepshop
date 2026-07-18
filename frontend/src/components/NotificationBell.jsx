import { useState, useRef, useEffect } from 'react';
import { useNotifications, timeAgo } from '../hooks/useNotifications';
import UnreadBadge from './UnreadBadge';

// Bell icon + unread badge + dropdown panel.
//
// `notif` (optional): pass a dashboard's existing useNotifications() instance
// to share its single poller instead of starting a second one. Omit it (the
// customer top-navbar usage) and this component polls on its own — that
// mount is the only one for that dashboard, so a dedicated poller is correct
// there. Never call useNotifications() from a component that also receives
// `notif` — that would defeat the point of sharing it.
//
// `onNavigate(notification)` is called after a single notification is marked
// read — the host dashboard owns its own tab/section keys, so it decides
// what (if anything) to do with notification.type/data. Unknown/absent data
// is the host's decision too; this component's own job stops at mark-read +
// close-panel.
//
// `align="right"` (default) anchors the panel's right edge to the button at
// `sm:` and up — it opens leftward, correct when the bell sits near the
// right edge of the screen. `align="left"` opens rightward instead. Below
// `sm:` alignment doesn't matter: the panel switches to a fixed, viewport-
// pinned strip (left-2/right-2) so it can never clip off either edge
// regardless of where the bell sits in a narrow header.
const NotificationBell = ({ onNavigate, align = 'right', notif }) => {
  if (notif) {
    return <NotificationBellPanel notif={notif} onNavigate={onNavigate} align={align} />;
  }
  return <SelfPollingNotificationBell onNavigate={onNavigate} align={align} />;
};

const SelfPollingNotificationBell = ({ onNavigate, align }) => {
  const notif = useNotifications();
  return <NotificationBellPanel notif={notif} onNavigate={onNavigate} align={align} />;
};

const NotificationBellPanel = ({ notif, onNavigate, align }) => {
  const {
    unreadCount, notifications, hasMore, loadingList, loadingMore, listError,
    fetchList, loadMore, markAllRead, markOneRead,
  } = notif;
  const [open, setOpen] = useState(false);
  // Viewport-relative Y to anchor the fixed mobile panel just below the
  // button; only set (and only used) below `sm:` — see toggleOpen. Left null
  // at sm:+ so the CSS `sm:` classes govern absolute positioning as before.
  const [mobileTop, setMobileTop] = useState(null);
  const rootRef = useRef(null);
  const btnRef = useRef(null);

  // Close on outside click — same pattern as RoleSwitcher / SearchBox.
  useEffect(() => {
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const toggleOpen = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    fetchList();
    if (typeof window !== 'undefined' && window.innerWidth < 640 && btnRef.current) {
      setMobileTop(btnRef.current.getBoundingClientRect().bottom + 8);
    } else {
      setMobileTop(null);
    }
  };

  const handleClickNotification = async (notification) => {
    await markOneRead(notification);
    setOpen(false);
    onNavigate?.(notification);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={btnRef}
        onClick={toggleOpen}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-all"
        title="Notifications"
      >
        <span className="text-xl leading-none">🔔</span>
        <UnreadBadge count={unreadCount} className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1" />
      </button>

      {open && (
        <div
          className={`fixed sm:absolute left-2 right-2 ${align === 'left' ? 'sm:left-0 sm:right-auto' : 'sm:right-0 sm:left-auto'} sm:mt-2 w-auto sm:w-80 sm:max-w-[90vw] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50`}
          style={mobileTop != null ? { top: mobileTop } : undefined}
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Notifications</p>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
            {loadingList && (
              <div className="flex items-center justify-center py-10">
                <div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}

            {!loadingList && listError && (
              <div className="py-8 text-center text-sm text-gray-400">Couldn't load notifications</div>
            )}

            {!loadingList && !listError && notifications.length === 0 && (
              <div className="py-10 text-center text-sm text-gray-400">No notifications yet</div>
            )}

            {!loadingList && !listError && notifications.map((n) => (
              <button
                key={n._id}
                onClick={() => handleClickNotification(n)}
                className={`block w-full text-left px-4 py-3 text-sm transition-all hover:bg-gray-50 ${!n.readAt ? 'bg-indigo-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className={`font-medium ${!n.readAt ? 'text-indigo-900' : 'text-gray-800'}`}>{n.title}</p>
                  {!n.readAt && <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5"></span>}
                </div>
                {n.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>}
                <p className="text-[11px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
              </button>
            ))}
          </div>

          {!loadingList && !listError && hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-2.5 text-xs text-indigo-600 hover:bg-gray-50 font-medium border-t border-gray-100 disabled:opacity-60"
            >
              {loadingMore ? 'Loading...' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
