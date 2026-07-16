import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants/colors';

// Shared gradient hero block for the auth screens (login, signup) — same
// indigo-900→indigo-600 gradient, glow blobs, "N" badge and wordmark as
// frontend/src/pages/auth/AuthPage.jsx's left panel. `children` is the
// headline (so callers can mix in the accent-colored <Text> span).
export default function AuthHero({ eyebrow, children }) {
  return (
    <LinearGradient
      colors={[COLORS.primaryDark, COLORS.primary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View style={[styles.glow, styles.glowOrange]} />
      <View style={[styles.glow, styles.glowIndigo]} />

      <View style={styles.logoRow}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoBadgeText}>N</Text>
        </View>
        <Text style={styles.wordmark}>
          Nep<Text style={{ color: COLORS.accentLight }}>Shop</Text>
        </Text>
      </View>

      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.headline}>{children}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingTop: 72,
    paddingBottom: 56,
    paddingHorizontal: 28,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
  },
  glowOrange: {
    backgroundColor: COLORS.glowOrange,
    top: -60,
    right: -60,
  },
  glowIndigo: {
    backgroundColor: COLORS.glowIndigo,
    bottom: -80,
    left: -60,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 28,
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBadgeText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
  },
  wordmark: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  eyebrow: {
    color: COLORS.accentLight,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  headline: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
  },
});
