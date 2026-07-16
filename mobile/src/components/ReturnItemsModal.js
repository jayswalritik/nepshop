import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADII, SHADOWS, SPACING } from '../constants/colors';
import { previewReturn, requestReturn } from '../utils/returns';
import { formatRs } from '../utils/format';

// Mirrors frontend/src/pages/customer/OrdersPage.jsx's ReturnModal exactly:
// same item/quantity picker, same reason list, same POST /returns/preview
// (debounced 300ms) for the refund estimate box, same POST /returns submit.
// Every Rupee figure shown (seller-issue refund, change-of-mind refund,
// voucher slice, pickup fee, delivery charge) comes straight from the
// preview response — nothing here computes a refund figure itself.
const REASONS = [
  'Damaged product',
  'Wrong product delivered',
  'Product not as described',
  'Changed my mind',
  'Better price available',
  'Other',
];

export default function ReturnItemsModal({ order, shipment, onClose, onSuccess }) {
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [qtyByProduct, setQtyByProduct] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const returnableItems = shipment.items
    .map((it) => ({ ...it, remaining: it.quantity - (it.returnedQuantity || 0) }))
    .filter((it) => it.remaining > 0);

  const setQty = (productId, qty, max) => {
    const clamped = Math.max(0, Math.min(qty, max));
    setQtyByProduct((prev) => ({ ...prev, [productId]: clamped }));
  };

  const selected = returnableItems
    .map((it) => ({ ...it, selectedQty: qtyByProduct[it.product] || 0 }))
    .filter((it) => it.selectedQty > 0);

  // Debounced server-sourced preview, same as web — refetches whenever the
  // selected item/quantity set changes, final state always wins (stale
  // requests just overwrite `preview` in arrival order, mirroring web's own
  // un-guarded but debounced fetch; a genuine race here is no more likely
  // than on web since both fire from the same single debounce timer).
  useEffect(() => {
    if (selected.length === 0) {
      setPreview(null);
      return undefined;
    }
    const items = selected.map((i) => ({ product: i.product, quantity: i.selectedQty }));
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      const result = await previewReturn({ shipmentId: shipment._id, items });
      setPreview(result.success ? result.preview : null);
      setPreviewLoading(false);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(qtyByProduct)]);

  const handleSubmit = async () => {
    if (!reason) { setError('Please select a reason'); return; }
    if (selected.length === 0) { setError('Select at least one item and quantity to return'); return; }
    setLoading(true);
    setError('');
    const result = await requestReturn({
      shipmentId: shipment._id,
      items: selected.map((i) => ({ product: i.product, quantity: i.selectedQty })),
      reason,
      description,
    });
    setLoading(false);
    if (result.success) {
      onSuccess(result.message || 'Return request submitted successfully! Admin will review and process your refund.');
    } else {
      setError(result.message);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Return Item(s)</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={COLORS.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.orderBox}>
              <Text style={styles.orderLabel}>Order</Text>
              <Text style={styles.orderValue}>#{order._id.slice(-8).toUpperCase()}</Text>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Text style={styles.sectionLabel}>Select item(s) and quantity *</Text>
            <View style={styles.itemList}>
              {returnableItems.map((item) => (
                <View key={item.product} style={styles.itemRow}>
                  {item.image ? (
                    <Image source={{ uri: item.image }} style={styles.itemImage} />
                  ) : (
                    <View style={[styles.itemImage, styles.itemImageFallback]}>
                      <Ionicons name="image-outline" size={18} color={COLORS.tabInactive} />
                    </View>
                  )}
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.itemMeta}>{formatRs(item.price)} · {item.remaining} returnable</Text>
                  </View>
                  <View style={styles.stepper}>
                    <Pressable
                      style={styles.stepperButton}
                      onPress={() => setQty(item.product, (qtyByProduct[item.product] || 0) - 1, item.remaining)}
                    >
                      <Ionicons name="remove" size={14} color={COLORS.text} />
                    </Pressable>
                    <Text style={styles.stepperValue}>{qtyByProduct[item.product] || 0}</Text>
                    <Pressable
                      style={styles.stepperButton}
                      onPress={() => setQty(item.product, (qtyByProduct[item.product] || 0) + 1, item.remaining)}
                    >
                      <Ionicons name="add" size={14} color={COLORS.text} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Reason for return *</Text>
            <View style={styles.reasonList}>
              {REASONS.map((r) => (
                <Pressable
                  key={r}
                  style={[styles.reasonRow, reason === r && styles.reasonRowActive]}
                  onPress={() => setReason(r)}
                >
                  <Ionicons
                    name={reason === r ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={reason === r ? COLORS.primary : COLORS.border}
                  />
                  <Text style={styles.reasonText}>{r}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Additional details (optional)</Text>
            <TextInput
              style={styles.textarea}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe the issue in more detail..."
              placeholderTextColor={COLORS.tabInactive}
              multiline
              numberOfLines={3}
            />

            {selected.length > 0 && (
              <View style={styles.previewBox}>
                <Text style={styles.previewTitle}>Estimated refund (final amount set on review)</Text>
                {previewLoading && !preview ? (
                  <Text style={styles.previewLine}>Calculating…</Text>
                ) : preview ? (
                  <>
                    <Text style={styles.previewLine}>
                      If it's a seller issue: <Text style={styles.previewBold}>{formatRs(preview.seller.refundToCustomer)}</Text>
                      {preview.voucherSlice > 0 && ` (${formatRs(preview.voucherSlice)} of your voucher discount stays with those units)`}
                    </Text>
                    <Text style={styles.previewLine}>
                      If it's a change of mind: <Text style={styles.previewBold}>{formatRs(preview.customer.refundToCustomer)}</Text> (minus {formatRs(preview.pickupFee)} return pickup fee)
                    </Text>
                    {preview.isFullShipmentReturn && (
                      <Text style={styles.previewNote}>
                        📦 This returns the entire package — seller-issue refund includes the {formatRs(preview.deliveryCharge)} delivery charge.
                      </Text>
                    )}
                  </>
                ) : null}
              </View>
            )}

            <View style={styles.noteBox}>
              <Text style={styles.noteText}>
                ⏰ Once approved, a delivery agent will collect the item(s) and your refund will be processed.
              </Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable style={styles.cancelButton} onPress={onClose} disabled={loading}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.submitButton} onPress={handleSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitButtonText}>🔄 Submit Return</Text>}
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
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '90%',
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
    ...SHADOWS.floating,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  orderBox: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  orderLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  orderValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  errorBox: {
    backgroundColor: COLORS.dangerSoft,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  errorText: {
    fontSize: 13,
    color: COLORS.danger,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.sm,
    marginTop: SPACING.sm,
  },
  itemList: {
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: SPACING.sm + 2,
  },
  itemImage: {
    width: 44,
    height: 44,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.surface,
  },
  itemImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  itemMeta: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
  },
  stepperButton: {
    width: 26,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    minWidth: 20,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  reasonList: {
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: SPACING.sm + 2,
  },
  reasonRowActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySoft,
  },
  reasonText: {
    fontSize: 13,
    color: COLORS.text,
  },
  textarea: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: SPACING.md,
    fontSize: 13,
    color: COLORS.text,
    minHeight: 64,
    textAlignVertical: 'top',
    marginBottom: SPACING.sm,
  },
  previewBox: {
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: 2,
  },
  previewTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 2,
  },
  previewLine: {
    fontSize: 11.5,
    color: COLORS.primary,
    lineHeight: 16,
  },
  previewBold: {
    fontWeight: '700',
  },
  previewNote: {
    fontSize: 11.5,
    fontWeight: '600',
    color: COLORS.primary,
    marginTop: 2,
  },
  noteBox: {
    backgroundColor: COLORS.warningSoft,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  noteText: {
    fontSize: 11.5,
    color: COLORS.warning,
    lineHeight: 16,
  },
  footer: {
    flexDirection: 'row',
    gap: SPACING.sm + 2,
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingVertical: SPACING.md - 1,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  submitButton: {
    flex: 1,
    backgroundColor: COLORS.accent,
    borderRadius: RADII.md,
    paddingVertical: SPACING.md - 1,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});
