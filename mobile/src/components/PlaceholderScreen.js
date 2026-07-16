import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenHeader from './ScreenHeader';
import { COLORS, SPACING } from '../constants/colors';

// Styled stand-in for a not-yet-built screen — every delivery tab, plus
// customer Search and Orders, render this until their real screens land.
// Content stays "Coming soon" (no functionality here), but the shell (header,
// safe area, brand colors) matches every other screen in the app.
export default function PlaceholderScreen({ title, icon = 'construct-outline' }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title={title} />
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={30} color={COLORS.primary} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>Coming soon</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
});
