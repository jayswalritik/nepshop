import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADII, SHADOWS, SPACING } from '../constants/colors';
import { getDisplayPrice, formatRs } from '../utils/format';

// Shared by the Home rails and the product grid. Sizing is controlled by the
// parent via `style` (e.g. a fixed width in a horizontal rail, flex:1 in a
// grid row) — the card itself doesn't assume a layout context. Badge/price
// presentation mirrors frontend/src/pages/customer/ProductsPage.jsx's grid
// card: discount badge top-left, low-stock badge bottom-left, strike-through
// original price next to the discounted one.
export default function ProductCard({ product, onPress, onAddToCart, adding, showReason, style }) {
  const [imgState, setImgState] = useState('loading'); // loading | loaded | error
  const imageUrl = product.images?.[0]?.url;
  const outOfStock = product.stock === 0;
  const lowStock = product.stock > 0 && product.stock <= 5;

  return (
    <Pressable style={[styles.card, style]} onPress={onPress}>
      <View style={styles.imageWrap}>
        {imageUrl && imgState !== 'error' ? (
          <>
            <Image
              source={{ uri: imageUrl }}
              style={styles.image}
              onLoad={() => setImgState('loaded')}
              onError={() => setImgState('error')}
            />
            {imgState === 'loading' && (
              <View style={styles.imagePlaceholder}>
                <ActivityIndicator size="small" color={COLORS.tabInactive} />
              </View>
            )}
          </>
        ) : (
          <View style={styles.imageFallback}>
            <Ionicons name="image-outline" size={28} color={COLORS.tabInactive} />
          </View>
        )}

        {product.discount > 0 && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountBadgeText}>{product.discount}% OFF</Text>
          </View>
        )}
        {lowStock && (
          <View style={styles.lowStockBadge}>
            <Text style={styles.lowStockBadgeText}>Only {product.stock} left</Text>
          </View>
        )}
      </View>

      <View style={styles.info}>
        {showReason && product._reason ? (
          <Text style={styles.reason} numberOfLines={1}>{product._reason}</Text>
        ) : null}

        <Text style={styles.name} numberOfLines={2}>{product.name}</Text>

        <View style={styles.ratingRow}>
          {product.rating > 0 ? (
            <>
              <Ionicons name="star" size={11} color={COLORS.star} />
              <Text style={styles.ratingText}>{product.rating.toFixed(1)}</Text>
            </>
          ) : (
            <Text style={styles.noRating}>No reviews</Text>
          )}
        </View>

        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatRs(getDisplayPrice(product))}</Text>
          {product.discount > 0 && (
            <Text style={styles.strikePrice}>{formatRs(product.price)}</Text>
          )}
        </View>

        <Pressable
          style={[styles.addButton, (outOfStock || adding) && styles.addButtonDisabled]}
          disabled={outOfStock || adding}
          onPress={() => onAddToCart && onAddToCart()}
        >
          <Text style={styles.addButtonText}>
            {adding ? '…' : outOfStock ? 'Out of stock' : '+ Cart'}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  imageWrap: {
    width: '100%',
    aspectRatio: 1.15,
    backgroundColor: COLORS.surface,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  imageFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  discountBadge: {
    position: 'absolute',
    top: SPACING.sm,
    left: SPACING.sm,
    backgroundColor: COLORS.accent,
    borderRadius: RADII.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  discountBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  lowStockBadge: {
    position: 'absolute',
    bottom: SPACING.sm,
    left: SPACING.sm,
    backgroundColor: COLORS.danger,
    borderRadius: RADII.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  lowStockBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  info: {
    padding: SPACING.md,
    paddingTop: SPACING.sm,
  },
  reason: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.primary,
    backgroundColor: COLORS.surface,
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADII.pill,
    marginBottom: 4,
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 17,
    marginBottom: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: SPACING.xs + 2,
    height: 14,
  },
  ratingText: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  noRating: {
    fontSize: 10,
    color: COLORS.tabInactive,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.sm,
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  strikePrice: {
    fontSize: 11,
    color: COLORS.tabInactive,
    textDecorationLine: 'line-through',
  },
  addButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADII.sm,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
