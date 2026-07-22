import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../constants/colors';

// Shared gradient hero for the customer screens — extracted from Home's inline
// gradient header (app/(customer)/home.js) so every non-Home customer page
// opens in the same indigo register instead of the flat white ScreenHeader.
// Presentational only: renders a wordmark, an optional back arrow, an optional
// right-hand action and a prominent title, and calls onBack — no fetch, no
// navigation of its own.
//
// The wordmark is the AuthHero / Home-banner two-tone (AuthHero.js:24-26,
// home.js:152-154): white "Nep" + COLORS.accentLight "Shop", never uppercased
// or letter-spaced. `wordmarkSuffix` (default '') is appended in the muted hero
// tone so the delivery app can later reuse this exact shell by passing
// " · Delivery" — the customer default renders plain "NepShop", no suffix.
//
// The wordmark and the right action sit in a space-between row so they can
// never overlap (the delivery hero once hit a glyph-behind-bell overlap; there
// is deliberately no absolute-positioned glyph here at all).
export default function AppHero({
  title,
  subtitle,
  onBack,
  rightSlot,
  wordmarkSuffix = '',
  children,
  contentPaddingBottom = SPACING.lg,
}) {
  const insets = useSafeAreaInsets();
  const hasBelow = title || subtitle || children;

  return (
    <>
      <StatusBar style="light" />
      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + SPACING.md, paddingBottom: contentPaddingBottom }]}
      >
        {/* Outer row vertically centers rightSlot (the bell) against the FULL
            height of the left column — wordmark + title + subtitle — instead of
            pinning it to the wordmark line. space-between plus a flex:1 left
            column keeps the wordmark and rightSlot from ever overlapping. */}
        <View style={styles.bannerRow}>
          <View style={styles.leftColumn}>
            <View style={[styles.brandRow, hasBelow && styles.brandRowSpaced]}>
              {onBack ? (
                <Pressable onPress={onBack} hitSlop={10} style={styles.backButton}>
                  <Ionicons name="arrow-back" size={22} color={COLORS.background} />
                </Pressable>
              ) : null}
              <Text style={styles.wordmark}>
                Nep<Text style={styles.wordmarkShop}>Shop</Text>
                {wordmarkSuffix ? <Text style={styles.wordmarkSuffix}>{wordmarkSuffix}</Text> : null}
              </Text>
            </View>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {rightSlot ? <View>{rightSlot}</View> : null}
        </View>

        {children}
      </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: SPACING.lg,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  leftColumn: {
    flex: 1,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  brandRowSpaced: {
    marginBottom: SPACING.md,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -SPACING.xs,
  },
  // Two-tone wordmark — white base so "Nep" reads as brand, not muted eyebrow;
  // only "Shop" and the optional suffix override colour. No textTransform /
  // letterSpacing by design.
  wordmark: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.background,
  },
  wordmarkShop: { color: COLORS.accentLight },
  wordmarkSuffix: { color: COLORS.heroText, fontWeight: '600' },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.background,
  },
  subtitle: {
    fontSize: 12.5,
    color: COLORS.heroText,
    marginTop: 2,
  },
});
