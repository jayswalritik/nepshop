import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import API from '../../src/utils/api';
import { updateCartQuantity, updateCartSelection, removeCartItem, clearCart, getCartSummary, addToCart } from '../../src/utils/cart';
import AppHero from '../../src/components/AppHero';
import NotificationBellIcon from '../../src/components/NotificationBellIcon';
import Toast from '../../src/components/Toast';
import RecommendationRail from '../../src/components/RecommendationRail';
import { COLORS, RADII, SHADOWS, SPACING } from '../../src/constants/colors';
import { formatRs } from '../../src/utils/format';

// Mirrors frontend/src/pages/customer/CartPage.jsx's structure: items
// grouped by seller, per-item selection, quantity editing, remove, clear
// all — same endpoints as web's CartContext (frontend/src/context/
// CartContext.jsx).
//
// MONEY DISPLAY: the Order Summary box (subtotal / per-package delivery /
// total) now comes ENTIRELY from GET /api/cart/summary (no coupon param) —
// the same endpoint checkout uses. Zero money arithmetic happens in this
// file: `selectedCount` below is a plain item-quantity TALLY (a count, not
// a Rupee value), which is why it's still computed locally, same as the
// checkout screen's identical pattern. One deliberate omission: the web
// shows "Add Rs X more for free delivery" (computed as 2000 − subtotal)
// for a single under-threshold package. That's money arithmetic against a
// hardcoded threshold the endpoint doesn't return, and this task is mobile-
// only (can't extend the endpoint to add the figure) — so that hint is left
// out rather than reimplemented client-side. Noted in the PR summary.
const isCheckoutEligible = (item) => item.selected !== false && !item.stale;

const groupCartBySeller = (items) => {
  const map = new Map();
  for (const item of items) {
    if (!item.product) continue;
    const sellerId = (item.product.seller?._id || item.product.seller || 'unknown').toString();
    if (!map.has(sellerId)) map.set(sellerId, []);
    map.get(sellerId).push(item);
  }
  return Array.from(map.values()).map((groupItems) => ({
    items: groupItems,
    sellerName:
      groupItems[0]?.product?.seller?.shopName ||
      `${groupItems[0]?.product?.seller?.firstName || ''} ${groupItems[0]?.product?.seller?.lastName || ''}`.trim() ||
      'Seller',
  }));
};

const staleReason = (item) => {
  if (item.product?.stock === 0) return 'Out of stock';
  if (item.product?.stock < item.quantity) return 'Insufficient stock';
  return 'No longer available';
};

