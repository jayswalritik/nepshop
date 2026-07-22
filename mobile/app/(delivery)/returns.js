import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getMyReturnPickups, markReturnPickedUp, completeReturn } from '../../src/utils/delivery';
import DeliveryHero from '../../src/components/DeliveryHero';
import NotificationBellIcon from '../../src/components/NotificationBellIcon';
import Toast from '../../src/components/Toast';
import ReturnPickupConfirmModal from '../../src/components/ReturnPickupConfirmModal';
import { COLORS, RADII, SHADOWS, SPACING } from '../../src/constants/colors';
import { formatRs } from '../../src/utils/format';

// Mirrors frontend/src/pages/delivery/ReturnPickups.jsx exactly — same two
// statuses shown (approved/picked_up, per GET /returns/pickups' own filter),
// same two-step action flow. The completed-return message (refund + agent
// earning summary) comes straight from PUT /returns/:id/complete's response
// and is shown verbatim via Alert.alert — same string web shows via
// `alert(data.message)`, nothing recomputed. web's handlePickup shows no
// message on the pickup step either — mirrored exactly (Toast there is
// this app's own lightweight action-feedback convention, not a web figure).
//
// Composition mirrors its twin, the Deliveries landing tab: the shared
// DeliveryHero shell (src/components/DeliveryHero.js) replaces the flat white
// ScreenHeader, with a glanceable stat strip beneath the title. Unlike
// Deliveries there is no Active/Completed segmented control here — this
// screen has always shown one list containing both statuses, distinguished
// per-card by badge, and that structure is unchanged.
export default function ReturnsScreen() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null); // { type: 'pickup'|'complete', return }
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // A failed fetch used to be swallowed (no `else`), so a dead network
  // rendered as "No return pickups" — indistinguishable from genuinely having
  // no jobs. Same pattern as deliveries.js now: `error` drives a real error
  // branch with Retry, and a refresh that fails on top of data we already
  // have keeps the data and surfaces a toast instead of blanking the screen.
  const hasDataRef = useRef(false);

  const fetchPickups = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const result = await getMyReturnPickups();
    if (result.success) {
      setReturns(result.returns);
      setError(null);
      hasDataRef.current = result.returns.length > 0;
    } else {
      const message = result.message || 'Failed to load return pickups';
      setError(message);
      if (hasDataRef.current) setToast({ type: 'error', message });
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPickups(false);
    }, [fetchPickups])
  );

  const handleRefresh = () => fetchPickups(true);

  // Same client-side .filter().length derivation deliveries.js uses for its
  // Active/Completed counts, over the two statuses GET /returns/pickups
  // already returns. No extra request, and no money arithmetic: the payload
  // carries no earnings total, and per-job returnAgentEarning is deliberately
  // NOT summed here.
  const awaiting = returns.filter((r) => r.status === 'approved');
  const inTransit = returns.filter((r) => r.status === 'picked_up');

  const handleConfirm = async () => {
    if (!confirm) return;
    setActionLoading(true);
    const result = confirm.type === 'pickup'
      ? await markReturnPickedUp(confirm.return._id)
      : await completeReturn(confirm.return._id);
    setActionLoading(false);

    if (!result.success) {
      setToast({ type: 'error', message: result.message });
      return;
    }

    setConfirm(null);
    if (confirm.type === 'complete') {
      Alert.alert('Return completed', result.message);
    } else {
      setToast({ type: 'success', message: 'Marked as picked up.' });
    }
    fetchPickups(false);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <DeliveryHero
        icon="swap-horizontal"
        title="Return Pickups"
        rightSlot={
          <NotificationBellIcon color="#fff" onPress={() => router.push('/(delivery)/notifications')} />
        }
      >
        {/* Glanceable split of the same list rendered below — the two
            statuses this screen already distinguishes per card. Awaiting
            Pickup is accented because it's the actionable one. */}
        <View style={styles.summaryStrip}>
          <HeroStat label="Awaiting Pickup" value={String(awaiting.length)} accent />
          <View style={styles.summaryDivider} />
          <HeroStat label="In Transit" value={String(inTransit.length)} />
        </View>
      </DeliveryHero>

      <SafeAreaView style={styles.flex} edges={['bottom']}>
        {loading ? (
          <View style={styles.centerFill}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : error && returns.length === 0 ? (
          // Third branch, distinct from empty: the fetch actually failed.
          <ScrollView
            contentContainerStyle={styles.emptyContainer}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
          >
            <View style={styles.centerFill}>
              <Ionicons name="cloud-offline-outline" size={44} color={COLORS.tabInactive} />
              <Text style={styles.emptyTitle}>Couldn&apos;t load return pickups</Text>
              <Text style={styles.emptyBody}>{error}</Text>
              <Pressable style={styles.retryButton} onPress={() => fetchPickups(false)}>
                <Ionicons name="refresh" size={15} color={COLORS.background} />
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          </ScrollView>
        ) : returns.length === 0 ? (
          <ScrollView
            contentContainerStyle={styles.emptyContainer}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
          >
            <View style={styles.centerFill}>
              <Text style={styles.emptyGlyph}>🔄</Text>
              <Text style={styles.emptyTitle}>No return pickups</Text>
              <Text style={styles.emptyBody}>Return jobs assigned to you will appear here</Text>
            </View>
          </ScrollView>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
          >
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                🔄 <Text style={styles.infoBold}>Return pickups</Text> — collect the item FROM the customer, then
                deliver it TO the seller. You earn Rs 50 per completed return.
              </Text>
            </View>

            {returns.map((r) => (
              <ReturnCard
                key={r._id}
                r={r}
                onAction={() => setConfirm({ type: r.status === 'approved' ? 'pickup' : 'complete', return: r })}
              />
            ))}
          </ScrollView>
        )}
      </SafeAreaView>

      <ReturnPickupConfirmModal
        confirm={confirm}
        loading={actionLoading}
        onClose={() => setConfirm(null)}
        onConfirm={handleConfirm}
      />

      <Toast toast={toast} onHide={() => setToast(null)} />
    </View>
  );
}

