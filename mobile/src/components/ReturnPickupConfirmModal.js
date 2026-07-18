import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADII, SHADOWS, SPACING } from '../constants/colors';

// Mirrors frontend/src/pages/delivery/ReturnPickups.jsx's confirm modal
// exactly — same two states (`type`: 'pickup' | 'complete'), same copy. No
// money figures here (the completed-return refund/earning summary is shown
// separately, from the PUT /returns/:id/complete response's own `message`
// string, after this modal closes — see app/(delivery)/returns.js).
export default function ReturnPickupConfirmModal({ confirm, loading, onClose, onConfirm }) {
  if (!confirm) return null;
  const isPickup = confirm.type === 'pickup';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.glyph}>{isPickup ? '📦' : '🏪'}</Text>
          <Text style={styles.title}>{isPickup ? 'Confirm Pickup' : 'Confirm Return to Seller'}</Text>
          <Text style={styles.body}>
            {isPickup
              ? 'Confirm you have collected the item from the customer.'
              : 'Confirm you have delivered the item to the seller. This completes the return and processes the customer refund.'}
          </Text>

          <View style={styles.row}>
            <Pressable style={styles.cancelButton} onPress={onClose} disabled={loading}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.confirmButton} onPress={onConfirm} disabled={loading}>
              <Text style={styles.confirmButtonText}>{loading ? 'Processing…' : 'Confirm'}</Text>
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
  title: { fontSize: 17, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 6 },
  body: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginBottom: SPACING.lg, lineHeight: 19 },
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
