import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../src/context/AuthContext';
import { getDeliveryOrders, markDelivered } from '../../src/utils/delivery';
import DeliveryHero from '../../src/components/DeliveryHero';
import NotificationBellIcon from '../../src/components/NotificationBellIcon';
import Toast from '../../src/components/Toast';
import DeliveryConfirmModal from '../../src/components/DeliveryConfirmModal';
import { StatusBadge } from '../../src/components/OrderStatusStepper';
import { COLORS, RADII, SHADOWS, SPACING } from '../../src/constants/colors';
import { formatRs } from '../../src/utils/format';

// Mirrors frontend/src/pages/delivery/Dashboard.jsx's Active/Completed
// segmented view (the "active"/"delivered" tabs of the web dashboard,
// scoped here to their own top-level mobile tab). Every shipment comes from
// GET /delivery/orders already carrying customerPayable/packageValue
// (server-computed, backend/controllers/deliveryController.js) — this
// screen only filters by status client-side (same as web's `.filter`), it
// never computes a money figure.
//
// Visual language: the indigo gradient hero mirrors the customer Home header
// (app/(customer)/home.js) — same primaryDark→primary diagonal, same
// translucent oversized glyph, orange accent on the standout figure — and the
// hero's summary strip surfaces the counts/earning that previously lived one
// tab away in Earnings. Every figure it shows already arrives in this
// screen's existing getDeliveryOrders() response; no figure is derived here
// and no extra request is made. ScreenHeader is intentionally gone: the hero
// replaces it, so this tab now opens in the same "brand hero" register as
// Home rather than the flat white dashboard-chrome bar.
const SEGMENTS = [
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
];

// Time-of-day greeting for the hero. Local to this screen on purpose: no
// shared greeting helper exists anywhere in the app (Home's hero is a static
// "Hi, {firstName} 👋"), and one screen's need doesn't justify inventing a
// shared util. Evaluated per render, so it follows the clock across a long
// session without any timer.
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

