import { useCallback, useState } from 'react';
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
import { updateCartQuantity, updateCartSelection, removeCartItem, clearCart } from '../../src/utils/cart';
import ScreenHeader from '../../src/components/ScreenHeader';
import Toast from '../../src/components/Toast';
import { COLORS, RADII, SHADOWS, SPACING } from '../../src/constants/colors';
import { formatRs } from '../../src/utils/format';

// Mirrors frontend/src/pages/customer/CartPage.jsx's structure: items
// grouped by seller, per-item selection, quantity editing, remove, clear
// all — same endpoints as web's CartContext (frontend/src/context/
// CartContext.jsx). Checkout is a "coming soon" placeholder per this task's
// scope (no order logic yet).
//
// MONEY DISPLAY: CartPage.jsx computes selected-subtotal, per-package
// delivery charge (subtotal >= 2000 ? 0 : 100), and delivery-inclusive total
// entirely CLIENT-SIDE (its groupCartBySeller helper) — GET /cart never
// returns any of those figures, only the whole-cart { total, itemCount }.
// Flagged this as client-computed money math; per-item price × quantity,
// summed over the SELECTED items, was then explicitly approved (the Total
// below must reflect only checked items, not the whole cart) — so that sum
// is computed here. The per-package delivery charge / free-delivery
// threshold remain out of scope (never approved, no server source either),
// so no delivery line is shown — just a caption noting it's calculated at
// checkout.
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

  useFocusEffect(
    useCallback(() => {
      fetchCart(false);
    }, [fetchCart])
  );

  const applyMutation = async (mutationFn, busyKey) => {
    if (busyKey) setBusyId(busyKey);
    const result = await mutationFn();
    if (busyKey) setBusyId(null);
    if (result.success) {
      setCart(result.cart);
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
    setToast({ type: 'info', message: 'Checkout is coming soon!' });
  };

  const items = cart?.items?.filter((item) => item.product) || [];
  const groups = groupCartBySeller(items);
  const selectableItems = items.filter((item) => !item.stale);
  const selectedItems = items.filter(isCheckoutEligible);
  const allSelected = selectableItems.length > 0 && selectableItems.every((i) => i.selected !== false);
  const selectedCount = selectedItems.reduce((s, i) => s + i.quantity, 0);
  const selectedSubtotal = selectedItems.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader
        title="Cart"
        subtitle={cart ? `${cart.itemCount} item${cart.itemCount !== 1 ? 's' : ''}` : undefined}
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
            <Text style={styles.summaryHeading}>Order Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Items in cart</Text>
              <Text style={styles.summaryValue}>{cart.itemCount}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabelTotal}>Total ({selectedCount} selected)</Text>
              <Text style={styles.summaryValueTotal}>{formatRs(selectedSubtotal)}</Text>
            </View>
            <Text style={styles.summaryCaption}>
              Delivery charges are calculated at checkout.
            </Text>

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
  summaryHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  summaryCaption: {
    fontSize: 11,
    color: COLORS.tabInactive,
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
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