export default function CartScreen() {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);

  const [summary, setSummary] = useState(null);
  const [summaryUpdating, setSummaryUpdating] = useState(false);
  const [summaryError, setSummaryError] = useState(false);
  // Monotonic counter, not a query string (search.js's equivalent) — each
  // fetch tags itself with the id current at its START; a response only
  // gets applied if that id is still the latest when it lands, so a slower
  // earlier request can never overwrite a faster later one.
  const summaryRequestIdRef = useRef(0);
  const summaryDebounceRef = useRef(null);
  // Mirrors `summary` without being a dependency of fetchSummaryNow below —
  // if `summary` itself were in that useCallback's deps, every successful
  // fetch would change fetchSummaryNow's identity, which would change the
  // useFocusEffect callback's identity, which re-fires the focus effect
  // while still focused, which fetches again... an infinite refetch loop.
  const summaryRef = useRef(null);

  // "Complete Your Cart" rail — same GET /recommendations/cart endpoint and
  // limit as web's CartRecommendations (frontend/src/pages/customer/
  // CartPage.jsx), refetched on the SAME triggers as the summary (focus +
  // the existing 400ms debounce after a mutation) rather than a second,
  // competing fetch/debounce of its own.
  const [cartRecs, setCartRecs] = useState([]);
  const [cartRecsLoading, setCartRecsLoading] = useState(true);

  const fetchCartRecs = useCallback(async () => {
    setCartRecsLoading(true);
    try {
      const { data } = await API.get('/recommendations/cart?limit=8');
      setCartRecs(data.products || []);
    } catch {
      setCartRecs([]);
    } finally {
      setCartRecsLoading(false);
    }
  }, []);

  const fetchCart = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const { data } = await API.get('/cart');
      setCart(data.cart);
    } catch {
      // leave prior cart state in place on failure
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Immediate (no debounce) — used on focus, not on rapid user interaction.
  const fetchSummaryNow = useCallback(async () => {
    const requestId = ++summaryRequestIdRef.current;
    setSummaryUpdating(true);
    const result = await getCartSummary();
    if (requestId !== summaryRequestIdRef.current) return; // superseded
    if (result.success) {
      summaryRef.current = result.summary;
      setSummary(result.summary);
      setSummaryError(false);
    } else if (!summaryRef.current) {
      // Only surface an error state when we have nothing to fall back on —
      // a failed background refresh should just leave the last-known
      // summary on screen (same "keep stale numbers" idea as summaryUpdating).
      setSummaryError(true);
    }
    setSummaryUpdating(false);
  }, []);

  // Debounced — used after cart mutations, so spamming a checkbox doesn't
  // stack a request per tap. Only the LAST scheduled call in a burst ever
  // actually fires; fetchSummaryNow's own requestId guard then also covers
  // the (separate) case of two fetches genuinely in flight at once.
  const scheduleSummaryRefetch = useCallback(() => {
    if (summaryDebounceRef.current) clearTimeout(summaryDebounceRef.current);
    summaryDebounceRef.current = setTimeout(() => {
      summaryDebounceRef.current = null;
      fetchSummaryNow();
      fetchCartRecs(); // cart contents changed — same trigger, same timer, no second debounce
    }, 400);
  }, [fetchSummaryNow, fetchCartRecs]);

  useFocusEffect(
    useCallback(() => {
      fetchCart(false);
      fetchSummaryNow();
      fetchCartRecs();
    }, [fetchCart, fetchSummaryNow, fetchCartRecs])
  );

  const applyMutation = async (mutationFn, busyKey) => {
    if (busyKey) setBusyId(busyKey);
    const result = await mutationFn();
    if (busyKey) setBusyId(null);
    if (result.success) {
      setCart(result.cart);
      scheduleSummaryRefetch();
    } else {
      setToast({ type: 'error', message: result.message });
    }
  };

  const handleToggleItem = (item) =>
    applyMutation(() => updateCartSelection([item._id], item.selected === false), item._id);

  const handleToggleGroup = (groupItems) => {
    const selectable = groupItems.filter((i) => !i.stale);
    if (!selectable.length) return;
    const allSelected = selectable.every((i) => i.selected !== false);
    applyMutation(() => updateCartSelection(selectable.map((i) => i._id), !allSelected));
  };

  const handleToggleAll = () => {
    const selectable = items.filter((i) => !i.stale);
    if (!selectable.length) return;
    const allSelected = selectable.every((i) => i.selected !== false);
    applyMutation(() => updateCartSelection(selectable.map((i) => i._id), !allSelected));
  };

  const handleQuantityChange = (item, nextQty) => {
    if (nextQty < 1 || nextQty > (item.product?.stock ?? 0)) return;
    applyMutation(() => updateCartQuantity(item.product._id, nextQty), `qty-${item._id}`);
  };

  const handleRemove = (item) => {
    applyMutation(() => removeCartItem(item.product._id), `remove-${item._id}`);
  };

  const handleClearAll = () => {
    applyMutation(() => clearCart(), 'clear-all');
  };

  const handleCheckout = () => {
    router.push('/(customer)/checkout');
  };

  // Adding a "Complete Your Cart" rec adds a NEW product to the cart —
  // unlike every other mutation on this screen, there's no existing item to
  // patch locally, so this refetches the cart itself (not just the
  // summary/recs) same as web's CartRecommendations.handleAdd implicitly
  // does via the shared CartContext re-rendering CartPage's item list.
  const handleAddRec = async (product) => {
    const result = await addToCart(product._id, 1);
    if (result.success) {
      setToast({ type: 'success', message: `"${product.name}" added to cart!` });
      fetchCart(false);
      scheduleSummaryRefetch();
    } else {
      setToast({ type: 'error', message: result.message });
    }
  };

  const items = cart?.items?.filter((item) => item.product) || [];
  const groups = groupCartBySeller(items);
  const selectableItems = items.filter((item) => !item.stale);
  const selectedItems = items.filter(isCheckoutEligible);
  const allSelected = selectableItems.length > 0 && selectableItems.every((i) => i.selected !== false);
  // Plain quantity tally — a count, not a Rupee value, so it stays local
  // (see the MONEY DISPLAY note at the top of this file).
  const selectedCount = selectedItems.reduce((s, i) => s + i.quantity, 0);

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <AppHero
        title="Cart"
        subtitle={cart ? `${cart.itemCount} item${cart.itemCount !== 1 ? 's' : ''}` : undefined}
        wordmarkSuffix=" · Customer"
        rightSlot={<NotificationBellIcon color={COLORS.background} onPress={() => router.push('/(customer)/notifications')} />}
      />

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : items.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchCart(true)} tintColor={COLORS.primary} />
          }
        >
          <View style={styles.centerFill}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="cart-outline" size={36} color={COLORS.primary} />
            </View>
            <Text style={styles.emptyTitle}>Your cart is empty</Text>
            <Text style={styles.emptyBody}>Items you add will show up here.</Text>
            <Pressable style={styles.browseButton} onPress={() => router.push('/(customer)/products')}>
              <Text style={styles.browseButtonText}>Browse Products</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchCart(true)} tintColor={COLORS.primary} />
          }
        >
          <View style={styles.toolbar}>
            <Pressable
              style={styles.selectAllRow}
              onPress={handleToggleAll}
              disabled={selectableItems.length === 0}
            >
              <Ionicons
                name={allSelected ? 'checkbox' : 'square-outline'}
                size={19}
                color={selectableItems.length === 0 ? COLORS.tabInactive : COLORS.primary}
              />
              <Text style={styles.selectAllText}>Select All</Text>
            </Pressable>
            <Pressable onPress={handleClearAll} disabled={busyId === 'clear-all'}>
              <Text style={styles.clearAllText}>
                {busyId === 'clear-all' ? 'Clearing…' : 'Clear All'}
              </Text>
            </Pressable>
          </View>

          {groups.map((group, gi) => {
            const groupSelectable = group.items.filter((i) => !i.stale);
            const groupAllSelected = groupSelectable.length > 0 && groupSelectable.every((i) => i.selected !== false);
            return (
              <View key={gi} style={styles.group}>
                <Pressable
                  style={styles.groupHeader}
                  onPress={() => handleToggleGroup(group.items)}
                  disabled={groupSelectable.length === 0}
                >
                  <Ionicons
                    name={groupAllSelected ? 'checkbox' : 'square-outline'}
                    size={17}
                    color={groupSelectable.length === 0 ? COLORS.tabInactive : COLORS.primary}
                  />
                  <Text style={styles.groupHeaderText}>
                    {group.sellerName} · {group.items.length} item{group.items.length > 1 ? 's' : ''}
                  </Text>
                </Pressable>

                {group.items.map((item) => (
                  <CartItemRow
                    key={item._id}
                    item={item}
                    busyId={busyId}
                    onToggle={() => handleToggleItem(item)}
                    onQuantityChange={(q) => handleQuantityChange(item, q)}
                    onRemove={() => handleRemove(item)}
                  />
                ))}
              </View>
            );
          })}

          <View style={styles.summary}>
            <View style={styles.summaryHeadingRow}>
              <Text style={styles.summaryHeading}>Order Summary</Text>
              {summaryUpdating && <ActivityIndicator size="small" color={COLORS.primary} />}
            </View>

            {summary ? (
              <View style={[summaryUpdating && styles.summaryBodyUpdating]}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Subtotal ({selectedCount} selected)</Text>
                  <Text style={styles.summaryValue}>{formatRs(summary.itemsSubtotal)}</Text>
                </View>

                {summary.packages.length > 1 ? (
                  <>
                    <Text style={styles.packagesNote}>
                      📦 Arrives in {summary.packages.length} packages — delivery charged per package
                    </Text>
                    {summary.packages.map((pkg, i) => (
                      <View key={pkg.seller} style={styles.packageDeliveryRow}>
                        <Text style={styles.packageDeliveryLabel}>Package {i + 1} delivery</Text>
                        <Text style={[styles.summaryValue, pkg.deliveryCharge === 0 && styles.freeText]}>
                          {pkg.deliveryCharge === 0 ? 'FREE' : formatRs(pkg.deliveryCharge)}
                        </Text>
                      </View>
                    ))}
                  </>
                ) : (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Delivery charge</Text>
                    {/* Same as web: this single-package delivery figure is
                        always styled as the "free" green, even when it's a
                        real Rs 100 charge — mirrored as-is. */}
                    <Text style={[styles.summaryValue, styles.freeText]}>
                      {summary.totalDelivery === 0 ? 'FREE' : formatRs(summary.totalDelivery)}
                    </Text>
                  </View>
                )}

                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabelTotal}>Total</Text>
                  <Text style={styles.summaryValueTotal}>{formatRs(summary.grandTotal)}</Text>
                </View>
              </View>
            ) : summaryError ? (
              <View style={styles.summaryLoadingRow}>
                <Text style={styles.summaryErrorText}>Couldn't load order summary.</Text>
                <Pressable onPress={fetchSummaryNow}>
                  <Text style={styles.summaryRetryText}>Retry</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.summaryLoadingRow}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            )}

            <Pressable
              style={[styles.checkoutButton, selectedCount === 0 && styles.checkoutButtonDisabled]}
              disabled={selectedCount === 0}
              onPress={handleCheckout}
            >
              <Text style={styles.checkoutButtonText}>
                {selectedCount === 0 ? 'Select item(s) to checkout' : `Checkout · ${selectedCount} item${selectedCount > 1 ? 's' : ''} →`}
              </Text>
            </Pressable>
          </View>

          {/* "Complete Your Cart" — same placement as web: below the
              summary/checkout button, not interleaved with the item list. */}
          <View style={styles.recsWrap}>
            <RecommendationRail
              title="🛒 Complete Your Cart"
              subtitle="Frequently bought with items in your cart"
              products={cartRecs}
              loading={cartRecsLoading}
              onProduct={(p) => router.push(`/(customer)/product/${p._id}`)}
              onAddToCart={handleAddRec}
              showReason
            />
          </View>
        </ScrollView>
      )}

      <Toast toast={toast} onHide={() => setToast(null)} />
    </SafeAreaView>
  );
}

