import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getMyOrders, cancelOrder, cancelShipment, getOrderSummary } from '../../src/utils/orders';
import { getMyReturns } from '../../src/utils/returns';
import ScreenHeader from '../../src/components/ScreenHeader';
import NotificationBellIcon from '../../src/components/NotificationBellIcon';
import Dropdown from '../../src/components/Dropdown';
import Toast from '../../src/components/Toast';
import OrderStatusStepper, { StatusBadge } from '../../src/components/OrderStatusStepper';
import CancelPackageModal from '../../src/components/CancelPackageModal';
import ReturnItemsModal from '../../src/components/ReturnItemsModal';
import { COLORS, RADII, SHADOWS, SPACING } from '../../src/constants/colors';
import { formatRs } from '../../src/utils/format';
import {
  formatStatusLabel,
  returnTimeLeft,
  formatTimeLeft,
  hasReturnableItems,
} from '../../src/utils/orderStatus';

// Mirrors frontend/src/pages/customer/OrdersPage.jsx's list view.
//
// MONEY DISPLAY: the list's own footer still shows only raw per-order fields
// (Subtotal/Delivery/Coupon/Total straight from GET /orders/my, zero
// arithmetic) rather than web's client-computed Paid/To-pay/Refunded split —
// that split now HAS a server-computed source (GET /orders/:id/summary,
// backend/utils/orderSummary.js), but this task scoped the bucket FOOTER
// display to the order detail screen only (see app/(customer)/order/[id].js).
// The Cancel Package modal's refund figure, previously omitted for the same
// reason, IS now wired below via that same endpoint's per-shipment
// `cancelRefundPreview` — fetched on demand when the modal opens, since this
// list shows many orders at once and pre-fetching every order's summary up
// front would be wasteful.
const STATUS_FILTERS = ['All Orders', 'Pending', 'Confirmed', 'Packed', 'On the Way', 'Delivered', 'Cancelled'];
const FILTER_VALUE = {
  'All Orders': '',
  Pending: 'pending',
  Confirmed: 'confirmed',
  Packed: 'packed',
  'On the Way': 'dispatched',
  Delivered: 'delivered',
  Cancelled: 'cancelled',
};

