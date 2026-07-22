import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import API from '../../src/utils/api';
import { addToCart } from '../../src/utils/cart';
import { useWishlist } from '../../src/context/WishlistContext';
import ProductCard from '../../src/components/ProductCard';
import AppHero from '../../src/components/AppHero';
import Toast from '../../src/components/Toast';
import { COLORS, RADII, SHADOWS, SPACING } from '../../src/constants/colors';
import { CATEGORIES } from '../../src/constants/categories';

const CATEGORY_NAMES = CATEGORIES.map((c) => c.name);
const PAGE_LIMIT = 12;

// Exact sort <option> values from frontend/src/pages/customer/
// ProductsPage.jsx (lines ~121-124) — param names sent to GET /products
// must match the backend's sortMap in productController.js getAllProducts.
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'top_rated', label: 'Top Rated' },
];

// ROOT CAUSE of the clipped chips (two compounding issues):
// 1) This was a horizontal FlatList with a hand-guessed fixed `height` on
//    its outer style — replaced with a plain ScrollView (below) so nothing
//    needs to be guessed.
// 2) The chip Text had no explicit `lineHeight`. With fontWeight 600/700 on
//    a system font (no dedicated bold font file), Android renders via
//    synthetic/"fake" bold — the first layout pass measures the regular
//    glyph metrics, then a second pass re-measures after the bold synthesis
//    is applied, which can shrink the measured text height. Since the
//    chip's own height comes from its Text content, this reproduces exactly
//    "renders full-size for a frame, then clips" — and clips the chip
//    itself, not just the row. Fix: give the text an explicit lineHeight so
//    its box is deterministic from the first layout pass, plus a minHeight
//    on the chip as a floor (a floor can only prevent clipping, never cause
//    it, unlike a fixed height).

// Column count derives from available width instead of a constant tuned to
// one device — 2 on a narrow phone, more as the window gets wider (a large
// phone in landscape, a tablet, a resized web/emulator window).
const columnsForWidth = (width) => {
  if (width >= 900) return 4;
  if (width >= 600) return 3;
  return 2;
};

export default function ProductsScreen() {
  // Home's category tiles navigate here with a `category` param — re-sync
  // if it changes while this (hidden tab) screen stays mounted.
  const params = useLocalSearchParams();
  const { isWished, toggleWish } = useWishlist();
  const { width } = useWindowDimensions();
  const columns = columnsForWidth(width);
  const [category, setCategory] = useState(params.category || '');
  const [sort, setSort] = useState('newest');
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (params.category !== undefined && params.category !== category) {
      setCategory(params.category);
    }
  }, [params.category]);

  const fetchPage = useCallback(async (pageNum, cat, sortValue, replace) => {
    if (replace) setLoading(true);
    else setLoadingMore(true);
    try {
      const queryParams = new URLSearchParams({ page: pageNum, limit: PAGE_LIMIT, sort: sortValue });
      if (cat) queryParams.append('category', cat);
      const { data } = await API.get(`/products?${queryParams}`);
      setProducts((prev) => (replace ? data.products : [...prev, ...data.products]));
      setTotalPages(data.totalPages);
      setTotal(data.total);
      setPage(pageNum);
    } catch {
      // keep whatever was already loaded
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Category or sort changing resets to page 1 — both params combine on the
  // same request (URLSearchParams above just appends both when present).
  useEffect(() => {
    fetchPage(1, category, sort, true);
  }, [category, sort]);

  const handleLoadMore = () => {
    if (loading || loadingMore || page >= totalPages) return;
    fetchPage(page + 1, category, sort, false);
  };

  const handleAddToCart = async (product) => {
    setAddingId(product._id);
    const result = await addToCart(product._id, 1);
    setAddingId(null);
    setToast(
      result.success
        ? { type: 'success', message: `"${product.name}" added to cart!` }
        : { type: 'error', message: result.message }
    );
  };

  const goToProduct = (product) => {
    router.push(`/(customer)/product/${product._id}`);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AppHero
        title="All Products"
        wordmarkSuffix=" · Customer"
        onBack={() => router.back()}
        subtitle={
          !loading
            ? `${total} product${total !== 1 ? 's' : ''}${category ? ` in "${category}"` : ''}`
            : undefined
        }
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chipRowContent}
      >
        {['', ...CATEGORY_NAMES].map((item) => (
          <Pressable
            key={item || 'all'}
            style={[styles.chip, category === item && styles.chipActive]}
            onPress={() => setCategory(item)}
          >
            <Text style={[styles.chipText, category === item && styles.chipTextActive]}>
              {item || 'All'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.chipRow, styles.sortRow]}
        contentContainerStyle={styles.chipRowContent}
      >
        {SORT_OPTIONS.map((item) => (
          <Pressable
            key={item.value}
            style={[styles.sortChip, sort === item.value && styles.chipActive]}
            onPress={() => setSort(item.value)}
          >
            <Ionicons
              name="swap-vertical"
              size={12}
              color={sort === item.value ? '#fff' : COLORS.textMuted}
            />
            <Text style={[styles.chipText, sort === item.value && styles.chipTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : products.length === 0 ? (
        <View style={styles.centerFill}>
          <Ionicons name="cube-outline" size={40} color={COLORS.tabInactive} />
          <Text style={styles.emptyTitle}>No products found</Text>
          <Text style={styles.emptyBody}>Try a different category</Text>
        </View>
      ) : (
        <FlatList
          key={columns}
          style={styles.gridList}
          data={products}
          keyExtractor={(item) => item._id}
          numColumns={columns}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          onEndReachedThreshold={0.4}
          onEndReached={handleLoadMore}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              style={styles.gridCard}
              adding={addingId === item._id}
              onPress={() => goToProduct(item)}
              onAddToCart={() => handleAddToCart(item)}
              isWished={isWished(item._id)}
              onToggleWish={() => toggleWish(item._id)}
            />
          )}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.footerLoader} color={COLORS.primary} />
            ) : null
          }
        />
      )}

      <Toast toast={toast} onHide={() => setToast(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  chipRow: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sortRow: {
    borderBottomWidth: 1,
  },
  chipRowContent: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
    alignItems: 'center',
  },
  chip: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.surface,
  },
  sortChip: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.surface,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    ...SHADOWS.card,
  },
  chipText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  chipTextActive: {
    color: '#fff',
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 4,
  },
  emptyBody: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  gridList: {
    flex: 1,
  },
  grid: {
    padding: SPACING.lg,
    paddingBottom: 32,
  },
  gridRow: {
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  gridCard: {
    flex: 1,
  },
  footerLoader: {
    marginVertical: SPACING.lg,
  },
});
