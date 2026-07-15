import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../src/context/AuthContext';
import API from '../../src/utils/api';
import { addToCart } from '../../src/utils/cart';
import RecommendationRail from '../../src/components/RecommendationRail';
import Toast from '../../src/components/Toast';
import { COLORS } from '../../src/constants/colors';

// Mirrors frontend/src/pages/customer/HomePage.jsx's rail set and endpoints
// (Deals → For You → Recently Viewed → Trending → New Arrivals). The
// marketing hero banner and "Shop by Category" tile grid weren't asked for
// here — that scope is covered by the "See all" entry point below and the
// listing screen's own category chips.
const RAIL_DEFS = [
  { key: 'deals', title: '🏷️ Deals & Offers', subtitle: 'Biggest discounts on NepShop right now', path: '/recommendations/deals?limit=12', showReason: false, emptyText: null },
  { key: 'feed', title: '✨ For You', subtitle: 'Based on your shopping history', path: '/recommendations/feed?limit=16', showReason: true, emptyText: null },
  { key: 'recentlyViewed', title: '🕘 Recently Viewed', subtitle: 'Pick up where you left off', path: '/recommendations/recently-viewed?limit=10', showReason: true, emptyText: null },
  { key: 'trending', title: '🔥 Trending Now', subtitle: 'Most popular on NepShop this month', path: '/recommendations/trending?limit=10', showReason: false, emptyText: 'Check back soon — trending products will appear here as orders come in.' },
  { key: 'newArrivals', title: '🆕 New Arrivals', subtitle: 'Freshly added to the marketplace', path: '/recommendations/new-arrivals?limit=12', showReason: false, emptyText: null },
];

const emptyRailState = () =>
  RAIL_DEFS.reduce((acc, r) => ({ ...acc, [r.key]: [] }), {});
const loadingRailState = (value) =>
  RAIL_DEFS.reduce((acc, r) => ({ ...acc, [r.key]: value }), {});

export default function Home() {
  const { user } = useAuth();
  const [rails, setRails] = useState(emptyRailState);
  const [loading, setLoading] = useState(loadingRailState(true));
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState(null);

  // Each rail loads independently — one slow/failing rail never blocks the
  // others, matching HomePage.jsx's per-rail try/catch/finally.
  const fetchRail = useCallback(async (rail) => {
    setLoading((prev) => ({ ...prev, [rail.key]: true }));
    try {
      const { data } = await API.get(rail.path);
      setRails((prev) => ({ ...prev, [rail.key]: data.products || [] }));
    } catch {
      // leave existing data in place on failure
    } finally {
      setLoading((prev) => ({ ...prev, [rail.key]: false }));
    }
  }, []);

  const fetchAll = useCallback(() => {
    RAIL_DEFS.forEach((rail) => fetchRail(rail));
  }, [fetchRail]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Only "Recently Viewed" needs to refresh on refocus (e.g. coming back
  // from a product detail screen) — refetching everything else on every tab
  // focus would be wasteful and isn't what the web does either. Skip the
  // first focus (mount) since fetchAll above already covers it.
  const mountedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!mountedOnce.current) {
        mountedOnce.current = true;
        return;
      }
      fetchRail(RAIL_DEFS[2]);
    }, [fetchRail])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all(RAIL_DEFS.map((rail) => fetchRail(rail)));
    setRefreshing(false);
  }, [fetchRail]);

  const handleAddToCart = async (product) => {
    const result = await addToCart(product._id, 1);
    setToast(
      result.success
        ? { type: 'success', message: `"${product.name}" added to cart!` }
        : { type: 'error', message: result.message }
    );
  };

  const goToProduct = (product) => {
    router.push(`/(customer)/product/${product._id}`);
  };

  const everythingEmpty =
    RAIL_DEFS.every((r) => !loading[r.key]) &&
    RAIL_DEFS.every((r) => rails[r.key].length === 0);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
        }
      >
        <View style={styles.greeting}>
          <Text style={styles.greetingText}>Hi, {user?.firstName} 👋</Text>
          <Text style={styles.greetingSubtext}>Discover products picked for you</Text>
        </View>

        <Pressable
          style={styles.seeAllButton}
          onPress={() => router.push('/(customer)/products')}
        >
          <Text style={styles.seeAllButtonText}>Browse all products →</Text>
        </Pressable>

        {RAIL_DEFS.map((rail) => (
          <RecommendationRail
            key={rail.key}
            title={rail.title}
            subtitle={rail.subtitle}
            products={rails[rail.key]}
            loading={loading[rail.key]}
            showReason={rail.showReason}
            emptyText={rail.emptyText}
            onProduct={goToProduct}
            onAddToCart={handleAddToCart}
          />
        ))}

        {everythingEmpty && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No products yet</Text>
            <Text style={styles.emptyStateBody}>
              Browse all products or check back later as the marketplace grows.
            </Text>
          </View>
        )}
      </ScrollView>

      <Toast toast={toast} onHide={() => setToast(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  greeting: {
    marginBottom: 16,
  },
  greetingText: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  greetingSubtext: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  seeAllButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 22,
  },
  seeAllButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyState: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },
  emptyStateBody: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
