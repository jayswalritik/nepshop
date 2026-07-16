import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import API from '../../../src/utils/api';
import { addToCart } from '../../../src/utils/cart';
import ScreenHeader from '../../../src/components/ScreenHeader';
import Toast from '../../../src/components/Toast';
import { COLORS, RADII, SHADOWS, SPACING } from '../../../src/constants/colors';
import { getDisplayPrice, formatRs } from '../../../src/utils/format';

// Not a modal, unlike frontend/src/pages/customer/ProductsPage.jsx's
// ProductDetailModal — mobile pattern is a pushed screen, routed as
// app/(customer)/product/[id].js (registered as a hidden tab, see
// src/navigation/RoleTabs.js). Similar/Bought-together/Also-bought rails
// from the web modal aren't part of this task's scope, so they're omitted.
export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams();
  // useWindowDimensions (not Dimensions.get, captured once at module load)
  // so the gallery stays correctly sized across rotation/resize.
  const { width: screenWidth } = useWindowDimensions();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState(null);
  const galleryRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setQuantity(1);
    setActiveImage(0);

    API.get(`/products/${id}`)
      .then(({ data }) => { if (!cancelled) setProduct(data.product); })
      .catch(() => { if (!cancelled) setNotFound(true); })
      .finally(() => { if (!cancelled) setLoading(false); });

    // Fire-and-forget view tracking — same as web's ProductDetailModal
    // (frontend/src/pages/customer/ProductsPage.jsx trackView()). Recording
    // happens server-side from this call; nothing else to do client-side.
    API.post(`/recommendations/track-view/${id}`).catch(() => {});

    setReviewsLoading(true);
    API.get(`/reviews/${id}`)
      .then(({ data }) => { if (!cancelled) setReviews(data.reviews || []); })
      .catch(() => { if (!cancelled) setReviews([]); })
      .finally(() => { if (!cancelled) setReviewsLoading(false); });

    return () => { cancelled = true; };
  }, [id]);

  const handleAddToCart = async () => {
    setAdding(true);
    const result = await addToCart(product._id, quantity);
    setAdding(false);
    setToast(
      result.success
        ? { type: 'success', message: `"${product.name}" added to cart!` }
        : { type: 'error', message: result.message }
    );
  };

  const scrollToImage = (index) => {
    setActiveImage(index);
    galleryRef.current?.scrollToIndex({ index, animated: true });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <ScreenHeader title="Product" onBack={() => router.back()} />
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (notFound || !product) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <ScreenHeader title="Product" onBack={() => router.back()} />
        <View style={styles.centerFill}>
          <Ionicons name="alert-circle-outline" size={40} color={COLORS.tabInactive} />
          <Text style={styles.emptyTitle}>Product not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const images = product.images || [];
  const outOfStock = product.stock === 0;
  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader title={product.name} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        {images.length > 0 ? (
          <>
            <View>
              <FlatList
                ref={galleryRef}
                data={images}
                keyExtractor={(_, i) => String(i)}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                  setActiveImage(idx);
                }}
                renderItem={({ item }) => (
                  <Image
                    source={{ uri: item.url }}
                    style={[styles.galleryImage, { width: screenWidth, height: screenWidth * 0.9 }]}
                  />
                )}
              />
              {images.length > 1 && (
                <View style={styles.dotRow} pointerEvents="none">
                  {images.map((_, i) => (
                    <View key={i} style={[styles.dot, activeImage === i && styles.dotActive]} />
                  ))}
                </View>
              )}
            </View>
            {images.length > 1 && (
              <View style={styles.thumbRow}>
                {images.map((img, i) => (
                  <Pressable key={i} onPress={() => scrollToImage(i)}>
                    <Image
                      source={{ uri: img.url }}
                      style={[styles.thumb, activeImage === i && styles.thumbActive]}
                    />
                  </Pressable>
                ))}
              </View>
            )}
          </>
        ) : (
          <View style={[styles.galleryImage, styles.galleryFallback, { width: screenWidth, height: screenWidth * 0.9 }]}>
            <Ionicons name="image-outline" size={48} color={COLORS.tabInactive} />
          </View>
        )}

        <View style={styles.info}>
          <Text style={styles.category}>{product.category}</Text>
          <Text style={styles.name}>{product.name}</Text>
          {product.seller?.shopName && (
            <View style={styles.sellerRow}>
              <Ionicons name="storefront-outline" size={13} color={COLORS.textMuted} />
              <Text style={styles.seller}>{product.seller.shopName}</Text>
            </View>
          )}

          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatRs(getDisplayPrice(product))}</Text>
            {product.discount > 0 && (
              <>
                <Text style={styles.strikePrice}>{formatRs(product.price)}</Text>
                <View style={styles.discountBadge}>
                  <Text style={styles.discountBadgeText}>{product.discount}% OFF</Text>
                </View>
              </>
            )}
          </View>

          <View style={[styles.stockBadge, outOfStock ? styles.stockBadgeOut : styles.stockBadgeIn]}>
            <Text style={[styles.stockBadgeText, outOfStock ? styles.stockTextOut : styles.stockTextIn]}>
              {outOfStock ? 'Out of stock' : `✓ In stock (${product.stock} available)`}
            </Text>
          </View>

          <Text style={styles.sectionHeading}>Description</Text>
          <Text style={styles.description}>{product.description}</Text>

          {/* No separate "specifications" field exists on the Product model
              (backend/models/Product.js) — this is a compact summary of the
              fields the API actually returns, not invented data. */}
          <Text style={styles.sectionHeading}>Specifications</Text>
          <View style={styles.specs}>
            <SpecRow label="Category" value={product.category} />
            <SpecRow label="Seller" value={product.seller?.shopName || '—'} />
            <SpecRow label="Stock" value={outOfStock ? 'Out of stock' : `${product.stock} units`} />
          </View>

          <View style={styles.reviewsSection}>
            <Text style={styles.sectionHeading}>Reviews</Text>
            {reviewsLoading ? (
              <ActivityIndicator color={COLORS.primary} style={styles.reviewsLoader} />
            ) : reviews.length === 0 ? (
              <Text style={styles.noReviews}>No reviews yet — be the first to review!</Text>
            ) : (
              <>
                <View style={styles.avgRatingRow}>
                  <Ionicons name="star" size={16} color={COLORS.star} />
                  <Text style={styles.avgRatingText}>{avgRating}</Text>
                  <Text style={styles.reviewCount}>({reviews.length} reviews)</Text>
                </View>
                {reviews.map((review) => (
                  <View key={review._id} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <Text style={styles.reviewAuthor}>
                        {review.customer?.firstName} {review.customer?.lastName}
                      </Text>
                      <View style={styles.reviewStars}>
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Ionicons
                            key={s}
                            name="star"
                            size={11}
                            color={s <= review.rating ? COLORS.star : COLORS.border}
                          />
                        ))}
                      </View>
                    </View>
                    <Text style={styles.reviewComment}>{review.comment}</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Sticky bottom bar — quantity stepper + Add to Cart, always visible */}
      <View style={styles.stickyBar}>
        {!outOfStock && (
          <View style={styles.stepper}>
            <Pressable
              style={styles.stepperButton}
              onPress={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              <Ionicons name="remove" size={18} color={COLORS.text} />
            </Pressable>
            <Text style={styles.stepperValue}>{quantity}</Text>
            <Pressable
              style={styles.stepperButton}
              onPress={() => setQuantity((q) => Math.min(product.stock, q + 1))}
            >
              <Ionicons name="add" size={18} color={COLORS.text} />
            </Pressable>
          </View>
        )}

        <Pressable
          style={[styles.addButton, (outOfStock || adding) && styles.addButtonDisabled]}
          disabled={outOfStock || adding}
          onPress={handleAddToCart}
        >
          <Text style={styles.addButtonText}>
            {adding ? 'Adding…' : outOfStock ? 'Out of stock' : 'Add to Cart'}
          </Text>
        </Pressable>
      </View>

      <Toast toast={toast} onHide={() => setToast(null)} />
    </SafeAreaView>
  );
}

