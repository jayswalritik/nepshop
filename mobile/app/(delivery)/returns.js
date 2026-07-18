import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getMyReturnPickups, markReturnPickedUp, completeReturn } from '../../src/utils/delivery';
import ScreenHeader from '../../src/components/ScreenHeader';
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
export default function ReturnsScreen() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirm, setConfirm] = useState(null); // { type: 'pickup'|'complete', return }
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const fetchPickups = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const result = await getMyReturnPickups();
    if (result.success) setReturns(result.returns);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPickups(false);
    }, [fetchPickups])
  );

  const handleRefresh = () => fetchPickups(true);

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
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Return Pickups" />

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
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

      <ReturnPickupConfirmModal
        confirm={confirm}
        loading={actionLoading}
        onClose={() => setConfirm(null)}
        onConfirm={handleConfirm}
      />

      <Toast toast={toast} onHide={() => setToast(null)} />
    </SafeAreaView>
  );
}

function ReturnCard({ r, onAction }) {
  const isApproved = r.status === 'approved';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardHeaderLabel}>Return for Order</Text>
          <Text style={styles.cardHeaderId}>#{r.order?._id?.slice(-8).toUpperCase()}</Text>
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
        <Text style={styles.earningText}>
          Your earning: <Text style={styles.earningAmount}>{formatRs(r.returnAgentEarning || 50)}</Text>
        </Text>
        <Pressable style={isApproved ? styles.pickupButton : styles.completeButton} onPress={onAction}>
          <Text style={styles.actionButtonText}>{isApproved ? '✓ Mark Picked Up' : '✓ Returned to Seller'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: SPACING.xl },
  emptyContainer: { flexGrow: 1 },
  emptyGlyph: { fontSize: 44, marginBottom: SPACING.sm },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  emptyBody: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
  scrollView: { flex: 1, backgroundColor: COLORS.background },
  list: { padding: SPACING.lg, paddingBottom: 32, gap: SPACING.md },
  infoBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
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
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  cardHeaderLabel: { fontSize: 10.5, color: COLORS.tabInactive },
  cardHeaderId: { fontSize: 13, fontWeight: '600', color: COLORS.text, fontVariant: ['tabular-nums'] },
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
  addressBox: { marginHorizontal: SPACING.lg, marginTop: SPACING.md, backgroundColor: '#EFF6FF', borderRadius: RADII.sm, padding: SPACING.sm + 2 },
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
  earningText: { fontSize: 12, color: COLORS.tabInactive },
  earningAmount: { fontSize: 13, fontWeight: '700', color: COLORS.success },
  pickupButton: { backgroundColor: COLORS.info, borderRadius: RADII.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  completeButton: { backgroundColor: COLORS.success, borderRadius: RADII.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  actionButtonText: { fontSize: 11.5, fontWeight: '600', color: '#fff' },
});