export default function OrdersScreen() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterLabel, setFilterLabel] = useState('All Orders');
  const [myReturns, setMyReturns] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [expandedShipments, setExpandedShipments] = useState(new Set());
  const [cancelTarget, setCancelTarget] = useState(null); // { order, shipment }
  const [cancelRefundPreview, setCancelRefundPreview] = useState(null);
  const [cancelPreviewLoading, setCancelPreviewLoading] = useState(false);
  const [cancellingShipmentId, setCancellingShipmentId] = useState(null);
  const [cancellingOrderId, setCancellingOrderId] = useState(null);
  const [returnTarget, setReturnTarget] = useState(null); // { order, shipment }
  const [toast, setToast] = useState(null);

  const filter = FILTER_VALUE[filterLabel];

  const fetchOrders = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const result = await getMyOrders(filter);
    if (result.success) setOrders(result.orders);
    setLoading(false);
    setRefreshing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const fetchReturns = useCallback(async () => {
    const result = await getMyReturns();
    setMyReturns(result.returns);
  }, []);

  // Fetches on every focus (not just mount) AND whenever the status filter
  // changes while this tab is already focused.
  useFocusEffect(
    useCallback(() => {
      fetchOrders(false);
      fetchReturns();
    }, [fetchOrders, fetchReturns])
  );

  // Live clock — ticks every second so return-window countdowns count down.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleRefresh = () => fetchOrders(true);

  const toggleExpand = (shipmentId) => {
    setExpandedShipments((prev) => {
      const next = new Set(prev);
      if (next.has(shipmentId)) next.delete(shipmentId);
      else next.add(shipmentId);
      return next;
    });
  };

  const openReturnsForShipment = (shipmentId) =>
    myReturns.filter((r) => r.shipment?._id === shipmentId && ['pending', 'approved', 'picked_up'].includes(r.status));

  // Opens the cancel modal immediately (so it never feels stuck), then
  // fetches this order's summary on demand to fill in cancelRefundPreview —
  // this list shows many orders at once, so summaries aren't pre-fetched for
  // all of them up front, only for the one the customer is actually about
  // to act on.
  const openCancelModal = async (order, shipment) => {
    setCancelTarget({ order, shipment });
    setCancelRefundPreview(null);
    setCancelPreviewLoading(true);
    const result = await getOrderSummary(order._id);
    setCancelPreviewLoading(false);
    if (result.success) {
      const match = result.shipments.find((s) => s.shipmentId === shipment._id);
      setCancelRefundPreview(match?.cancelRefundPreview ?? null);
    }
  };

  const closeCancelModal = () => {
    setCancelTarget(null);
    setCancelRefundPreview(null);
  };

  const handleCancelOrder = async (orderId) => {
    setCancellingOrderId(orderId);
    const result = await cancelOrder(orderId);
    setCancellingOrderId(null);
    if (result.success) {
      setToast({ type: 'success', message: 'Order cancelled.' });
      fetchOrders(false);
    } else {
      setToast({ type: 'error', message: result.message });
    }
  };

  const handleCancelShipment = async () => {
    if (!cancelTarget) return;
    const shipmentId = cancelTarget.shipment._id;
    setCancellingShipmentId(shipmentId);
    const result = await cancelShipment(shipmentId);
    setCancellingShipmentId(null);
    closeCancelModal();
    if (result.success) {
      setToast({ type: 'success', message: result.message || 'Package cancelled successfully.' });
      fetchOrders(false);
    } else {
      setToast({ type: 'error', message: result.message });
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader
        title="My Orders"
        rightSlot={<NotificationBellIcon onPress={() => router.push('/(customer)/notifications')} />}
      />

      <View style={styles.filterRow}>
        <Dropdown value={filterLabel} onChange={setFilterLabel} options={STATUS_FILTERS} placeholder="Filter" />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : orders.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
        >
          <View style={styles.centerFill}>
            <Text style={styles.emptyGlyph}>📦</Text>
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptyBody}>Your orders will appear here once you place them</Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
        >
          {orders.map((order) => (
            <OrderCard
              key={order._id}
              order={order}
              now={now}
              expandedShipments={expandedShipments}
              onToggleExpand={toggleExpand}
              openReturnsForShipment={openReturnsForShipment}
              onReturnPress={(shipment) => setReturnTarget({ order, shipment })}
              onCancelShipmentPress={(shipment) => openCancelModal(order, shipment)}
              cancellingShipmentId={cancellingShipmentId}
              onCancelOrderPress={() => handleCancelOrder(order._id)}
              cancellingOrderId={cancellingOrderId}
            />
          ))}
        </ScrollView>
      )}

      {cancelTarget && (
        <CancelPackageModal
          order={cancelTarget.order}
          shipment={cancelTarget.shipment}
          loading={cancellingShipmentId === cancelTarget.shipment._id}
          refundPreview={cancelRefundPreview}
          previewLoading={cancelPreviewLoading}
          onClose={closeCancelModal}
          onConfirm={handleCancelShipment}
        />
      )}

      {returnTarget && (
        <ReturnItemsModal
          order={returnTarget.order}
          shipment={returnTarget.shipment}
          onClose={() => setReturnTarget(null)}
          onSuccess={(message) => {
            setReturnTarget(null);
            setToast({ type: 'success', message });
            fetchOrders(false);
            fetchReturns();
          }}
        />
      )}

      <Toast toast={toast} onHide={() => setToast(null)} />
    </SafeAreaView>
  );
}

