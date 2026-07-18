import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getDeliveryOrders, markDelivered } from '../../src/utils/delivery';
import ScreenHeader from '../../src/components/ScreenHeader';
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
const SEGMENTS = [
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
];

export default function DeliveriesScreen() {
  const [segment, setSegment] = useState('active');
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const fetchOrders = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const result = await getDeliveryOrders();
    if (result.success) setShipments(result.shipments);
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
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Deliveries" />

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

      <DeliveryConfirmModal
        shipment={selected}
        loading={confirmLoading}
        onClose={() => setSelected(null)}
        onConfirm={handleConfirmDelivery}
      />

      <Toast toast={toast} onHide={() => setToast(null)} />
    </SafeAreaView>
  );
}

function DeliveryCard({ shipment, onMarkDelivered }) {
  const isCod = shipment.order?.paymentMethod === 'cash_on_delivery';
  const isDispatched = shipment.status === 'dispatched';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardHeaderId}>#{shipment._id.slice(-8).toUpperCase()}</Text>
        <StatusBadge status={shipment.status} />
      </View>

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
        <View style={styles.moneyCell}>
          <Text style={styles.moneyLabel}>Your earning</Text>
          <Text style={[styles.moneyValue, styles.moneyValueSuccess]}>{formatRs(shipment.deliveryEarning || 50)}</Text>
        </View>
      </View>

      {isDispatched ? (
        <Pressable style={styles.markButton} onPress={onMarkDelivered}>
          <Text style={styles.markButtonText}>Mark Delivered</Text>
        </Pressable>
      ) : (
        <Text style={styles.deliveredText}>✓ Delivered</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  segmentRow: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    padding: 3,
    gap: 3,
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
  segmentButtonActive: { backgroundColor: COLORS.background, ...SHADOWS.card },
  segmentText: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  segmentTextActive: { color: COLORS.primary },
  segmentBadge: { backgroundColor: COLORS.accent, borderRadius: RADII.pill, paddingHorizontal: 6, paddingVertical: 1 },
  segmentBadgeText: { fontSize: 10.5, fontWeight: '700', color: '#fff' },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: SPACING.xl },
  emptyContainer: { flexGrow: 1 },
  emptyGlyph: { fontSize: 44, marginBottom: SPACING.sm },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  emptyBody: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
  scrollView: { flex: 1, backgroundColor: COLORS.background },
  list: { padding: SPACING.lg, paddingBottom: 32, gap: SPACING.md },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: SPACING.lg,
    ...SHADOWS.card,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  cardHeaderId: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, fontVariant: ['tabular-nums'] },
  itemRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  itemPreview: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemImage: { width: 28, height: 28, borderRadius: RADII.sm, backgroundColor: COLORS.surface },
  itemImageFallback: { alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: 11.5, color: COLORS.textMuted, maxWidth: 90 },
  itemMore: { fontSize: 11, color: COLORS.tabInactive },
  addressBox: { backgroundColor: '#EFF6FF', borderRadius: RADII.sm, padding: SPACING.sm + 2, marginBottom: SPACING.sm },
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
  moneyGrid: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.sm, marginBottom: SPACING.md },
  moneyCell: { flex: 1 },
  moneyLabel: { fontSize: 10.5, color: COLORS.tabInactive, marginBottom: 2 },
  moneyValue: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  moneyValueDanger: { color: COLORS.danger },
  moneyValueMuted: { color: COLORS.tabInactive, fontWeight: '600' },
  moneyValueSuccess: { color: COLORS.success },
  markButton: { backgroundColor: COLORS.success, borderRadius: RADII.md, paddingVertical: SPACING.sm + 3, alignItems: 'center' },
  markButtonText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  deliveredText: { fontSize: 12.5, fontWeight: '600', color: COLORS.success, textAlign: 'center' },
});
