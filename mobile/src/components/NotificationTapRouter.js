import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { navigateForNotification } from '../utils/notificationRouting';
import { markOneRead } from '../utils/notifications';
import { isExpoGo, getNotifications } from '../utils/push';

// A HOOK, not a component — called from mobile/app/_layout.js's AppShell
// (rendered inside AuthProvider so useAuth() resolves), not rendered as its
// own JSX element. This fixes a Fabric New Architecture crash the previous
// component form caused on role switch in the APK build (IllegalStateException:
// addViewAt / "child already has a parent"): the earlier version was mounted
// as `<Stack /><NotificationTapRouter />` — two siblings where the root
// layout previously rendered `<Stack />` alone. As a hook with zero JSX
// footprint, the render tree is byte-identical to before this file existed:
// AppShell still renders only `<Stack />`. No leftover render-tree risk to
// reason about, regardless of the exact Fabric mechanism.
//
// Routes a tapped push notification exactly like an in-app row tap
// (mobile/src/components/NotificationsScreen.js's handlePressRow) via the
// same navigateForNotification mapping. Mark-read: backend/utils/
// notificationService.js's sendPush now stamps the created Notification
// doc's own _id onto the payload as data.notificationId, so a tapped push
// can mark itself read the same way a row tap does — fire-and-forget (never
// awaited, never blocks navigation; markOneRead already never throws). Older
// payloads (sent before this field existed) simply lack notificationId, so
// this step is skipped and only navigation happens — same behavior as before.
//
// Two listener paths, both funnelling into the same routeFromResponse:
//   - addNotificationResponseReceivedListener: a live tap while the app is
//     already running (foregrounded or backgrounded, not killed).
//   - getLastNotificationResponseAsync: the cold-start case — the OS
//     launched a killed app via a notification tap, so no listener was
//     attached yet when the tap happened; this reads it after the fact.
//
// COLD-START GUARD: same token-gated pattern as mobile/app/(customer)/
// payment/khalti/verify.js — a response arriving before AuthContext has
// restored its token (and therefore before `user.activeRole` is known) is
// held in a ref and replayed once `token` becomes truthy, rather than
// racing the SecureStore restore.
//
// No static `import * as Notifications from 'expo-notifications'` here —
// the package runs a side-effect module at import time (registers a push-
// token listener that unconditionally warns in Expo Go), so merely
// importing it anywhere triggers the crash regardless of any call-site
// guard. mobile/src/utils/push.js's getNotifications() lazy-require is the
// only way this file touches the package, and only inside the
// `!isExpoGo()` branch below.
export default function useNotificationTapRouter() {
  const { token, user } = useAuth();
  const pendingRef = useRef(null);
  const handledRef = useRef(false);
  const tokenRef = useRef(token);
  const userRef = useRef(user);
  tokenRef.current = token;
  userRef.current = user;

  const routeFromResponse = useCallback((response) => {
    const data = response?.notification?.request?.content?.data;
    if (!data) return;
    // Fire-and-forget, same auth-gating as navigation itself — this only
    // ever runs once tokenRef.current is truthy (immediately, or replayed
    // below once the token becomes available), so the PUT carries auth.
    if (data.notificationId) {
      markOneRead(data.notificationId);
    }
    const activeRole = userRef.current?.activeRole || userRef.current?.role;
    navigateForNotification(activeRole, { data });
  }, []);

  // Registration is mount-only by design — this is a one-time app-lifecycle
  // listener setup, not a screen's data refetch, so the "never mount-only
  // useEffect" rule (which targets useFocusEffect-driven screen data) does
  // not apply here.
  //
  // getNotifications() is only called inside this `!isExpoGo()` branch —
  // in Expo Go, expo-notifications' require() line itself is never reached.
  useEffect(() => {
    if (isExpoGo()) {
      console.log('[push] running in Expo Go — skipping tap-listener setup');
      return undefined;
    }

    const Notifications = getNotifications();

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (tokenRef.current) {
        routeFromResponse(response);
      } else {
        pendingRef.current = response;
      }
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response || handledRef.current) return;
      if (tokenRef.current) {
        handledRef.current = true;
        routeFromResponse(response);
      } else {
        pendingRef.current = response;
      }
    });

    return () => sub.remove();
  }, [routeFromResponse]);

  // Fires any pending (pre-auth) response once the token becomes available.
  useEffect(() => {
    if (token && pendingRef.current && !handledRef.current) {
      handledRef.current = true;
      routeFromResponse(pendingRef.current);
      pendingRef.current = null;
    }
  }, [token, routeFromResponse]);
}