function OrderCard({
  order,
  now,
  expandedShipments,
  onToggleExpand,
  openReturnsForShipment,
  onReturnPress,
  onCancelShipmentPress,
  cancellingShipmentId,
  onCancelOrderPress,
  cancellingOrderId,
}) {
  const shipments = order.shipments?.length
    ? order.shipments
    : [{ _id: order._id, status: order.status, items: order.items, seller: null, deliveryAgent: order.deliveryAgent, deliveredAt: order.deliveredAt }];
  const isMulti = shipments.length > 1;
  const uniqueStatuses = [...new Set(shipments.map((s) => s.status))];

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardHeaderLabel}>Order ID</Text>
          <Text style={styles.cardHeaderValue}>#{order._id.slice(-8).toUpperCase()}</Text>
        </View>
        <View style={styles.cardHeaderRight}>
          <Text style={styles.cardHeaderLabel}>Placed on</Text>
          <Text style={styles.cardHeaderDate}>
            {new Date(order.createdAt).toLocaleDateString('en-NP', { day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        </View>
      </View>
      <View style={styles.cardHeaderStatusRow}>
        {order.status === 'returned' || shipments.length <= 1 ? (
          <StatusBadge status={order.status} />
        ) : uniqueStatuses.length === 1 ? (
          <StatusBadge status={uniqueStatuses[0]} />
        ) : (
          shipments.map((s, i) => (
            <StatusBadge key={s._id} status={s.status} label={`Pkg ${i + 1}: ${formatStatusLabel(s.status)}`} />
          ))
        )}
        {order.paymentStatus === 'refunded' && (
          <View style={[styles.badge, { backgroundColor: COLORS.successSoft }]}>
            <Text style={[styles.badgeText, { color: COLORS.success }]}>💸 Refunded</Text>
          </View>
        )}
      </View>

      {/* Items */}
      <View style={styles.body}>
        <View style={styles.itemList}>
          {order.items.map((item, i) => (
            <View key={i} style={styles.itemRow}>
              {item.image ? (
                <Image source={{ uri: item.image }} style={styles.itemImage} />
              ) : (
                <View style={[styles.itemImage, styles.itemImageFallback]}>
                  <Ionicons name="image-outline" size={18} color={COLORS.tabInactive} />
                </View>
              )}
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.itemMeta}>Qty: {item.quantity} · {formatRs(item.price)} each</Text>
              </View>
            </View>
          ))}
        </View>

        {isMulti && <Text style={styles.packagesNote}>Arrives in {shipments.length} packages</Text>}

        {shipments.map((shipment, i) => {
          const openReturns = openReturnsForShipment(shipment._id);
          const openQty = openReturns.reduce((s, r) => s + r.items.reduce((s2, it) => s2 + it.quantity, 0), 0);
          const timeLeft = returnTimeLeft(shipment, now);
          const canReturn = shipment.status === 'delivered' && timeLeft > 0 && hasReturnableItems(shipment);
          const expanded = expandedShipments.has(shipment._id);

          return (
            <View key={shipment._id} style={styles.packageBlock}>
              {isMulti && (
                <View style={styles.packageHeaderRow}>
                  <Text style={styles.packageHeaderText}>
                    Package {i + 1}
                    {shipment.seller && (
                      <Text style={styles.packageHeaderSeller}>
                        {'  — '}{shipment.seller.shopName || `${shipment.seller.firstName || ''} ${shipment.seller.lastName || ''}`.trim()}
                      </Text>
                    )}
                  </Text>
                  <Text style={styles.packageHeaderMeta}>
                    {shipment.items.length} item{shipment.items.length > 1 ? 's' : ''}
                    {shipment.deliveryAgent && ` · Agent: ${shipment.deliveryAgent.firstName} ${shipment.deliveryAgent.lastName}`}
                  </Text>
                </View>
              )}

              {openQty > 0 && (
                <View style={styles.returnBadge}>
                  <Text style={styles.returnBadgeText}>
                    {shipment.status === 'delivered' ? 'Delivered · ' : ''}{openQty} item{openQty > 1 ? 's' : ''} in return
                  </Text>
                </View>
              )}

              <OrderStatusStepper status={shipment.status} />

              {shipment.status === 'delivered' && hasReturnableItems(shipment) && (
                <View style={styles.returnRow}>
                  {timeLeft > 0 ? (
                    <Text style={styles.returnTimeText}>⏱ Return window: <Text style={styles.returnTimeBold}>{formatTimeLeft(timeLeft)}</Text> left</Text>
                  ) : (
                    <Text style={styles.returnExpiredText}>⛔ Return window expired for this package</Text>
                  )}
                  {canReturn && (
                    <Pressable style={styles.returnButton} onPress={() => onReturnPress(shipment)}>
                      <Text style={styles.returnButtonText}>🔄 Return item(s)</Text>
                    </Pressable>
                  )}
                </View>
              )}

              <View style={styles.actionRow}>
                <Pressable style={styles.detailsButton} onPress={() => onToggleExpand(shipment._id)}>
                  <Text style={styles.detailsButtonText}>{expanded ? 'Hide details' : 'View details'}</Text>
                </Pressable>
                {['pending', 'confirmed'].includes(shipment.status) && (
                  <Pressable
                    style={styles.cancelPkgButton}
                    disabled={cancellingShipmentId === shipment._id}
                    onPress={() => onCancelShipmentPress(shipment)}
                  >
                    <Text style={styles.cancelPkgButtonText}>
                      {cancellingShipmentId === shipment._id ? 'Cancelling…' : 'Cancel package'}
                    </Text>
                  </Pressable>
                )}
              </View>

              {expanded && (
                <View style={styles.expandedBlock}>
                  <View style={styles.moneyLine}>
                    <Text style={styles.moneyLineText}>Items {formatRs(shipment.sellerSubtotal || 0)}</Text>
                    <Text style={styles.moneyDot}>·</Text>
                    <Text style={styles.moneyLineText}>
                      Delivery {shipment.deliveryCharge === 0 ? <Text style={styles.freeText}>FREE</Text> : formatRs(shipment.deliveryCharge)}
                    </Text>
                    {shipment.couponAllocation > 0 && (
                      <>
                        <Text style={styles.moneyDot}>·</Text>
                        <Text style={styles.voucherText}>voucher −{formatRs(shipment.couponAllocation)}</Text>
                      </>
                    )}
                  </View>
                  {shipment.deliveryAgent && (
                    <Text style={styles.agentText}>
                      🚚 Delivery agent: <Text style={styles.agentBold}>{shipment.deliveryAgent.firstName} {shipment.deliveryAgent.lastName}</Text>
                      {shipment.deliveryAgent.phone && ` · ${shipment.deliveryAgent.phone}`}
                    </Text>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {/* Footer — raw order fields only, no Paid/To-pay bucket (STOP case, see top-of-file comment) */}
        <View style={styles.footer}>
          <View style={styles.footerMoneyRow}>
            <Text style={styles.footerText}>Subtotal {formatRs(order.subtotal)}</Text>
            <Text style={styles.moneyDot}>·</Text>
            <Text style={styles.footerText}>
              Delivery{order.shipments?.length > 1 ? ` (${order.shipments.length} packages)` : ''} {formatRs(order.deliveryCharge)}
            </Text>
            {order.couponDiscount > 0 && (
              <>
                <Text style={styles.moneyDot}>·</Text>
                <Text style={styles.voucherText}>Coupon −{formatRs(order.couponDiscount)}</Text>
              </>
            )}
            <Text style={styles.moneyDot}>·</Text>
            <Text style={styles.footerTotal}>Total {formatRs(order.total)}</Text>
            <Text style={styles.footerMethod}>({order.paymentMethod.replace(/_/g, ' ')})</Text>
          </View>
          <View style={styles.footerActions}>
            <Pressable style={styles.detailsLinkButton} onPress={() => router.push(`/(customer)/order/${order._id}`)}>
              <Text style={styles.detailsLinkText}>Order details</Text>
            </Pressable>
            {['pending', 'confirmed', 'packed'].includes(order.status) && (
              <Pressable
                style={styles.cancelPkgButton}
                disabled={cancellingOrderId === order._id}
                onPress={onCancelOrderPress}
              >
                <Text style={styles.cancelPkgButtonText}>
                  {cancellingOrderId === order._id ? 'Cancelling…' : 'Cancel whole order'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  filterRow: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
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
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  cardHeaderRight: { alignItems: 'flex-end' },
  cardHeaderLabel: { fontSize: 10.5, color: COLORS.tabInactive },
  cardHeaderValue: { fontSize: 13, fontWeight: '600', color: COLORS.text, fontVariant: ['tabular-nums'] },
  cardHeaderDate: { fontSize: 13, color: COLORS.text },
  cardHeaderStatusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  badge: { borderRadius: RADII.pill, paddingHorizontal: 12, paddingVertical: 5 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  body: { padding: SPACING.lg },
  itemList: { gap: SPACING.sm + 2, marginBottom: SPACING.md },
  itemRow: { flexDirection: 'row', gap: SPACING.sm + 2 },
  itemImage: { width: 52, height: 52, borderRadius: RADII.sm, backgroundColor: COLORS.surface },
  itemImageFallback: { alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1, justifyContent: 'center' },
  itemName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  itemMeta: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 },
  packagesNote: { fontSize: 11, fontWeight: '700', color: COLORS.tabInactive, textTransform: 'uppercase', marginBottom: SPACING.sm },
  packageBlock: { marginBottom: SPACING.md, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  packageHeaderRow: { marginBottom: SPACING.sm },
  packageHeaderText: { fontSize: 12.5, fontWeight: '600', color: COLORS.text },
  packageHeaderSeller: { fontWeight: '400', color: COLORS.tabInactive },
  packageHeaderMeta: { fontSize: 11, color: COLORS.tabInactive, marginTop: 1 },
  returnBadge: { alignSelf: 'flex-start', backgroundColor: '#FFEDD5', borderRadius: RADII.pill, paddingHorizontal: 10, paddingVertical: 4, marginBottom: SPACING.sm },
  returnBadgeText: { fontSize: 11, fontWeight: '600', color: COLORS.accent },
  returnRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm, marginTop: SPACING.sm },
  returnTimeText: { fontSize: 11.5, color: COLORS.accent },
  returnTimeBold: { fontWeight: '700' },
  returnExpiredText: { fontSize: 11.5, color: COLORS.tabInactive },
  returnButton: { borderWidth: 1, borderColor: '#FED7AA', borderRadius: RADII.sm, paddingHorizontal: 10, paddingVertical: 6 },
  returnButtonText: { fontSize: 11.5, fontWeight: '600', color: COLORS.accent },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  detailsButton: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADII.sm, paddingHorizontal: 10, paddingVertical: 6 },
  detailsButtonText: { fontSize: 11.5, fontWeight: '600', color: COLORS.textMuted },
  cancelPkgButton: { borderWidth: 1, borderColor: '#FECACA', borderRadius: RADII.sm, paddingHorizontal: 10, paddingVertical: 6 },
  cancelPkgButtonText: { fontSize: 11.5, fontWeight: '600', color: COLORS.danger },
  expandedBlock: { marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border, gap: SPACING.xs },
  moneyLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  moneyLineText: { fontSize: 11.5, color: COLORS.textMuted },
  moneyDot: { fontSize: 11.5, color: COLORS.border },
  freeText: { color: COLORS.success, fontWeight: '600' },
  voucherText: { fontSize: 11.5, color: COLORS.success },
  agentText: { fontSize: 11.5, color: COLORS.textMuted },
  agentBold: { fontWeight: '600' },
  footer: { marginTop: SPACING.sm, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border, gap: SPACING.sm },
  footerMoneyRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  footerText: { fontSize: 12.5, color: COLORS.textMuted },
  footerTotal: { fontSize: 12.5, fontWeight: '700', color: COLORS.text },
  footerMethod: { fontSize: 10.5, color: COLORS.tabInactive, marginLeft: 2 },
  footerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  detailsLinkButton: { borderWidth: 1, borderColor: '#C7D2FE', borderRadius: RADII.sm, paddingHorizontal: 10, paddingVertical: 6 },
  detailsLinkText: { fontSize: 11.5, fontWeight: '600', color: COLORS.primary },
});
