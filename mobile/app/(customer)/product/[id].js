import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import API from '../../../src/utils/api';
import { addToCart } from '../../../src/utils/cart';
import Toast from '../../../src/components/Toast';
import { COLORS } from '../../../src/constants/colors';
import { getDisplayPrice, formatRs } from '../../../src/utils/format';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Not a modal, unlike frontend/src/pages/customer/ProductsPage.jsx's
// ProductDetailModal — mobile pattern is a pushed screen, routed as
// app/(customer)/product/[id].js (registered as a hidden tab, see
// src/navigation/RoleTabs.js). Similar/Bought-together/Also-bought rails
// from the web modal aren't part of this task's scope, so they're omitted.
export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams();
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
      <SafeAreaView style={styles.screen} edges={['top']}>
        <Header title="Product" />
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (notFound || !product) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <Header title="Product" />
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
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Header title={product.name} />
      <ScrollView contentContainerStyle={styles.content}>
        {images.length > 0 ? (
          <>
            <FlatList
              ref={galleryRef}
              data={images}
              keyExtractor={(_, i) => String(i)}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                setActiveImage(idx);
              }}
              renderItem={({ item }) => (
                <Image source={{ uri: item.url }} style={styles.galleryImage} />
              )}
            />
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
          <View style={[styles.galleryImage, styles.galleryFallback]}>
            <Ionicons name="image-outline" size={48} color={COLORS.tabInactive} />
          </View>
        )}

        <View style={styles.info}>
          <Text style={styles.category}>{product.category}</Text>
          <Text style={styles.name}>{product.name}</Text>
          {product.seller?.shopName && (
            <Text style={styles.seller}>by {product.seller.shopName}</Text>
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

          <Text style={styles.description}>{product.description}</Text>

          {/* No separate "specifications" field exists on the Product model
              (backend/models/Product.js) — this is a compact summary of the
              fields the API actually returns, not invented data. */}
          <View style={styles.specs}>
            <SpecRow label="Category" value={product.category} />
            <SpecRow label="Seller" value={product.seller?.shopName || '—'} />
            <SpecRow label="Stock" value={outOfStock ? 'Out of stock' : `${product.stock} units`} />
          </View>

          {!outOfStock && (
            <View style={styles.qtyRow}>
              <Text style={styles.qtyLabel}>Qty:</Text>
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

          <View style={styles.reviewsSection}>
            <Text style={styles.reviewsHeading}>Reviews</Text>
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

      <Toast toast={toast} onHide={() => setToast(null)} />
    </SafeAreaView>
  );
}

function Header({ title }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={10}>
        <Ionicons name="arrow-back" size={22} color={COLORS.text} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
    </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 12,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
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
    paddingBottom: 40,
  },
  galleryImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.9,
    backgroundColor: COLORS.surface,
  },
  galleryFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  thumbActive: {
    borderColor: COLORS.primary,
  },
  info: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  category: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginBottom: 8,
  },
  name: {
    fontSize: 19,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  seller: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 12,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
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
    backgroundColor: '#FFEDD5',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  discountBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.accent,
  },
  stockBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 14,
  },
  stockBadgeIn: {
    backgroundColor: '#DCFCE7',
  },
  stockBadgeOut: {
    backgroundColor: '#FEE2E2',
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
  description: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textMuted,
    marginBottom: 16,
  },
  specs: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    marginBottom: 16,
    gap: 8,
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
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  qtyLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
  },
  stepperButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    minWidth: 32,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  addButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  reviewsSection: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 16,
  },
  reviewsHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  reviewsLoader: {
    marginTop: 8,
  },
  noReviews: {
    fontSize: 13,
    color: COLORS.tabInactive,
    textAlign: 'center',
    paddingVertical: 12,
  },
  avgRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
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
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
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
});
