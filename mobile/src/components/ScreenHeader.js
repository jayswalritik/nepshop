import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../constants/colors';

// Shared header bar for every screen that isn't Home or the auth hero
// screens. Mirrors the web's actual navbar language (frontend/src/pages/
// customer/Dashboard.jsx: white bar, subtle border, indigo/orange accents)
// rather than a solid indigo band — the gradient hero is reserved for
// Home/login/signup, this is the "web dashboard chrome" register.
export default function ScreenHeader({ title, subtitle, onBack, rightSlot }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable style={styles.side} onPress={onBack} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={COLORS.primary} />
        </Pressable>
      ) : (
        <View style={styles.side} />
      )}

      <View style={styles.titleWrap}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>

      <View style={styles.side}>{rightSlot}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
    gap: SPACING.md,
  },
  side: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 1,
  },
});
