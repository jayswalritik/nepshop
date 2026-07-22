import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getNotifications, getUnreadCount, markAllRead, markOneRead } from '../utils/notifications';
import { navigateForNotification } from '../utils/notificationRouting';
import { timeAgo } from '../utils/format';
import ScreenHeader from './ScreenHeader';
import AppHero from './AppHero';
import { COLORS, RADII, SHADOWS, SPACING } from '../constants/colors';

// Category glyph per notification type. Reuses the EXACT `type` values
// navigateForNotification (mobile/src/utils/notificationRouting.js) switches
// on — PAYOUT_PROCESSED / EARNINGS_RELEASED (delivery) and COUPON_PUBLISHED
// (customer). Every other or absent type (order & return updates route by
// data.* there, not by type) falls back to the neutral bell so nothing renders
// blank. The icon COLOUR is decided at the call site from read state, not here,
// so unread rows read as primary and read rows as muted.
const iconForType = (type) => {
  switch (type) {
    case 'PAYOUT_PROCESSED':
      return 'cash-outline';
    case 'EARNINGS_RELEASED':
      return 'wallet-outline';
    case 'COUPON_PUBLISHED':
      return 'pricetag-outline';
    default:
      return 'notifications-outline';
  }
};

// Shared by both customer and delivery — reached via each role's own
// "notifications" hidden route (mobile/src/navigation/roleNavConfig.js),
// pushed from AccountScreen's header bell. Mirrors frontend/src/components/
// NotificationsPage.jsx's contract (list newest-first, mark-all-read,
// load-more via hasMore) with the row-tap behavior of frontend's
// NotificationBell.jsx dropdown (mark read, then navigate per role).
//
// Screen stays mounted across tab switches (expo-router's Tabs registers
// hidden routes the same way as visible tabs) — useFocusEffect refetches
// every time it regains focus, never a mount-only effect, same rule every
// other list screen in this app follows (deliveries.js, orders.js, etc.).
export default function NotificationsScreen() {
  const { user } = useAuth();
  const activeRole = user?.activeRole || user?.role;

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  // Distinguishes "load failed" from "genuinely empty": the error view only
  // takes over when nothing is on screen yet. A pull-refresh that fails on top
  // of existing content keeps the list (quiet failure, prior behavior).
  const hasDataRef = useRef(false);

  const fetchFirstPage = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const result = await getNotifications(1);
    if (result.success) {
      setNotifications(result.notifications);
      setPage(1);
      setHasMore(result.hasMore);
      setError(false);
      hasDataRef.current = result.notifications.length > 0;
    } else if (!hasDataRef.current) {
      // Nothing already shown → surface the error view. If we DO have content,
      // leave the list untouched and fail quietly.
      setError(true);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  const refetchUnreadCount = useCallback(async () => {
    const result = await getUnreadCount();
    if (result.success) setUnreadCount(result.count);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchFirstPage(false);
      refetchUnreadCount();
    }, [fetchFirstPage, refetchUnreadCount])
  );

  const handleRefresh = () => fetchFirstPage(true);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    const result = await getNotifications(page + 1);
    if (result.success) {
      setNotifications((prev) => [...prev, ...result.notifications]);
      setPage(page + 1);
      setHasMore(result.hasMore);
    }
    setLoadingMore(false);
  };

  const handleMarkAllRead = async () => {
    const result = await markAllRead();
    if (result.success) {
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || now })));
      setUnreadCount(0);
    } else {
      Alert.alert("Couldn't mark all as read", 'Please try again.');
    }
  };

  const handlePressRow = async (notification) => {
    if (!notification.readAt) {
      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) => (n._id === notification._id ? { ...n, readAt: now } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      await markOneRead(notification._id);
    }
    navigateForNotification(activeRole, notification);
  };

  // Customer gets the shared indigo AppHero (bleeds behind the status bar → no
  // 'top' inset on the SafeAreaView); delivery keeps its flat ScreenHeader and
  // 'top' edge exactly as before.
  const isCustomer = activeRole === 'customer';

  return (
    <SafeAreaView style={styles.screen} edges={isCustomer ? [] : ['top']}>
      {isCustomer ? (
        <AppHero title="Notifications" onBack={() => router.back()} wordmarkSuffix=" · Customer" />
      ) : (
        <ScreenHeader title="Notifications" onBack={() => router.back()} />
      )}

      {unreadCount > 0 && (
        <View style={styles.markAllRow}>
          <Pressable onPress={handleMarkAllRead} hitSlop={8}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        </View>
      )}

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : error ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
        >
          <View style={styles.centerFill}>
            <Ionicons name="cloud-offline-outline" size={44} color={COLORS.tabInactive} />
            <Text style={styles.emptyTitle}>Couldn&apos;t load notifications</Text>
            <Text style={styles.emptyBody}>Check your connection and try again.</Text>
            <Pressable style={styles.retryButton} onPress={() => fetchFirstPage(false)}>
              <Ionicons name="refresh" size={15} color={COLORS.background} />
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : notifications.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
        >
          <View style={styles.centerFill}>
            <Text style={styles.emptyGlyph}>🔔</Text>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyBody}>Updates about your orders, returns, and payouts will appear here.</Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
        >
          {notifications.map((n) => (
            <Pressable
              key={n._id}
              style={[styles.row, !n.readAt && styles.rowUnread]}
              onPress={() => handlePressRow(n)}
            >
              <View style={styles.rowIcon}>
                <Ionicons
                  name={iconForType(n.type)}
                  size={20}
                  color={!n.readAt ? COLORS.primary : COLORS.tabInactive}
                />
              </View>
              <View style={styles.rowContent}>
                <Text style={[styles.rowTitle, !n.readAt && styles.rowTitleUnread]} numberOfLines={2}>
                  {n.title}
                </Text>
                {n.body ? <Text style={styles.rowBody} numberOfLines={3}>{n.body}</Text> : null}
                <Text style={styles.rowTime}>{timeAgo(n.createdAt)}</Text>
              </View>
            </Pressable>
          ))}

          {hasMore && (
            <Pressable style={styles.loadMoreButton} onPress={handleLoadMore} disabled={loadingMore}>
              {loadingMore ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Text style={styles.loadMoreText}>Load more</Text>
              )}
            </Pressable>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  markAllRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  markAllText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: SPACING.xl },
  emptyContainer: { flexGrow: 1 },
  emptyGlyph: { fontSize: 44, marginBottom: SPACING.sm },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  emptyBody: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
  scrollView: { flex: 1, backgroundColor: COLORS.background },
  list: { padding: SPACING.lg, paddingBottom: 32, gap: SPACING.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: SPACING.md,
    ...SHADOWS.card,
  },
  rowUnread: { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primarySoft },
  rowIcon: { width: 24, alignItems: 'center', marginTop: 1 },
  rowContent: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  rowTitleUnread: { color: COLORS.primary, fontWeight: '700' },
  rowBody: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 3 },
  rowTime: { fontSize: 11, color: COLORS.tabInactive, marginTop: 5 },
  loadMoreButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: SPACING.xs,
  },
  loadMoreText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm + 2,
    marginTop: SPACING.md,
  },
  retryButtonText: { fontSize: 13, fontWeight: '700', color: COLORS.background },
});