function CartItemRow({ item, busyId, onToggle, onQuantityChange, onRemove }) {
  const product = item.product || {};
  const imageUrl = product.images?.[0]?.url;
  const qtyBusy = busyId === `qty-${item._id}`;
  const removeBusy = busyId === `remove-${item._id}`;

  return (
    <View style={[styles.row, item.stale && styles.rowStale]}>
      <Pressable onPress={onToggle} disabled={item.stale} hitSlop={8}>
        <Ionicons
          name={item.selected !== false && !item.stale ? 'checkbox' : 'square-outline'}
          size={19}
          color={item.stale ? COLORS.tabInactive : COLORS.primary}
        />
      </Pressable>

      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.rowImage} />
      ) : (
        <View style={[styles.rowImage, styles.rowImageFallback]}>
          <Ionicons name="image-outline" size={20} color={COLORS.tabInactive} />
        </View>
      )}

      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={2}>{product.name}</Text>
        <Text style={styles.rowCategory}>{product.category}</Text>
        <Text style={styles.rowPrice}>{formatRs(item.price)}</Text>
        {item.stale && <Text style={styles.staleTag}>{staleReason(item)} — can't be checked out</Text>}
      </View>

      <View style={styles.rowActions}>
        <View style={styles.stepper}>
          <Pressable
            style={styles.stepperButton}
            disabled={item.quantity <= 1 || qtyBusy}
            onPress={() => onQuantityChange(item.quantity - 1)}
          >
            <Ionicons name="remove" size={14} color={item.quantity <= 1 ? COLORS.tabInactive : COLORS.text} />
          </Pressable>
          <Text style={styles.stepperValue}>{item.quantity}</Text>
          <Pressable
            style={styles.stepperButton}
            disabled={item.quantity >= (product.stock ?? 0) || qtyBusy}
            onPress={() => onQuantityChange(item.quantity + 1)}
          >
            <Ionicons name="add" size={14} color={item.quantity >= (product.stock ?? 0) ? COLORS.tabInactive : COLORS.text} />
          </Pressable>
        </View>
        <Pressable onPress={onRemove} disabled={removeBusy} hitSlop={6}>
          <Text style={styles.removeText}>{removeBusy ? 'Removing…' : 'Remove'}</Text>
        </Pressable>
      </View>
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
    gap: 4,
    paddingHorizontal: SPACING.xl,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  recsWrap: {
    marginTop: SPACING.xl,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  emptyBody: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: SPACING.lg,
  },
  browseButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADII.sm + 2,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md - 1,
  },
  browseButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  list: {
    padding: SPACING.lg,
    paddingBottom: 32,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  selectAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  clearAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.danger,
  },
  group: {
    marginBottom: SPACING.lg,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
    paddingHorizontal: 2,
  },
  groupHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm + 2,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm + 2,
  },
  rowStale: {
    opacity: 0.65,
  },
  rowImage: {
    width: 56,
    height: 56,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.surface,
  },
  rowImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: {
    flex: 1,
  },
  rowName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  rowCategory: {
    fontSize: 11,
    color: COLORS.tabInactive,
    marginBottom: 4,
  },
  rowPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  staleTag: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.danger,
    marginTop: 4,
  },
  rowActions: {
    alignItems: 'flex-end',
    gap: SPACING.sm,
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
    minWidth: 22,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  removeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.danger,
  },
  summary: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: SPACING.lg,
    ...SHADOWS.card,
  },
  summaryHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  summaryHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  // Subtle "updating" treatment while a refetch is in flight — the last
  // known numbers stay fully visible underneath (dimmed, not blanked), plus
  // the spinner in summaryHeadingRow above.
  summaryBodyUpdating: {
    opacity: 0.55,
  },
  summaryLoadingRow: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  summaryErrorText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  summaryRetryText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.sm + 2,
  },
  summaryLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  freeText: {
    color: COLORS.success,
  },
  packagesNote: {
    fontSize: 11,
    color: COLORS.tabInactive,
    marginTop: 4,
    marginBottom: 4,
  },
  packageDeliveryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: SPACING.md,
    paddingVertical: 2,
  },
  packageDeliveryLabel: {
    fontSize: 13,
    color: COLORS.tabInactive,
  },
  summaryLabelTotal: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  summaryValueTotal: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
  },
  checkoutButton: {
    backgroundColor: COLORS.accent,
    borderRadius: RADII.sm + 2,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  checkoutButtonDisabled: {
    opacity: 0.5,
  },
  checkoutButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
