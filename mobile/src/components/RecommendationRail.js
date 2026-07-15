import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import ProductCard from './ProductCard';
import { COLORS } from '../constants/colors';

const CARD_WIDTH = 152;

// Mirrors frontend/src/components/recommendations/RecommendationRow.jsx:
// hides entirely when empty with no emptyText, shows an empty-state box when
// emptyText is provided, otherwise a horizontal scroll of ProductCards.
export default function RecommendationRail({
  title,
  subtitle,
  products,
  loading,
  onProduct,
  onAddToCart,
  showReason = false,
  emptyText = null,
}) {
  if (loading) {
    return (
      <View style={styles.section}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <View style={styles.loadingRow}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </View>
    );
  }

  if (!products.length && !emptyText) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      {products.length ? (
        <FlatList
          data={products}
          keyExtractor={(item) => item._id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              style={styles.cardWidth}
              showReason={showReason}
              onPress={() => onProduct(item)}
              onAddToCart={() => onAddToCart(item)}
            />
          )}
        />
      ) : (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 26,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 10,
  },
  loadingRow: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rail: {
    gap: 10,
    paddingRight: 4,
  },
  cardWidth: {
    width: CARD_WIDTH,
  },
  emptyBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: COLORS.tabInactive,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});
