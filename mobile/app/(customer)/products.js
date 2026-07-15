import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import API from '../../src/utils/api';
import { addToCart } from '../../src/utils/cart';
import ProductCard from '../../src/components/ProductCard';
import Toast from '../../src/components/Toast';
import { COLORS } from '../../src/constants/colors';

// Same fixed taxonomy the web hardcodes in ProductsPage.jsx/HomePage.jsx —
// there's no /categories endpoint, this IS how the web derives its list.
const CATEGORIES = [
  'Electronics', 'Clothing', 'Food & Grocery', 'Home & Kitchen',
  'Beauty & Health', 'Sports & Outdoors', 'Books & Stationery',
  'Toys & Games', 'Automotive', 'Other',
];

const PAGE_LIMIT = 12;

export default function ProductsScreen() {
  const [category, setCategory] = useState('');
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const [toast, setToast] = useState(null);

  const fetchPage = useCallback(async (pageNum, cat, replace) => {
    if (replace) setLoading(true);
    else setLoadingMore(true);
    try {
      const params = new URLSearchParams({ page: pageNum, limit: PAGE_LIMIT, sort: 'newest' });
      if (cat) params.append('category', cat);
      const { data } = await API.get(`/products?${params}`);
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

  useEffect(() => {
    fetchPage(1, category, true);
  }, [category]);

  const handleLoadMore = () => {
    if (loading || loadingMore || page >= totalPages) return;
    fetchPage(page + 1, category, false);
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
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>All Products</Text>
          {!loading && (
            <Text style={styles.headerSubtitle}>
              {total} product{total !== 1 ? 's' : ''}{category ? ` in "${category}"` : ''}
            </Text>
          )}
        </View>
      </View>

      <FlatList
        style={styles.chipRow}
        data={['', ...CATEGORIES]}
        keyExtractor={(item) => item || 'all'}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRowContent}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.chip, category === item && styles.chipActive]}
            onPress={() => setCategory(item)}
          >
            <Text style={[styles.chipText, category === item && styles.chipTextActive]}>
              {item || 'All'}
            </Text>
          </Pressable>
        )}
      />

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
          data={products}
          keyExtractor={(item) => item._id}
          numColumns={2}
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
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  chipRow: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  chipRowContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
  },
  chipText: {
    fontSize: 13,
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
  grid: {
    padding: 16,
    paddingBottom: 32,
  },
  gridRow: {
    gap: 12,
    marginBottom: 12,
  },
  gridCard: {
    flex: 1,
  },
  footerLoader: {
    marginVertical: 16,
  },
});