export default function DeliveriesScreen() {
  // Same auth mechanism (delivery)/profile.js uses — the agent is already in
  // auth state from login/restore, so the name costs no request.
  const { user } = useAuth();
  const [segment, setSegment] = useState('active');
  const [shipments, setShipments] = useState([]);
  // Server-aggregated total off the same GET /delivery/orders response
  // (backend already computed it) — shown in the hero, never recomputed here.
  const [deliveryEarnings, setDeliveryEarnings] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // A failed fetch used to be swallowed, so a dead network rendered as the
  // "no deliveries" empty state — indistinguishable from genuinely having no
  // jobs. Now it sets `error`, which drives a real error branch with Retry.
  // When a REFRESH fails on top of data we already have, the loaded list is
  // kept and the failure surfaces as a toast instead of blanking the screen.
  const hasDataRef = useRef(false);

  const fetchOrders = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const result = await getDeliveryOrders();
    if (result.success) {
      setShipments(result.shipments);
      setDeliveryEarnings(result.deliveryEarnings);
      setError(null);
      hasDataRef.current = result.shipments.length > 0;
    } else {
      const message = result.message || 'Failed to load deliveries';
      setError(message);
      if (hasDataRef.current) setToast({ type: 'error', message });
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchOrders(false);
    }, [fetchOrders])
  );

  const handleRefresh = () => fetchOrders(true);

  const active = shipments.filter((s) => s.status === 'dispatched');
  const completed = shipments.filter((s) => s.status === 'delivered');
  const list = segment === 'active' ? active : completed;

  // `.trim()` so a whitespace-only name falls back too. Without a name the
  // comma goes with it — never "Good morning, " or "Good morning, undefined".
  const firstName = user?.firstName?.trim();
  const greeting = firstName ? `${getGreeting()}, ${firstName} 👋` : `${getGreeting()} 👋`;

  // Same `active` array the summary strip and the list use — nothing refetched
  // or recomputed. Loading/error are checked first so the hero can't cheerily
  // claim "All caught up!" while the data is still unknown or failed to load.
  const statusText = loading
    ? 'Loading your deliveries…'
    : error && shipments.length === 0
      ? 'Couldn’t load your deliveries'
      : active.length === 0
        ? 'All caught up! 🎉'
        : `You have ${active.length} active ${active.length === 1 ? 'delivery' : 'deliveries'}`;

  const handleConfirmDelivery = async () => {
    if (!selected) return;
    setConfirmLoading(true);
    const result = await markDelivered(selected._id);
    setConfirmLoading(false);
    if (result.success) {
      setSelected(null);
      setToast({ type: 'success', message: 'Order marked as delivered.' });
      fetchOrders(false);
    } else {
      setToast({ type: 'error', message: result.message });
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      {/* Hero shell (gradient + wordmark + title block) now lives in
          src/components/DeliveryHero.js so Earnings can open in the same
          register. The extra bottom padding is passed explicitly because
          this screen seats the segmented control on the hero's bottom edge
          (segmentRow's marginTop: -SPACING.xl below). */}
      <DeliveryHero
        icon="navigate"
        title={greeting}
        subtitle={statusText}
        contentPaddingBottom={SPACING.xxl + SPACING.lg}
        rightSlot={
          <NotificationBellIcon color="#fff" onPress={() => router.push('/(delivery)/notifications')} />
        }
      >
        {/* Glanceable summary. Active/Completed are the same client-side
            status filters the list below uses, so these always agree with
            what's on screen; Earned is the server's pre-aggregated
            deliveryEarnings. Nothing summed, nothing invented. */}
        <View style={styles.summaryStrip}>
          <HeroStat label="Active" value={String(active.length)} />
          <View style={styles.summaryDivider} />
          <HeroStat label="Completed" value={String(completed.length)} />
          <View style={styles.summaryDivider} />
          <HeroStat label="Earned" value={formatRs(deliveryEarnings)} accent />
        </View>
      </DeliveryHero>

      <SafeAreaView style={styles.flex} edges={['bottom']}>
        {/* Lifted onto the hero's bottom edge so the two read as one unit */}
        <View style={styles.segmentRow}>
          {SEGMENTS.map((s) => (
            <Pressable
              key={s.key}
              style={[styles.segmentButton, segment === s.key && styles.segmentButtonActive]}
              onPress={() => setSegment(s.key)}
            >
              <Text style={[styles.segmentText, segment === s.key && styles.segmentTextActive]}>
                {s.label}
              </Text>
              {s.key === 'active' && active.length > 0 && (
                <View style={styles.segmentBadge}>
                  <Text style={styles.segmentBadgeText}>{active.length}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>

        {loading ? (
          <View style={styles.centerFill}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : error && shipments.length === 0 ? (
          // Third branch, distinct from empty: the fetch actually failed.
          <ScrollView
            contentContainerStyle={styles.emptyContainer}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
          >
            <View style={styles.centerFill}>
              <Ionicons name="cloud-offline-outline" size={44} color={COLORS.tabInactive} />
              <Text style={styles.emptyTitle}>Couldn&apos;t load deliveries</Text>
              <Text style={styles.emptyBody}>{error}</Text>
              <Pressable style={styles.retryButton} onPress={() => fetchOrders(false)}>
                <Ionicons name="refresh" size={15} color={COLORS.background} />
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          </ScrollView>
        ) : list.length === 0 ? (
          <ScrollView
            contentContainerStyle={styles.emptyContainer}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
          >
            <View style={styles.centerFill}>
              <Text style={styles.emptyGlyph}>{segment === 'active' ? '🚚' : '✅'}</Text>
              <Text style={styles.emptyTitle}>
                {segment === 'active' ? 'No active deliveries' : 'No completed deliveries yet'}
              </Text>
              <Text style={styles.emptyBody}>
                {segment === 'active'
                  ? 'Orders assigned to you will appear here'
                  : 'Your completed deliveries will appear here'}
              </Text>
            </View>
          </ScrollView>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
          >
            {list.map((shipment) => (
              <DeliveryCard key={shipment._id} shipment={shipment} onMarkDelivered={() => setSelected(shipment)} />
            ))}
          </ScrollView>
        )}
      </SafeAreaView>

      <DeliveryConfirmModal
        shipment={selected}
        loading={confirmLoading}
        onClose={() => setSelected(null)}
        onConfirm={handleConfirmDelivery}
      />

      <Toast toast={toast} onHide={() => setToast(null)} />
    </View>
  );
}

// One figure in the hero summary strip. Big numeral over a small label, the
// same 22/'700' stat proportion the Earnings tiles use (earnings.js) — the
// accent variant paints the standout number orange.
function HeroStat({ label, value, accent }) {
  return (
    <View style={styles.heroStat}>
      <Text
        style={[styles.heroStatValue, accent && styles.heroStatValueAccent]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {value}
      </Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

function DeliveryCard({ shipment, onMarkDelivered }) {
  const isCod = shipment.order?.paymentMethod === 'cash_on_delivery';
  const isDispatched = shipment.status === 'dispatched';

  return (
    <View style={styles.card}>
      {/* Tinted header band — gives every card an anchored top edge so the
          list reads as distinct jobs rather than one uniform stack. */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.cardHeaderIcon}>
            <Ionicons name="cube-outline" size={13} color={COLORS.primary} />
          </View>
          <Text style={styles.cardHeaderId}>#{shipment._id.slice(-8).toUpperCase()}</Text>
        </View>
        <StatusBadge status={shipment.status} />
      </View>

      <View style={styles.cardBody}>
      <View style={styles.itemRow}>
        {shipment.items.slice(0, 2).map((item, i) => (
          <View key={i} style={styles.itemPreview}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={styles.itemImage} />
            ) : (
              <View style={[styles.itemImage, styles.itemImageFallback]}>
                <Ionicons name="image-outline" size={16} color={COLORS.tabInactive} />
              </View>
            )}
            <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
          </View>
        ))}
        {shipment.items.length > 2 && (
          <Text style={styles.itemMore}>+{shipment.items.length - 2} more</Text>
        )}
      </View>

      <View style={styles.addressBox}>
        <Text style={styles.addressLabel}>📦 Pickup from</Text>
        {shipment.pickupAddress?.street ? (
          <>
            <Text style={styles.addressBold}>{shipment.pickupAddress.shopName}</Text>
            <Text style={styles.addressLine}>{shipment.pickupAddress.street}, {shipment.pickupAddress.city}</Text>
            <Text style={styles.addressLine}>{shipment.pickupAddress.district}</Text>
            {shipment.pickupAddress.phone && (
              <Text style={styles.addressPhone}>📞 {shipment.pickupAddress.phone}</Text>
            )}
          </>
        ) : (
          <Text style={styles.addressLine}>Contact seller for address</Text>
        )}
      </View>

      <View style={[styles.addressBox, styles.addressBoxGreen]}>
        <Text style={[styles.addressLabel, styles.addressLabelGreen]}>📍 Deliver to</Text>
        <Text style={styles.addressLine}>
          {shipment.order?.deliveryAddress?.street}, {shipment.order?.deliveryAddress?.city}
        </Text>
        <Text style={styles.addressLine}>{shipment.order?.deliveryAddress?.phone}</Text>
      </View>

      <View style={styles.footerRow}>
        <View style={[styles.methodBadge, isCod ? styles.methodBadgeCod : styles.methodBadgePrepaid]}>
          <Text style={[styles.methodBadgeText, { color: isCod ? COLORS.warning : COLORS.success }]}>
            {isCod ? '💵 COD' : '✅ Prepaid'}
          </Text>
        </View>
      </View>

      <View style={styles.moneyGrid}>
        <View style={styles.moneyCell}>
          <Text style={styles.moneyLabel}>Package value</Text>
          <Text style={styles.moneyValue}>{formatRs(shipment.packageValue)}</Text>
        </View>
        <View style={styles.moneyCell}>
          <Text style={styles.moneyLabel}>Collect</Text>
          <Text style={[styles.moneyValue, isCod ? styles.moneyValueDanger : styles.moneyValueMuted]}>
            {isCod ? formatRs(shipment.customerPayable) : 'Paid online'}
          </Text>
        </View>
        {/* The figure the agent actually cares about — lifted out of the row
            onto its own tinted chip. Same value, same source. */}
        <View style={[styles.moneyCell, styles.moneyCellEarning]}>
          <Text style={styles.moneyLabel}>Your earning</Text>
          <Text style={[styles.moneyValue, styles.moneyValueEarning]}>{formatRs(shipment.deliveryEarning || 50)}</Text>
        </View>
      </View>

      {isDispatched ? (
        <Pressable style={styles.markButton} onPress={onMarkDelivered}>
          <Ionicons name="checkmark-circle" size={16} color={COLORS.background} />
          <Text style={styles.markButtonText}>Mark Delivered</Text>
        </Pressable>
      ) : (
        <Text style={styles.deliveredText}>✓ Delivered</Text>
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },

  // ── Hero content (the shell itself lives in DeliveryHero.js) ──────────
  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: RADII.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
  summaryDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  heroStat: { flex: 1, alignItems: 'center', paddingHorizontal: SPACING.xs },
  heroStatValue: { fontSize: 22, fontWeight: '700', color: COLORS.background },
  heroStatValueAccent: { color: COLORS.accentLight },
  heroStatLabel: { fontSize: 11, color: COLORS.heroText, marginTop: 2 },

  // ── Segmented control (lifted onto the hero's bottom edge) ────────────
  segmentRow: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginTop: -SPACING.xl,
    marginBottom: SPACING.xs,
    backgroundColor: COLORS.card,
    borderRadius: RADII.md,
    padding: 4,
    gap: 3,
    ...SHADOWS.floating,
  },
  segmentButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADII.sm,
  },
  segmentButtonActive: { backgroundColor: COLORS.primarySoft },
  segmentText: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  segmentTextActive: { color: COLORS.primary, fontWeight: '700' },
  segmentBadge: { backgroundColor: COLORS.accent, borderRadius: RADII.pill, paddingHorizontal: 6, paddingVertical: 1 },
  segmentBadgeText: { fontSize: 10.5, fontWeight: '700', color: '#fff' },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: SPACING.xl },
  emptyContainer: { flexGrow: 1 },
  emptyGlyph: { fontSize: 44, marginBottom: SPACING.sm },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  emptyBody: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
  // Same button recipe as ProductCard's add-to-cart: primary fill, RADII.sm,
  // white 13px '700' label.
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
  scrollView: { flex: 1, backgroundColor: COLORS.background },
  list: { padding: SPACING.lg, paddingBottom: 32, gap: SPACING.md },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primarySoft,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
  },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  cardHeaderIcon: {
    width: 22,
    height: 22,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { padding: SPACING.lg },
  cardHeaderId: { fontSize: 13, fontWeight: '700', color: COLORS.primary, fontVariant: ['tabular-nums'] },
  itemRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  itemPreview: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemImage: { width: 28, height: 28, borderRadius: RADII.sm, backgroundColor: COLORS.surface },
  itemImageFallback: { alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: 11.5, color: COLORS.textMuted, maxWidth: 90 },
  itemMore: { fontSize: 11, color: COLORS.tabInactive },
  // infoSoft is the token for exactly this blue-50 tint; the literal #EFF6FF
  // that used to be here was an untokenized duplicate of it.
  addressBox: { backgroundColor: COLORS.infoSoft, borderRadius: RADII.sm, padding: SPACING.sm + 2, marginBottom: SPACING.sm },
  addressBoxGreen: { backgroundColor: COLORS.successSoft },
  addressLabel: { fontSize: 11, fontWeight: '700', color: COLORS.info, marginBottom: 3 },
  addressLabelGreen: { color: COLORS.success },
  addressBold: { fontSize: 12, fontWeight: '600', color: COLORS.info },
  addressLine: { fontSize: 11.5, color: COLORS.textMuted },
  addressPhone: { fontSize: 11.5, fontWeight: '600', color: COLORS.info, marginTop: 2 },
  footerRow: { flexDirection: 'row', marginTop: SPACING.xs, marginBottom: SPACING.sm },
  methodBadge: { borderRadius: RADII.pill, paddingHorizontal: 10, paddingVertical: 4 },
  methodBadgeCod: { backgroundColor: COLORS.warningSoft },
  methodBadgePrepaid: { backgroundColor: COLORS.successSoft },
  methodBadgeText: { fontSize: 11.5, fontWeight: '600' },
  moneyGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  moneyCell: { flex: 1 },
  moneyCellEarning: {
    backgroundColor: COLORS.successSoft,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
  },
  moneyLabel: { fontSize: 10.5, color: COLORS.tabInactive, marginBottom: 2 },
  moneyValue: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  moneyValueDanger: { color: COLORS.danger },
  moneyValueMuted: { color: COLORS.tabInactive, fontWeight: '600' },
  moneyValueEarning: { fontSize: 15, color: COLORS.success },
  markButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.success,
    borderRadius: RADII.md,
    paddingVertical: SPACING.sm + 3,
  },
  markButtonText: { fontSize: 13, fontWeight: '700', color: COLORS.background },
  deliveredText: { fontSize: 12.5, fontWeight: '600', color: COLORS.success, textAlign: 'center' },
});
