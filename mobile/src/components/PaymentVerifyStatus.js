import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, RADII, SPACING } from '../constants/colors';
import { formatRs } from '../utils/format';

// Shared UI for the payment-verify deep-link screens (mobile/app/(customer)/
// payment/khalti/verify.js, payment/esewa/verify.js) — mirrors web's
// KhaltiVerify.jsx/EsewaVerify.jsx verifying/success/failed states exactly;
// the two callers are identical here, differing only in which gateway they
// call and which URL params they read. `already-processed` is mobile-only
// UI (web doesn't need it — its whole page reloads per navigation, so a
// double-verify there just shows the generic failed state): a neutral,
// non-alarming state for the idempotent double-verify case, per the task's
// explicit "not a scary error" requirement.
export default function PaymentVerifyStatus({ status, message, order, gatewayLabel }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.container}>
        {status === 'verifying' && (
          <>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.title}>Verifying Payment</Text>
            <Text style={styles.body}>Please wait while we confirm your payment with {gatewayLabel}...</Text>
          </>
        )}

        {status === 'success' && (
          <>
            <View style={styles.iconWrapSuccess}>
              <Ionicons name="checkmark-circle" size={48} color={COLORS.success} />
            </View>
            <Text style={styles.title}>Payment Successful!</Text>
            <Text style={styles.body}>{message}</Text>
            {order && (
              <View style={styles.orderBox}>
                <Text style={styles.orderBoxLabel}>Order #{order._id.toString().slice(-8).toUpperCase()}</Text>
                <Text style={styles.orderBoxValue}>{formatRs(order.total)}</Text>
              </View>
            )}
            <Pressable style={styles.primaryButton} onPress={() => router.replace('/(customer)/orders')}>
              <Text style={styles.primaryButtonText}>View My Orders</Text>
            </Pressable>
          </>
        )}

        {status === 'already-processed' && (
          <>
            <View style={styles.iconWrapNeutral}>
              <Ionicons name="information-circle" size={48} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>Already Processed</Text>
            <Text style={styles.body}>This payment was already processed — check your orders to confirm.</Text>
            <Pressable style={styles.primaryButton} onPress={() => router.replace('/(customer)/orders')}>
              <Text style={styles.primaryButtonText}>View My Orders</Text>
            </Pressable>
          </>
        )}

        {status === 'failed' && (
          <>
            <View style={styles.iconWrapFailed}>
              <Ionicons name="close-circle" size={48} color={COLORS.danger} />
            </View>
            <Text style={styles.title}>Payment Failed</Text>
            <Text style={styles.body}>{message}</Text>
            <Pressable style={styles.primaryButton} onPress={() => router.replace('/(customer)/cart')}>
              <Text style={styles.primaryButtonText}>Back to Cart</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.sm },
  iconWrapSuccess: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.successSoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm,
  },
  iconWrapNeutral: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.primarySoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm,
  },
  iconWrapFailed: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.dangerSoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm,
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginTop: SPACING.md, textAlign: 'center' },
  body: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginTop: 4, marginBottom: SPACING.lg },
  orderBox: {
    width: '100%', backgroundColor: COLORS.surface, borderRadius: RADII.md,
    padding: SPACING.lg, alignItems: 'center', marginBottom: SPACING.xl,
  },
  orderBoxLabel: { fontSize: 12, color: COLORS.textMuted, marginBottom: 4 },
  orderBoxValue: { fontSize: 22, fontWeight: '800', color: COLORS.primary },
  primaryButton: {
    width: '100%', backgroundColor: COLORS.primary, borderRadius: RADII.sm + 2,
    paddingVertical: SPACING.md, alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
