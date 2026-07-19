import { router } from 'expo-router';

// Shared by the notifications screen's in-app row tap (mobile/src/
// components/NotificationsScreen.js) and the push tap-to-open handler
// (mobile/src/components/NotificationTapRouter.js) — one mapping definition
// so both stay identical by construction, matching backend/utils/
// notificationService.js's data shapes exactly (data.orderId/returnId/
// couponCode/productId — same fields frontend/src/pages/*/Dashboard.jsx's
// handleNotificationNavigate functions switch on). Unknown/absent data:
// no navigation, same as web's "no-op" fallthrough.
export const navigateForNotification = (activeRole, notification) => {
  const data = notification?.data || {};

  if (activeRole === 'delivery') {
    // Checked first: PAYOUT_PROCESSED/EARNINGS_RELEASED carry no orderId/
    // returnId, so the data-field rules below would never match them — this
    // type rule is what actually routes them anywhere. Matches web's
    // delivery Dashboard.jsx handleNotificationNavigate.
    if (notification?.type === 'PAYOUT_PROCESSED' || notification?.type === 'EARNINGS_RELEASED') {
      router.push('/(delivery)/earnings');
      return;
    }
    if (data.returnId) { router.push('/(delivery)/returns'); return; }
    if (data.orderId) { router.push('/(delivery)/deliveries'); return; }
    return;
  }

  // customer (default/fallback role — matches roleNavConfig.js's
  // customer-first convention elsewhere in this app)
  if (data.orderId || data.returnId) { router.push('/(customer)/orders'); return; }
  if (notification?.type === 'COUPON_PUBLISHED' || data.couponCode) { router.push('/(customer)/offers'); return; }
  if (data.productId) { router.push(`/(customer)/product/${data.productId}`); return; }
};
