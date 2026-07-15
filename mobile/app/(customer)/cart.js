import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import API from '../../src/utils/api';
import { COLORS } from '../../src/constants/colors';
import { formatRs } from '../../src/utils/format';

// Read-only per this task's scope — same GET /cart endpoint and { items,
// total, itemCount } shape as web's CartContext.fetchCart (frontend/src/
// context/CartContext.jsx). No quantity editing, removal, selection, or
// checkout here, and no client-side totals math: total/itemCount below are
// exactly what the API returned, not recomputed from the items list.
export default function CartScreen() {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  if (loading) {
    return (
      <View style={styles.centerFill}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const items = cart?.items || [];

  return (
    <View style={styles.screen}>
      {items.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchCart(true)} tintColor={COLORS.primary} />
          }
        >
          <View style={styles.centerFill}>
            <Ionicons name="cart-outline" size={40} color={COLORS.tabInactive} />
            <Text style={styles.emptyTitle}>Your cart is empty</Text>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchCart(true)} tintColor={COLORS.primary} />
          }
          renderItem={({ item }) => <CartRow item={item} />}
          ListFooterComponent={
            <View style={styles.summary}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Items</Text>
                <Text style={styles.summaryValue}>{cart.itemCount}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabelTotal}>Total</Text>
                <Text style={styles.summaryValueTotal}>{formatRs(cart.total)}</Text>
              </View>
            </View>
          }
        />
      )}
    </View>
  );
}

function CartRow({ item }) {
  const product = item.product || {};
  const imageUrl = product.images?.[0]?.url;

  return (
    <View style={styles.row}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.rowImage} />
      ) : (
        <View style={[styles.rowImage, styles.rowImageFallback]}>
          <Ionicons name="image-outline" size={20} color={COLORS.tabInactive} />
        </View>
      )}

      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={2}>{product.name}</Text>
        <Text style={styles.rowMeta}>Qty: {item.quantity}</Text>
        {item.stale && <Text style={styles.staleTag}>Unavailable</Text>}
      </View>

      <Text style={styles.rowPrice}>{formatRs(item.price)}</Text>
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
  emptyContainer: {
    flexGrow: 1,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 4,
  },
  list: {
    padding: 16,
    paddingBottom: 32,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
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
    marginBottom: 3,
  },
  rowMeta: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  staleTag: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.danger,
    marginTop: 2,
  },
  rowPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  summary: {
    marginTop: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.primary,
  },
});
