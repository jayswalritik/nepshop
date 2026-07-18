import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADII, SHADOWS, SPACING } from '../constants/colors';
import { formatRs } from '../utils/format';

// Mirrors frontend/src/pages/delivery/Dashboard.jsx's "Confirm Delivery"
// modal exactly (lines ~392-449): COD shows the collect amount prominently,
// prepaid shows "Paid online — no cash collection needed". `shipment` is the
// enriched object from GET /delivery/orders — customerPayable comes straight
// off it (backend/controllers/deliveryController.js), nothing computed here.
export default function DeliveryConfirmModal({ shipment, loading, onClose, onConfirm }) {
  if (!shipment) return null;
  const isCod = shipment.order?.paymentMethod === 'cash_on_delivery';
  const address = shipment.order?.deliveryAddress;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.glyph}>📦</Text>
          <Text style={styles.title}>Confirm Delivery</Text>
          <Text style={styles.subtitle}>Order #{shipment._id.slice(-8).toUpperCase()}</Text>

          <View style={styles.methodBadgeWrap}>
            <View style={[styles.methodBadge, isCod ? styles.methodBadgeCod : styles.methodBadgePrepaid]}>
              <Text style={[styles.methodBadgeText, { color: isCod ? COLORS.warning : COLORS.success }]}>
                {isCod ? '💵 COD' : '✅ Prepaid'}
              </Text>
            </View>
          </View>

          {isCod ? (
            <View style={styles.collectBox}>
              <Text style={styles.collectLabel}>Collect from customer</Text>
              <Text style={styles.collectAmount}>{formatRs(shipment.customerPayable)}</Text>
            </View>
          ) : (
            <View style={styles.paidBox}>
              <Text style={styles.paidText}>✅ Paid online — no cash collection needed</Text>
            </View>
          )}

          <View style={styles.addressBox}>
            <Text style={styles.addressLabel}>Delivering to:</Text>
            <Text style={styles.addressName}>{address?.fullName}</Text>
            <Text style={styles.addressLine}>{address?.phone}</Text>
            <Text style={styles.addressLine}>{address?.street}, {address?.city}</Text>
          </View>

          <Text style={styles.disclaimer}>
            By confirming, you verify that the order has been successfully delivered to the customer.
          </Text>

          <View style={styles.row}>
            <Pressable style={styles.cancelButton} onPress={onClose} disabled={loading}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.confirmButton} onPress={onConfirm} disabled={loading}>
              <Text style={styles.confirmButtonText}>{loading ? 'Confirming…' : '✓ Confirm Delivery'}</Text>
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
  glyph: { fontSize: 34, textAlign: 'center', marginBottom: SPACING.sm },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginBottom: SPACING.md },
  methodBadgeWrap: { alignItems: 'center', marginBottom: SPACING.md },
  methodBadge: { borderRadius: RADII.pill, paddingHorizontal: 12, paddingVertical: 5 },
  methodBadgeCod: { backgroundColor: COLORS.warningSoft },
  methodBadgePrepaid: { backgroundColor: COLORS.successSoft },
  methodBadgeText: { fontSize: 12.5, fontWeight: '600' },
  collectBox: {
    backgroundColor: COLORS.dangerSoft,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: RADII.md,
    padding: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  collectLabel: { fontSize: 11.5, color: COLORS.danger, marginBottom: 2 },
  collectAmount: { fontSize: 20, fontWeight: '700', color: COLORS.danger },
  paidBox: {
    backgroundColor: COLORS.successSoft,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: RADII.md,
    padding: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  paidText: { fontSize: 13, fontWeight: '600', color: COLORS.success, textAlign: 'center' },
  addressBox: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  addressLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text, marginBottom: 3 },
  addressName: { fontSize: 13.5, color: COLORS.text },
  addressLine: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 1 },
  disclaimer: { fontSize: 11, color: COLORS.tabInactive, textAlign: 'center', marginBottom: SPACING.lg, lineHeight: 16 },
  row: { flexDirection: 'row', gap: SPACING.sm + 2 },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingVertical: SPACING.md - 1,
    alignItems: 'center',
  },
  cancelButtonText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  confirmButton: {
    flex: 1,
    backgroundColor: COLORS.success,
    borderRadius: RADII.md,
    paddingVertical: SPACING.md - 1,
    alignItems: 'center',
  },
  confirmButtonText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
