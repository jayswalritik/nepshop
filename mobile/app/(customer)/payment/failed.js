import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, RADII, SPACING } from '../../../src/constants/colors';

// Deep-link landing screen for nepshop://payment/failed — mirrors
// frontend/src/pages/payment/PaymentFailed.jsx's CORRECTED copy (the
// PendingPayment refactor fixed web's stale "your order has been saved"
// claim — no order is ever created before a gateway confirms payment, for
// either gateway). Static screen, no backend call — this is eSewa's
// failure_url destination, same as web (not reachable yet on mobile until
// eSewa's initiate-side form-POST is solved, but ready for when it is).
// "Back to Cart" can deep-link straight to the real Cart tab here, unlike
// web which has no per-tab URL and had to keep pointing at the dashboard
// shell.
export default function PaymentFailedScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="close-circle" size={48} color={COLORS.danger} />
        </View>
        <Text style={styles.title}>Payment Failed</Text>
        <Text style={styles.body}>
          Your payment was not completed, so no order was placed and nothing
          was charged. Your cart is still saved — you can return to it and
          try again.
        </Text>
        <Pressable style={styles.primaryButton} onPress={() => router.replace('/(customer)/cart')}>
          <Text style={styles.primaryButtonText}>Back to Cart</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.sm },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.dangerSoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm,
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginTop: SPACING.md, textAlign: 'center' },
  body: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginTop: 4, marginBottom: SPACING.xl },
  primaryButton: {
    width: '100%', backgroundColor: COLORS.primary, borderRadius: RADII.sm + 2,
    paddingVertical: SPACING.md, alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
