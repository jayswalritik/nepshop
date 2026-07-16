import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../src/context/AuthContext';
import API from '../../src/utils/api';
import { addToCart } from '../../src/utils/cart';
import RecommendationRail from '../../src/components/RecommendationRail';
import Toast from '../../src/components/Toast';
import { COLORS, RADII, SHADOWS, SPACING } from '../../src/constants/colors';
import { CATEGORIES } from '../../src/constants/categories';

// Mirrors frontend/src/pages/customer/HomePage.jsx's rail set and endpoints
// (Deals → For You → Recently Viewed → Trending → New Arrivals).
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
  const insets = useSafeAreaInsets();
  const [rails, setRails] = useState(emptyRailState);
  const [loading, setLoading] = useState(loadingRailState(true));
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState(null);

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
  // from a product detail screen). Skip the first focus (mount) since
  // fetchAll above already covers it.
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

  const goToProducts = (category) => {
    router.push(category ? { pathname: '/(customer)/products', params: { category } } : '/(customer)/products');
  };

  const everythingEmpty =
    RAIL_DEFS.every((r) => !loading[r.key]) &&
    RAIL_DEFS.every((r) => rails[r.key].length === 0);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      {/* Fixed gradient header — greeting + tappable search entry, pinned
          above the scrolling content. Bleeds behind the status bar (like
          the login hero) while its content respects the safe-area inset. */}
      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + SPACING.md }]}
      >
        <Text style={styles.greetingText}>Hi, {user?.firstName} 👋</Text>
        <Text style={styles.greetingSubtext}>Discover products picked for you</Text>

        <Pressable style={styles.searchBar} onPress={() => router.push('/(customer)/search')}>
          <Ionicons name="search" size={18} color={COLORS.textMuted} />
          <Text style={styles.searchPlaceholder}>Search products...</Text>
        </Pressable>
      </LinearGradient>

      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
          }
        >
          {/* Promo banner — same gradient CTA card as web's HomePage.jsx hero */}
          <LinearGradient
            colors={[COLORS.primary, COLORS.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.banner}
          >
            <Ionicons name="bag-handle" size={64} color="rgba(255,255,255,0.12)" style={styles.bannerGlyph} />
            <Text style={styles.bannerEyebrow}>Welcome to</Text>
            <Text style={styles.bannerTitle}>
              Nep<Text style={{ color: COLORS.accentLight }}>Shop</Text>
            </Text>
            <Text style={styles.bannerSubtitle}>
              Nepal's favourite marketplace — discover products just for you
            </Text>
            <Pressable style={styles.bannerButton} onPress={() => goToProducts()}>
              <Text style={styles.bannerButtonText}>Browse All Products →</Text>
            </Pressable>
          </LinearGradient>

          {/* Shop by Category — single horizontal row of chips, same pill
              language as the listing screen's filter chips. A plain
              ScrollView (not FlatList) so the row reliably sizes to its
              content height instead of needing a guessed fixed height. */}
          <View style={styles.categorySection}>
            <Text style={styles.sectionTitle}>Shop by Category</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryRow}
              contentContainerStyle={styles.categoryRowContent}
            >
              {CATEGORIES.map((c) => (
                <Pressable key={c.name} style={styles.categoryChip} onPress={() => goToProducts(c.name)}>
                  <Text style={styles.categoryChipIcon}>{c.icon}</Text>
                  <Text style={styles.categoryChipText}>{c.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

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
      </SafeAreaView>

      <Toast toast={toast} onHide={() => setToast(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.primaryDark,
  },
  // Belt-and-suspenders alongside `scrollView`'s own background below: the
  // ScrollView's `style` (not contentContainerStyle) already paints the
  // full viewport regardless of content height, which should be sufficient
  // on its own — this just means the SafeAreaView wrapping it is never
  // itself the thing showing `screen`'s indigo through, on any platform.
  flex: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  greetingText: {
    fontSize: 19,
    fontWeight: '700',
    color: '#fff',
  },
  greetingSubtext: {
    fontSize: 12.5,
    color: COLORS.heroText,
    marginTop: 2,
    marginBottom: SPACING.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: '#fff',
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: 11,
    ...SHADOWS.card,
  },
  searchPlaceholder: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  // BLUE BAR BUG: this was the fix. `content` (a ScrollView
  // contentContainerStyle) only paints its background behind the actual
  // children, sized to their natural content height — NOT across the full
  // scroll viewport. The ScrollView itself had no `style` prop, so whenever
  // rendered content was shorter than the screen (e.g. right after mount,
  // while rails are still showing their slim loading skeletons), the area
  // below the content showed straight through to `screen`'s indigo
  // `primaryDark` background — a horizontal indigo/blue bar or box at the
  // bottom of the visible area. Fix: `scrollView` below gives the
  // ScrollView itself flex:1 + a white background, so white now fills the
  // entire viewport regardless of content length; `content` keeps padding
  // only.
  scrollView: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: 32,
  },
  banner: {
    borderRadius: RADII.lg,
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
    overflow: 'hidden',
  },
  bannerGlyph: {
    position: 'absolute',
    right: -8,
    top: -8,
  },
  bannerEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.heroText,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  bannerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  bannerSubtitle: {
    fontSize: 13,
    color: COLORS.heroText,
    marginBottom: SPACING.md,
    maxWidth: '85%',
  },
  bannerButton: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.accent,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
  },
  bannerButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  categorySection: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  categoryRow: {
    flexGrow: 0,
  },
  categoryRowContent: {
    gap: SPACING.sm,
    paddingRight: SPACING.md,
    alignItems: 'center',
  },
  categoryChip: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  categoryChipIcon: {
    fontSize: 15,
    lineHeight: 18,
  },
  categoryChipText: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  emptyState: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
    borderRadius: RADII.lg,
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
