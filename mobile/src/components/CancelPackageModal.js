import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADII, SHADOWS, SPACING } from '../constants/colors';
import { formatRs } from '../utils/format';

// Mirrors frontend/src/pages/customer/OrdersPage.jsx's CancelPackageModal
// exactly, including the Rs figure — sourced from GET /orders/:id/summary's
// per-shipment `cancelRefundPreview` (backend/utils/orderSummary.js's
// shipmentPayable, the server-side twin of web's client-computed
// `round2(sellerSubtotal + deliveryCharge - couponAllocation)`). Nothing is
// computed here; `refundPreview` is a plain number (or null) handed down by
// the caller, which is responsible for fetching it.
export default function CancelPackageModal({ order, shipment, loading, refundPreview, previewLoading, onClose, onConfirm }) {
  if (!shipment) return null;
  const willRefund = order.paymentStatus === 'paid';
  const itemCount = shipment.items?.length || 0;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Cancel this package?</Text>
          <Text style={styles.body}>
            {itemCount} item{itemCount > 1 ? 's' : ''} in this package will be cancelled and the stock restored.
          </Text>

          <View style={styles.infoBox}>
            {previewLoading && refundPreview == null ? (
              <View style={styles.previewLoadingRow}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.infoText}>Calculating…</Text>
              </View>
            ) : (
              <Text style={styles.infoText}>
                {refundPreview != null
                  ? willRefund
                    ? `${formatRs(refundPreview)} will be refunded to your original payment method.`
                    : `You will no longer owe ${formatRs(refundPreview)} for this package.`
                  : willRefund
                    ? 'A refund will be processed to your original payment method.'
                    : "You will no longer owe for this package — it won't be collected on delivery."}
              </Text>
            )}
          </View>

          <View style={styles.row}>
            <Pressable style={styles.keepButton} onPress={onClose} disabled={loading}>
              <Text style={styles.keepButtonText}>Keep package</Text>
            </Pressable>
            <Pressable style={styles.cancelButton} onPress={onConfirm} disabled={loading}>
              <Text style={styles.cancelButtonText}>{loading ? 'Cancelling…' : 'Cancel package'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: COLORS.background,
    borderRadius: RADII.xl,
    padding: SPACING.xl,
    ...SHADOWS.floating,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },
  body: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
    lineHeight: 19,
  },
  infoBox: {
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  infoText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
    lineHeight: 18,
  },
  previewLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.sm + 2,
  },
  keepButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingVertical: SPACING.md - 1,
    alignItems: 'center',
  },
  keepButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.danger,
    borderRadius: RADII.md,
    paddingVertical: SPACING.md - 1,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});
