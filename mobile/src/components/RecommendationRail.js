import { ActivityIndicator, FlatList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import ProductCard from './ProductCard';
import { COLORS, RADII, SPACING } from '../constants/colors';

// Card width scales with the window instead of a fixed pixel value tuned to
// one device — clamped so cards stay legible on a small phone and don't
// balloon on a tablet.
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// Mirrors frontend/src/components/recommendations/RecommendationRow.jsx:
// hides entirely when empty with no emptyText, shows an empty-state box when
// emptyText is provided, otherwise a horizontal scroll of ProductCards. The
// "N items →" count next to the title matches the web's section header too.
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
  const { width } = useWindowDimensions();
  const cardWidth = clamp(width * 0.4, 140, 220);

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
      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {products.length > 4 && (
          <Text style={styles.countText}>{products.length} items →</Text>
        )}
      </View>

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
              style={{ width: cardWidth }}
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
    marginBottom: SPACING.xxl - 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  headerTextWrap: {
    flex: 1,
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
  },
  countText: {
    fontSize: 11,
    color: COLORS.tabInactive,
    marginTop: 2,
  },
  loadingRow: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rail: {
    gap: SPACING.sm + 2,
    paddingRight: 4,
  },
  emptyBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: COLORS.tabInactive,
    textAlign: 'center',
    paddingHorizontal: SPACING.lg,
  },
});