// One figure in the hero summary strip — same component and proportions as
// the Deliveries tab's strip.
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

function ReturnCard({ r, onAction }) {
  const isApproved = r.status === 'approved';

  return (
    <View style={styles.card}>
      {/* Tinted header band — same anchored top edge the Deliveries cards
          got, so the list reads as distinct jobs rather than one stack. */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.cardHeaderIcon}>
            <Ionicons name="swap-horizontal" size={13} color={COLORS.primary} />
          </View>
          <View>
            <Text style={styles.cardHeaderLabel}>Return for Order</Text>
            <Text style={styles.cardHeaderId}>#{r.order?._id?.slice(-8).toUpperCase()}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, isApproved ? styles.statusBadgeApproved : styles.statusBadgeTransit]}>
          <Text style={[styles.statusBadgeText, { color: isApproved ? COLORS.info : COLORS.purple }]}>
            {isApproved ? '📦 Awaiting Pickup' : '🚚 In Transit to Seller'}
          </Text>
        </View>
      </View>

      <View style={styles.itemList}>
        {r.items.map((item, i) => (
          <View key={i} style={styles.itemRow}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={styles.itemImage} />
            ) : (
              <View style={[styles.itemImage, styles.itemImageFallback]} />
            )}
            <View style={styles.itemInfo}>
              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.itemMeta}>Qty: {item.quantity}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.reasonBox}>
        <Text style={styles.reasonLabel}>Return reason</Text>
        <Text style={styles.reasonText}>{r.reason}</Text>
      </View>

      <View style={styles.addressBox}>
        <Text style={styles.addressLabel}>📦 Collect FROM (Customer)</Text>
        <Text style={styles.addressBold}>{r.customer?.firstName} {r.customer?.lastName}</Text>
        <Text style={styles.addressLine}>{r.customer?.phone}</Text>
        {r.order?.deliveryAddress && (
          <Text style={styles.addressLine}>{r.order.deliveryAddress.street}, {r.order.deliveryAddress.city}</Text>
        )}
      </View>

      <View style={[styles.addressBox, styles.addressBoxGreen]}>
        <Text style={[styles.addressLabel, styles.addressLabelGreen]}>🏪 Deliver TO (Seller)</Text>
        {r.shipment?.pickupAddress?.shopName ? (
          <>
            <Text style={[styles.addressBold, styles.addressBoldGreen]}>{r.shipment.pickupAddress.shopName}</Text>
            <Text style={styles.addressLine}>{r.shipment.pickupAddress.street}, {r.shipment.pickupAddress.city}</Text>
            {r.shipment.pickupAddress.phone && (
              <Text style={styles.addressLine}>📞 {r.shipment.pickupAddress.phone}</Text>
            )}
          </>
        ) : (
          <Text style={styles.addressLine}>Seller address on file</Text>
        )}
      </View>

      <View style={styles.footerRow}>
        {/* Earning lifted onto its own tinted chip instead of a plain grey
            line — same treatment as the Deliveries money grid. */}
        <View style={styles.earningChip}>
          <Text style={styles.earningLabel}>Your earning</Text>
          <Text style={styles.earningAmount}>{formatRs(r.returnAgentEarning || 50)}</Text>
        </View>
        <Pressable style={isApproved ? styles.pickupButton : styles.completeButton} onPress={onAction}>
          <Ionicons name="checkmark-circle" size={14} color={COLORS.background} />
          <Text style={styles.actionButtonText}>{isApproved ? 'Mark Picked Up' : 'Returned to Seller'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: SPACING.xl },
  emptyContainer: { flexGrow: 1 },
  emptyGlyph: { fontSize: 44, marginBottom: SPACING.sm },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  emptyBody: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },

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

  // Same button recipe as ProductCard's add-to-cart / deliveries' retry.
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
  // warningSoft/warning replace the untokenized amber-50/amber-200 literals
  // that were here; the body text was already COLORS.warning, so the box now
  // sits entirely in the warning family.
  infoBox: {
    backgroundColor: COLORS.warningSoft,
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  infoText: { fontSize: 12.5, color: COLORS.warning, lineHeight: 18 },
  infoBold: { fontWeight: '700' },
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.primarySoft,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
  cardHeaderLabel: { fontSize: 10.5, color: COLORS.textMuted },
  cardHeaderId: { fontSize: 13, fontWeight: '700', color: COLORS.primary, fontVariant: ['tabular-nums'] },
  statusBadge: { borderRadius: RADII.pill, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeApproved: { backgroundColor: COLORS.infoSoft },
  statusBadgeTransit: { backgroundColor: COLORS.purpleSoft },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  itemList: { padding: SPACING.lg, paddingBottom: 0, gap: SPACING.sm },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  itemImage: { width: 40, height: 40, borderRadius: RADII.sm, backgroundColor: COLORS.surface },
  itemImageFallback: {},
  itemInfo: { flex: 1 },
  itemName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  itemMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  reasonBox: { marginHorizontal: SPACING.lg, marginTop: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADII.sm, padding: SPACING.sm + 2 },
  reasonLabel: { fontSize: 10.5, color: COLORS.tabInactive },
  reasonText: { fontSize: 12.5, color: COLORS.text, marginTop: 1 },
  // infoSoft is the token for exactly this blue-50 tint; the literal #EFF6FF
  // that used to be here was an untokenized duplicate of it (same
  // substitution already made in deliveries.js).
  addressBox: { marginHorizontal: SPACING.lg, marginTop: SPACING.md, backgroundColor: COLORS.infoSoft, borderRadius: RADII.sm, padding: SPACING.sm + 2 },
  addressBoxGreen: { backgroundColor: COLORS.successSoft },
  addressLabel: { fontSize: 11, fontWeight: '700', color: COLORS.info, marginBottom: 3 },
  addressLabelGreen: { color: COLORS.success },
  addressBold: { fontSize: 12, fontWeight: '600', color: COLORS.info },
  addressBoldGreen: { color: COLORS.success },
  addressLine: { fontSize: 11.5, color: COLORS.textMuted },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: SPACING.lg,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  earningChip: {
    backgroundColor: COLORS.successSoft,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
  },
  earningLabel: { fontSize: 10.5, color: COLORS.tabInactive, marginBottom: 2 },
  earningAmount: { fontSize: 15, fontWeight: '700', color: COLORS.success },
  pickupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.info,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.success,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  actionButtonText: { fontSize: 11.5, fontWeight: '600', color: COLORS.background },
});
