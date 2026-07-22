import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADII, SPACING } from '../constants/colors';

// Shared gradient hero for the delivery-agent screens — extracted verbatim
// from the Deliveries landing tab so Earnings (and any later delivery screen)
// opens in the same register instead of the flat white ScreenHeader.
//
// Same recipe as the customer Home header (app/(customer)/home.js): diagonal
// primaryDark→primary gradient, translucent oversized glyph, bleeding behind
// the status bar while its content respects the safe-area inset.
//
// What lives IN here is role-level — true on every delivery screen: the
// gradient itself, the geometry, and the "NepShop · Delivery" wordmark. What
// stays OUT is screen-level: the title/subtitle text, the right-hand action,
// and whatever content sits beneath (a stat strip, a headline figure, …),
// which callers pass as children.
//
// `contentPaddingBottom` exists because the landing tab seats an overlapping
// segmented control on the hero's bottom edge (marginTop: -SPACING.xl) and so
// needs extra room; screens without that overlap want the smaller default.
export default function DeliveryHero({
  icon,
  title,
  subtitle,
  rightSlot,
  children,
  contentPaddingBottom = SPACING.xl,
}) {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={[COLORS.primaryDark, COLORS.primary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.hero,
        { paddingTop: insets.top + SPACING.md, paddingBottom: contentPaddingBottom },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={112} color="rgba(255,255,255,0.10)" style={styles.heroGlyph} />
      ) : null}

      <View style={styles.heroTopRow}>
        <View style={styles.heroTitleWrap}>
          {/* Two-tone wordmark, same structure as Home's banner
              (home.js:152-154) and AuthHero: the nested span sets colour
              ONLY, everything else inherits from the parent. Deliberately
              NOT uppercased and not letter-spaced — either would collapse
              the Nep/Shop case boundary the wordmark depends on. */}
          <Text style={styles.heroBrand}>
            Nep<Text style={{ color: COLORS.accentLight }}>Shop</Text>
            <Text style={styles.heroBrandRole}> · Delivery</Text>
          </Text>
          <Text style={styles.heroTitle}>{title}</Text>
          {subtitle ? <Text style={styles.heroSubtext}>{subtitle}</Text> : null}
        </View>
        {rightSlot}
      </View>

      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: SPACING.lg,
    borderBottomLeftRadius: RADII.xl,
    borderBottomRightRadius: RADII.xl,
    overflow: 'hidden',
  },
  heroGlyph: {
    position: 'absolute',
    right: -SPACING.md,
    top: SPACING.xxl,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  heroTitleWrap: { flex: 1 },
  // Wordmark line. No textTransform and no letterSpacing by design — see the
  // comment at the JSX. White base so "Nep" reads as brand, not as muted
  // eyebrow text; only "Shop" and the role suffix override colour.
  heroBrand: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 3,
  },
  heroBrandRole: { color: COLORS.heroText, fontWeight: '600' },
  heroTitle: { fontSize: 24, fontWeight: '700', color: COLORS.background },
  heroSubtext: { fontSize: 12.5, color: COLORS.heroText, marginTop: 3 },
});
