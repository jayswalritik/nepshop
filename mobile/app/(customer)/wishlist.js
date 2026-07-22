import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useWishlist } from '../../src/context/WishlistContext';
import { addToCart } from '../../src/utils/cart';
import API from '../../src/utils/api';
import AppHero from '../../src/components/AppHero';
import ProductCard from '../../src/components/ProductCard';
import RecommendationRail from '../../src/components/RecommendationRail';
import Toast from '../../src/components/Toast';
import { COLORS, RADII, SPACING } from '../../src/constants/colors';

// Pushed hidden route (mobile/src/navigation/roleNavConfig.js's
// hiddenRoutes), reached from the Account tab's "Wishlist" row — mirrors
// frontend/src/pages/customer/WishlistPage.jsx's grid (image, discount
// badge, remove-heart, name, price, Add to Cart / Out of Stock), reusing
// mobile's shared ProductCard the same way Home/Products/Search already do
// (web instead hand-rolls a bespoke card here, but mobile has consistently
// used ONE shared card component across every context it appears in).
// Also includes web's "💖 More You'll Love" rail (GET /recommendations/
// wishlist), now in scope — was deliberately parked out of scope by the
// prior wishlist task, closed here as part of the rec-parity audit.
//
// STANDING RULE: hidden-route screens showing server state stay mounted in
// the background (React Navigation doesn't unmount href:null Tabs.Screen
// entries) — useFocusEffect refetches on every focus, never a mount-only
// useEffect (the exact bug class the Checkout staleness fix addressed
// earlier). Also explicitly refetches after removing an item, since the
// screen doesn't lose focus during that in-place action.
export default function WishlistScreen() {
  const { wishlist, isWished, toggleWish, fetchWishlist } = useWishlist();
  const [refreshing, setRefreshing] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const [toast, setToast] = useState(null);

  const [moreRecs, setMoreRecs] = useState([]);
  const [moreRecsLoading, setMoreRecsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      fetchWishlist();
    }, [fetchWishlist])
  );

  // Same trigger web uses — refetch whenever the wishlist's product-id set
  // changes (not just on focus), same signature-as-dependency technique as
  // WishlistPage.jsx's WishlistRecommendations (wishlistSignature prop).
  const wishlistSignature = wishlist.map((p) => p._id).join(',');
  useEffect(() => {
    let active = true;
    const fetchMoreRecs = async () => {
      setMoreRecsLoading(true);
      try {
        const { data } = await API.get('/recommendations/wishlist?limit=8');
        if (active) setMoreRecs(data.products || []);
      } catch {
        if (active) setMoreRecs([]);
      } finally {
        if (active) setMoreRecsLoading(false);
      }
    };
    fetchMoreRecs();
    return () => { active = false; };
  }, [wishlistSignature]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchWishlist();
    setRefreshing(false);
  };

  const handleRemove = (productId) => {
    toggleWish(productId); // wishlist screen only ever shows wished items, so this always removes
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
    <SafeAreaView style={styles.screen} edges={[]}>
      <AppHero
        title="My Wishlist"
        wordmarkSuffix=" · Customer"
        onBack={() => router.back()}
        subtitle={wishlist.length ? `${wishlist.length} item${wishlist.length > 1 ? 's' : ''}` : undefined}
      />

      {wishlist.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
        >
          <View style={styles.centerFill}>
            <Text style={styles.emptyGlyph}>❤️</Text>
            <Text style={styles.emptyTitle}>Your wishlist is empty</Text>
            <Text style={styles.emptyBody}>Save products you love by tapping the heart icon</Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.grid}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
        >
          <View style={styles.gridRow}>
            {wishlist.map((product) => (
              <ProductCard
                key={product._id}
                product={product}
                style={styles.gridCard}
                adding={addingId === product._id}
                onPress={() => goToProduct(product)}
                onAddToCart={() => handleAddToCart(product)}
                isWished={isWished(product._id)}
                onToggleWish={() => handleRemove(product._id)}
              />
            ))}
          </View>

          <View style={styles.recsWrap}>
            <RecommendationRail
              title="💖 More You'll Love"
              subtitle="Based on your wishlist"
              products={moreRecs}
              loading={moreRecsLoading}
              onProduct={goToProduct}
              onAddToCart={handleAddToCart}
            />
          </View>
        </ScrollView>
      )}

      <Toast toast={toast} onHide={() => setToast(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: SPACING.xl },
  emptyContainer: { flexGrow: 1 },
  emptyGlyph: { fontSize: 44, marginBottom: SPACING.sm },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  emptyBody: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
  scrollView: { flex: 1, backgroundColor: COLORS.background },
  grid: { padding: SPACING.lg, paddingBottom: 32 },
  gridRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  gridCard: { width: '47%' },
  recsWrap: { marginTop: SPACING.xl },
});
