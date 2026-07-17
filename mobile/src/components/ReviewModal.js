import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { submitReview } from '../utils/reviews';
import { COLORS, RADII, SHADOWS, SPACING } from '../constants/colors';

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

// Mirrors frontend/src/pages/customer/OrdersPage.jsx's ReviewModal exactly:
// product header, star picker (1-5, label under it), comment field
// (500-char limit + counter), Cancel/Submit. Validation is the same
// client-side pair web does (must pick a star, must write something) —
// everything else (delivered-shipment eligibility, one-review-per-order,
// ownership) is enforced server-side and surfaced verbatim via `error`,
// same as web's err.response?.data?.message handling.
export default function ReviewModal({ item, orderId, onClose, onSuccess }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!item) return null;

  const handleSubmit = async () => {
    if (!rating) { setError('Please select a rating'); return; }
    if (!comment.trim()) { setError('Please write a comment'); return; }

    setLoading(true);
    setError('');
    const result = await submitReview({
      productId: item.product,
      orderId,
      rating,
      comment,
    });
    setLoading(false);
    if (result.success) {
      onSuccess();
    } else {
      setError(result.message);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Write a Review</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={COLORS.tabInactive} />
            </Pressable>
          </View>

          <View style={styles.productRow}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={styles.productImage} />
            ) : (
              <View style={[styles.productImage, styles.productImageFallback]}>
                <Ionicons name="image-outline" size={18} color={COLORS.tabInactive} />
              </View>
            )}
            <View style={styles.productInfo}>
              <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
              <Text style={styles.productMeta}>Qty: {item.quantity}</Text>
            </View>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Your Rating *</Text>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable key={star} onPress={() => setRating(star)} hitSlop={4}>
                <Ionicons
                  name={star <= rating ? 'star' : 'star-outline'}
                  size={32}
                  color={star <= rating ? COLORS.star : COLORS.border}
                  style={styles.starIcon}
                />
              </Pressable>
            ))}
          </View>
          {rating > 0 && <Text style={styles.ratingLabel}>{RATING_LABELS[rating]}</Text>}

          <Text style={[styles.label, styles.commentLabel]}>Your Review *</Text>
          <TextInput
            style={styles.commentInput}
            value={comment}
            onChangeText={(t) => t.length <= 500 && setComment(t)}
            placeholder="Share your experience with this product..."
            placeholderTextColor={COLORS.tabInactive}
            multiline
            numberOfLines={4}
            maxLength={500}
          />
          <Text style={styles.charCount}>{comment.length}/500</Text>

          <View style={styles.buttonRow}>
            <Pressable style={styles.cancelButton} onPress={onClose} disabled={loading}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.submitButton} onPress={handleSubmit} disabled={loading}>
              <Text style={styles.submitButtonText}>{loading ? 'Submitting…' : '⭐ Submit Review'}</Text>
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
    maxWidth: 420,
    backgroundColor: COLORS.background,
    borderRadius: RADII.xl,
    padding: SPACING.xl,
    ...SHADOWS.floating,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  productRow: {
    flexDirection: 'row',
    gap: SPACING.sm + 2,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    padding: SPACING.sm + 2,
    marginBottom: SPACING.lg,
  },
  productImage: {
    width: 52,
    height: 52,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.card,
  },
  productImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  productInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  productName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  productMeta: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  errorBox: {
    backgroundColor: COLORS.dangerSoft,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    marginBottom: SPACING.md,
  },
  errorText: {
    fontSize: 12.5,
    color: COLORS.danger,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  commentLabel: {
    marginTop: SPACING.md,
  },
  starRow: {
    flexDirection: 'row',
    gap: SPACING.xs + 2,
  },
  starIcon: {
    marginRight: 2,
  },
  ratingLabel: {
    fontSize: 11.5,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    fontSize: 13,
    color: COLORS.text,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 11,
    color: COLORS.tabInactive,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: SPACING.lg,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: SPACING.sm + 2,
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
    backgroundColor: COLORS.primary,
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
