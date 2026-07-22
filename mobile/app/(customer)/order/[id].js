import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getOrderById, getOrderSummary, cancelShipment } from '../../../src/utils/orders';
import AppHero from '../../../src/components/AppHero';
import Toast from '../../../src/components/Toast';
import OrderStatusStepper, { StatusBadge } from '../../../src/components/OrderStatusStepper';
import CancelPackageModal from '../../../src/components/CancelPackageModal';
import ReturnItemsModal from '../../../src/components/ReturnItemsModal';
import ReviewModal from '../../../src/components/ReviewModal';
import { COLORS, RADII, SHADOWS, SPACING } from '../../../src/constants/colors';
import { formatRs } from '../../../src/utils/format';
import {
  formatStatusLabel,
  returnTimeLeft,
  formatTimeLeft,
  hasReturnableItems,
} from '../../../src/utils/orderStatus';

// Pushed hidden route (mobile/src/navigation/roleNavConfig.js's
// hiddenRoutes) — mobile's equivalent of web's "Order Details" modal
// (frontend/src/pages/customer/OrdersPage.jsx lines ~576-632: order id,
// status, payment, delivery address, note, total) PLUS the per-package
// breakdown web's list already shows inline, PLUS (as of this task) the
// same Paid/To-pay-on-delivery/Refunded footer and per-package cancel/
// return actions the list offers — this screen is no longer read-only.
//
// Refetches on every focus per the standing rule for hidden-route screens
// (useFocusEffect, not mount-only useEffect) — this screen is registered
// via RoleTabs.js's href:null Tabs.Screen, so React Navigation keeps it
// mounted in the background rather than unmounting it, exactly the
// scenario that caused the earlier Checkout staleness bug. Also explicitly
// refetches (order AND summary) right after a successful cancel/return,
// since the screen doesn't lose focus during an in-place modal action.
//
// MONEY DISPLAY: order.subtotal/deliveryCharge/couponDiscount/total and each
// shipment's sellerSubtotal/deliveryCharge/couponAllocation are raw fields
// from GET /orders/:id, zero arithmetic. The Paid/To-pay/Refunded footer and
// each package's cancelRefundPreview come ENTIRELY from
// GET /orders/:id/summary (backend/utils/orderSummary.js) — the server-side
// twin of what OrdersPage.jsx computes client-side. The one piece of boolean
// (non-money) logic still done here is `hasRemovedShipment` — whether to
// show the "Original total" strikethrough — mirrored from web's own
// `shipments.some(isRemoved) && shipments.some(s => !isRemoved(s))` one-
// liner: it's an enum/status comparison, not a Rupee computation, same
// category as the `deliveryCharge === 0 ? 'FREE' : ...` checks already used
// throughout this app.
const CANCEL_ELIGIBLE_STATUSES = ['pending', 'confirmed'];

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams();
  const [order, setOrder] = useState(null);
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [now, setNow] = useState(Date.now());
  const [cancelTarget, setCancelTarget] = useState(null); // shipment
  const [cancellingShipmentId, setCancellingShipmentId] = useState(null);
  const [returnTarget, setReturnTarget] = useState(null); // shipment
  const [reviewItem, setReviewItem] = useState(null);
  const [reviewOrderId, setReviewOrderId] = useState(null);
  const [toast, setToast] = useState(null);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    const result = await getOrderById(id);
    if (result.success) {
      setOrder(result.order);
      setShipments(result.shipments || []);
      setNotFound(false);
    } else {
      setNotFound(true);
    }
    setLoading(false);
  }, [id]);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    const result = await getOrderSummary(id);
    if (result.success) setSummary(result);
    setSummaryLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      fetchOrder();
      fetchSummary();
    }, [fetchOrder, fetchSummary])
  );

  // Live clock — ticks every second so return-window countdowns count down.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const shipmentSummary = (shipmentId) => summary?.shipments.find((s) => s.shipmentId === shipmentId);

  const handleCancelShipment = async () => {
    if (!cancelTarget) return;
    setCancellingShipmentId(cancelTarget._id);
    const result = await cancelShipment(cancelTarget._id);
    setCancellingShipmentId(null);
    setCancelTarget(null);
    if (result.success) {
      setToast({ type: 'success', message: result.message || 'Package cancelled successfully.' });
      fetchOrder();
      fetchSummary();
    } else {
      setToast({ type: 'error', message: result.message });
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <AppHero title="Order Details" onBack={() => router.back()} wordmarkSuffix=" · Customer" />
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (notFound || !order) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <AppHero title="Order Details" onBack={() => router.back()} wordmarkSuffix=" · Customer" />
        <View style={styles.centerFill}>
          <Ionicons name="alert-circle-outline" size={40} color={COLORS.tabInactive} />
          <Text style={styles.emptyTitle}>Order not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isMulti = shipments.length > 1;
  // Same derivation as OrdersPage.jsx's isRemoved/hasRemovedShipment — a
  // status comparison, not money math (see top-of-file comment).
  const isRemoved = (s) => s.status === 'cancelled' || s.status === 'returned';
  const hasRemovedShipment = shipments.some(isRemoved) && shipments.some((s) => !isRemoved(s));

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AppHero title="Order Details" onBack={() => router.back()} wordmarkSuffix=" · Customer" />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Summary */}
        <View style={styles.section}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Order ID</Text>
            <Text style={styles.summaryValueMono}>#{order._id.slice(-8).toUpperCase()}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Placed on</Text>
            <Text style={styles.summaryValue}>
              {new Date(order.createdAt).toLocaleDateString('en-NP', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Status</Text>
            <StatusBadge status={order.status} label={formatStatusLabel(order.status)} />
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Payment</Text>
            <Text style={styles.summaryValue}>{order.paymentMethod.replace(/_/g, ' ')}</Text>
          </View>
          {order.paymentStatus === 'refunded' && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Payment status</Text>
              <Text style={[styles.summaryValue, styles.refundedText]}>💸 Refunded</Text>
            </View>
          )}
        </View>

        {/* Delivery address */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Address</Text>
          <Text style={styles.addressName}>{order.deliveryAddress.fullName}</Text>
          <Text style={styles.addressLine}>{order.deliveryAddress.phone}</Text>
          <Text style={styles.addressLine}>
            {order.deliveryAddress.street}, {order.deliveryAddress.city}, {order.deliveryAddress.district}
          </Text>
          {order.deliveryAddress.landmark ? (
            <Text style={styles.addressLandmark}>Near: {order.deliveryAddress.landmark}</Text>
          ) : null}
        </View>

        {/* Customer note */}
        {order.customerNote ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Note</Text>
            <Text style={styles.noteText}>{order.customerNote}</Text>
          </View>
        ) : null}

        {/* Package breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isMulti ? `Packages (${shipments.length})` : 'Package'}
          </Text>
          {shipments.map((shipment, i) => {
            const sSummary = shipmentSummary(shipment._id);
            const timeLeft = returnTimeLeft(shipment, now);
            const canReturn = shipment.status === 'delivered' && timeLeft > 0 && hasReturnableItems(shipment);
            const canCancel = CANCEL_ELIGIBLE_STATUSES.includes(shipment.status);

            return (
              <View key={shipment._id} style={[styles.packageCard, i > 0 && styles.packageCardSpaced]}>
                {isMulti && (
                  <Text style={styles.packageHeader}>
                    Package {i + 1}
                    {shipment.seller && (
                      <Text style={styles.packageHeaderSeller}>
                        {'  — '}{shipment.seller.shopName || `${shipment.seller.firstName || ''} ${shipment.seller.lastName || ''}`.trim()}
                      </Text>
                    )}
                  </Text>
                )}
                <View style={styles.stepperWrap}>
                  <OrderStatusStepper status={shipment.status} />
                </View>

                {shipment.items.map((item, ii) => (
                  <View key={ii} style={styles.itemRow}>
                    {item.image ? (
                      <Image source={{ uri: item.image }} style={styles.itemImage} />
                    ) : (
                      <View style={[styles.itemImage, styles.itemImageFallback]}>
                        <Ionicons name="image-outline" size={16} color={COLORS.tabInactive} />
                      </View>
                    )}
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                      <Text style={styles.itemMeta}>Qty: {item.quantity} · {formatRs(item.price)} each</Text>
                      {item.couponAllocation > 0 && (
                        <Text style={styles.voucherText}>voucher −{formatRs(item.couponAllocation)}</Text>
                      )}
                    </View>
                    {shipment.status === 'delivered' && (
                      <Pressable
                        style={styles.reviewButton}
                        onPress={() => { setReviewItem(item); setReviewOrderId(order._id); }}
                      >
                        <Text style={styles.reviewButtonText}>⭐ Review</Text>
                      </Pressable>
                    )}
                  </View>
                ))}

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

                {shipment.status === 'delivered' && hasReturnableItems(shipment) && (
                  <View style={styles.returnRow}>
                    {timeLeft > 0 ? (
                      <Text style={styles.returnTimeText}>⏱ Return window: <Text style={styles.returnTimeBold}>{formatTimeLeft(timeLeft)}</Text> left</Text>
                    ) : (
                      <Text style={styles.returnExpiredText}>⛔ Return window expired for this package</Text>
                    )}
                  </View>
                )}

                <View style={styles.actionRow}>
                  {canReturn && (
                    <Pressable style={styles.returnButton} onPress={() => setReturnTarget(shipment)}>
                      <Text style={styles.returnButtonText}>🔄 Return item(s)</Text>
                    </Pressable>
                  )}
                  {canCancel && (
                    <Pressable
                      style={styles.cancelPkgButton}
                      disabled={cancellingShipmentId === shipment._id}
                      onPress={() => setCancelTarget(shipment)}
                    >
                      <Text style={styles.cancelPkgButtonText}>
                        {cancellingShipmentId === shipment._id ? 'Cancelling…' : 'Cancel package'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Order total */}
        <View style={styles.section}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>{formatRs(order.subtotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Delivery{isMulti ? ` (${shipments.length} packages)` : ''}</Text>
            <Text style={styles.summaryValue}>{formatRs(order.deliveryCharge)}</Text>
          </View>
          {order.couponDiscount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Coupon</Text>
              <Text style={styles.voucherText}>−{formatRs(order.couponDiscount)}</Text>
            </View>
          )}
          <View style={styles.totalDivider} />

          {/* Paid / To-pay-on-delivery / Refunded — server-computed via
              GET /orders/:id/summary, mirrors OrdersPage.jsx's footer
              branch-for-branch (see top-of-file comment). */}
          {summaryLoading || !summary ? (
            <View style={styles.summaryLoadingRow}>
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          ) : order.paymentMethod === 'cash_on_delivery' ? (
            <>
              {hasRemovedShipment && (
                <View style={styles.summaryRow}>
                  <Text style={styles.originalTotalLabel}>Original total</Text>
                  <Text style={styles.originalTotalValue}>{formatRs(order.total)}</Text>
                </View>
              )}
              {summary.buckets.paid === 0 && summary.buckets.toPayOnDelivery === 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>{formatRs(order.total)}</Text>
                </View>
              ) : (
                <>
                  {summary.buckets.paid > 0 && (
                    <View style={styles.summaryRow}>
                      <Text style={styles.totalLabel}>Paid</Text>
                      <Text style={[styles.totalValue, styles.paidValue]}>{formatRs(summary.buckets.paid)}</Text>
                    </View>
                  )}
                  {summary.buckets.toPayOnDelivery > 0 && (
                    <View style={styles.summaryRow}>
                      <Text style={styles.totalLabel}>To pay on delivery</Text>
                      <Text style={styles.totalValue}>{formatRs(summary.buckets.toPayOnDelivery)}</Text>
                    </View>
                  )}
                </>
              )}
            </>
          ) : hasRemovedShipment ? (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.originalTotalLabel}>Original total</Text>
                <Text style={styles.originalTotalValue}>{formatRs(order.total)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.totalLabel}>Refunded</Text>
                <Text style={[styles.totalValue, styles.paidValue]}>{formatRs(summary.buckets.refunded)}</Text>
              </View>
            </>
          ) : (
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatRs(order.total)}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {cancelTarget && (
        <CancelPackageModal
          order={order}
          shipment={cancelTarget}
          loading={cancellingShipmentId === cancelTarget._id}
          refundPreview={shipmentSummary(cancelTarget._id)?.cancelRefundPreview ?? null}
          previewLoading={summaryLoading}
          onClose={() => setCancelTarget(null)}
          onConfirm={handleCancelShipment}
        />
      )}

      {returnTarget && (
        <ReturnItemsModal
          order={order}
          shipment={returnTarget}
          onClose={() => setReturnTarget(null)}
          onSuccess={(message) => {
            setReturnTarget(null);
            setToast({ type: 'success', message });
            fetchOrder();
            fetchSummary();
          }}
        />
      )}

      {reviewItem && (
        <ReviewModal
          item={reviewItem}
          orderId={reviewOrderId}
          onClose={() => {
            setReviewItem(null);
            setReviewOrderId(null);
          }}
          onSuccess={() => {
            setReviewItem(null);
            setReviewOrderId(null);
            setToast({ type: 'success', message: 'Review submitted successfully! Thank you.' });
          }}
        />
      )}

      <Toast toast={toast} onHide={() => setToast(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginTop: 4 },
  scrollView: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, paddingBottom: 32 },
  section: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  summaryLabel: { fontSize: 13, color: COLORS.textMuted },
  summaryValue: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  summaryValueMono: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  refundedText: { color: COLORS.success },
  addressName: { fontSize: 13, color: COLORS.text, fontWeight: '600', marginTop: 2 },
  addressLine: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 },
  addressLandmark: { fontSize: 11.5, color: COLORS.tabInactive, marginTop: 2 },
  noteText: { fontSize: 13, color: COLORS.textMuted, fontStyle: 'italic' },
  packageCard: { paddingTop: SPACING.sm },
  packageCardSpaced: { marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  packageHeader: { fontSize: 12.5, fontWeight: '600', color: COLORS.text, marginBottom: SPACING.sm },
  packageHeaderSeller: { fontWeight: '400', color: COLORS.tabInactive },
  stepperWrap: { marginBottom: SPACING.md },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm + 2, marginBottom: SPACING.sm },
  itemImage: { width: 44, height: 44, borderRadius: RADII.sm, backgroundColor: COLORS.surface },
  itemImageFallback: { alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1, justifyContent: 'center' },
  itemName: { fontSize: 12.5, fontWeight: '600', color: COLORS.text },
  itemMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  reviewButton: { borderWidth: 1, borderColor: COLORS.warningSoft, borderRadius: RADII.sm, paddingHorizontal: 10, paddingVertical: 6 },
  reviewButtonText: { fontSize: 11, fontWeight: '600', color: COLORS.warning },
  moneyLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  moneyLineText: { fontSize: 11.5, color: COLORS.textMuted },
  moneyDot: { fontSize: 11.5, color: COLORS.border },
  freeText: { color: COLORS.success, fontWeight: '600' },
  voucherText: { fontSize: 11.5, color: COLORS.success },
  agentText: { fontSize: 11.5, color: COLORS.textMuted, marginTop: SPACING.sm },
  agentBold: { fontWeight: '600' },
  returnRow: { marginTop: SPACING.sm },
  returnTimeText: { fontSize: 11.5, color: COLORS.accent },
  returnTimeBold: { fontWeight: '700' },
  returnExpiredText: { fontSize: 11.5, color: COLORS.tabInactive },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  returnButton: { borderWidth: 1, borderColor: '#FED7AA', borderRadius: RADII.sm, paddingHorizontal: 10, paddingVertical: 6 },
  returnButtonText: { fontSize: 11.5, fontWeight: '600', color: COLORS.accent },
  cancelPkgButton: { borderWidth: 1, borderColor: '#FECACA', borderRadius: RADII.sm, paddingHorizontal: 10, paddingVertical: 6 },
  cancelPkgButtonText: { fontSize: 11.5, fontWeight: '600', color: COLORS.danger },
  totalDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.sm },
  summaryLoadingRow: { paddingVertical: SPACING.sm, alignItems: 'center' },
  originalTotalLabel: { fontSize: 12, color: COLORS.tabInactive },
  originalTotalValue: { fontSize: 12, color: COLORS.tabInactive, textDecorationLine: 'line-through' },
  totalLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  totalValue: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  paidValue: { color: COLORS.success },
});