function SpecRow({ label, value }) {
  return (
    <View style={styles.specRow}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 4,
  },
  content: {
    paddingBottom: 110,
  },
  galleryImage: {
    // width/height come from an inline override (screenWidth, from
    // useWindowDimensions) so it stays correct across rotation/resize.
    backgroundColor: COLORS.surface,
  },
  galleryFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotRow: {
    position: 'absolute',
    bottom: SPACING.md,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 16,
  },
  thumbRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md - 2,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: RADII.sm,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  thumbActive: {
    borderColor: COLORS.primary,
  },
  info: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  category: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADII.pill,
    marginBottom: SPACING.sm,
  },
  name: {
    fontSize: 19,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: SPACING.md,
  },
  seller: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: SPACING.md,
  },
  price: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
  },
  strikePrice: {
    fontSize: 14,
    color: COLORS.tabInactive,
    textDecorationLine: 'line-through',
  },
  discountBadge: {
    backgroundColor: COLORS.accentSoft,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  discountBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.accent,
  },
  stockBadge: {
    alignSelf: 'flex-start',
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.md - 2,
    paddingVertical: 4,
    marginBottom: SPACING.lg - 2,
  },
  stockBadgeIn: {
    backgroundColor: COLORS.successSoft,
  },
  stockBadgeOut: {
    backgroundColor: COLORS.dangerSoft,
  },
  stockBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  stockTextIn: {
    color: COLORS.success,
  },
  stockTextOut: {
    color: COLORS.danger,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textMuted,
    marginBottom: SPACING.lg,
  },
  specs: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: SPACING.md - 2,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  specLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  specValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  reviewsSection: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.lg,
  },
  reviewsLoader: {
    marginTop: SPACING.sm,
  },
  noReviews: {
    fontSize: 13,
    color: COLORS.tabInactive,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
  avgRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.md,
  },
  avgRatingText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  reviewCount: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  reviewCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.sm,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  reviewAuthor: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  reviewStars: {
    flexDirection: 'row',
    gap: 1,
  },
  reviewComment: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 17,
  },
  stickyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    ...SHADOWS.stickyBar,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.sm + 2,
  },
  stepperButton: {
    width: 36,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    minWidth: 30,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  addButton: {
    flex: 1,
    backgroundColor: COLORS.accent,
    borderRadius: RADII.sm + 2,
    paddingVertical: 13,
    alignItems: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
