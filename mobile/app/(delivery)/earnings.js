import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getDeliveryOrders } from '../../src/utils/delivery';
import DeliveryHero from '../../src/components/DeliveryHero';
import Toast from '../../src/components/Toast';
import { COLORS, RADII, SHADOWS, SPACING } from '../../src/constants/colors';
import { formatRs } from '../../src/utils/format';

// Mirrors frontend/src/pages/delivery/Dashboard.jsx's EarningsTab (lines
// ~455-487) exactly — same four figures, same note box copy. deliveryEarnings/
// deliveredCount/returnEarnings/returnPickupCount all come straight off
// GET /delivery/orders (backend/controllers/deliveryController.js) with zero
// arithmetic. The one exception — Total Earned = deliveryEarnings +
// returnEarnings — is explicitly approved: the API has no combined
// totalEarnings field (a genuinely separate endpoint-creation work item),
// and this sums two already-server-computed totals rather than re-deriving
// any pricing formula, exactly mirroring web's own client-side sum.
//
// Composition: the shared DeliveryHero shell (src/components/DeliveryHero.js)
// replaces the flat white ScreenHeader this screen used to open with, so it
// reads in the same register as the Deliveries landing tab. Total Earned is
// the hero centrepiece — it was previously one of four equal tiles with no
// focal point; the remaining figures are now explicitly subordinate to it.
//
// Every figure is all-time: the backend aggregations behind these fields have
// no date filter and the payload carries no today/week/month breakdown, so
// there is deliberately no period framing here to imply otherwise.
export default function EarningsScreen() {
  const [stats, setStats] = useState({ deliveryEarnings: 0, deliveredCount: 0, returnEarnings: 0, returnPickupCount: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // A failed fetch used to be swallowed entirely (no `else` branch), so a dead
  // network rendered as a fully-populated "Rs 0" screen — indistinguishable
  // from an agent who genuinely hasn't earned yet. Same pattern as the
  // landing tab now: `error` drives a real error branch, and a refresh that
  // fails on top of data we already have keeps the data and surfaces a toast
  // rather than blanking the screen.
  const hasDataRef = useRef(false);

  const fetchStats = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const result = await getDeliveryOrders();
    if (result.success) {
      setStats({
        deliveryEarnings: result.deliveryEarnings,
        deliveredCount: result.deliveredCount,
        returnEarnings: result.returnEarnings,
        returnPickupCount: result.returnPickupCount,
      });
      setError(null);
      hasDataRef.current = true;
    } else {
      const message = result.message || 'Failed to load earnings';
      setError(message);
      if (hasDataRef.current) setToast({ type: 'error', message });
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchStats(false);
    }, [fetchStats])
  );

  // Approved exception to the zero-arithmetic rule — see file header comment.
  // This single addition of two server-computed totals is the ONLY money
  // arithmetic on this screen; every other figure is rendered as received.
  const totalEarned = stats.deliveryEarnings + stats.returnEarnings;

  const showError = error && !hasDataRef.current;
  // A genuine zero — the fetch succeeded and there is simply nothing yet.
  // Distinct from `showError`, which means we don't know.
  const isZero =
    !loading && !showError && totalEarned === 0 && stats.deliveredCount === 0 && stats.returnPickupCount === 0;

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={() => fetchStats(true)} tintColor={COLORS.primary} />
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <DeliveryHero icon="wallet" title="Earnings" contentPaddingBottom={SPACING.xl}>
        {/* The centrepiece. Orange on indigo, and deliberately far larger
            than the landing tab's 22px stat numerals — this is the one
            figure the screen exists to show. */}
        <View style={styles.totalBlock}>
          <Text style={styles.totalLabel}>Total Earned</Text>
          <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {formatRs(totalEarned)}
          </Text>
          <Text style={styles.totalSub}>Deliveries + return pickups</Text>
        </View>
      </DeliveryHero>

      <SafeAreaView style={styles.flex} edges={['bottom']}>
        {loading ? (
          <View style={styles.centerFill}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : showError ? (
          <ScrollView contentContainerStyle={styles.stretch} refreshControl={refreshControl}>
            <View style={styles.centerFill}>
              <Ionicons name="cloud-offline-outline" size={44} color={COLORS.tabInactive} />
              <Text style={styles.stateTitle}>Couldn&apos;t load earnings</Text>
              <Text style={styles.stateBody}>{error}</Text>
              <Pressable style={styles.retryButton} onPress={() => fetchStats(false)}>
                <Ionicons name="refresh" size={15} color={COLORS.background} />
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl}>
            {isZero ? (
              // Framed zero-state — replaces the old bare "Rs 0" grid.
              <View style={styles.emptyCard}>
                <Ionicons name="wallet-outline" size={40} color={COLORS.tabInactive} />
                <Text style={styles.stateTitle}>No earnings yet</Text>
                <Text style={styles.stateBody}>
                  Complete your first delivery to start earning
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.sectionTitle}>Breakdown</Text>

                <View style={styles.grid}>
                  <View style={[styles.tile, styles.tileIndigo]}>
                    <Text style={[styles.tileLabel, styles.tileLabelIndigo]}>Deliveries Done</Text>
                    <Text style={[styles.tileValue, styles.tileValueIndigo]}>{stats.deliveredCount}</Text>
                  </View>
                  <View style={[styles.tile, styles.tileGreen]}>
                    <Text style={[styles.tileLabel, styles.tileLabelGreen]}>🚚 From Deliveries</Text>
                    <Text style={[styles.tileValue, styles.tileValueGreen]}>{formatRs(stats.deliveryEarnings)}</Text>
                  </View>
                </View>

                <View style={styles.tile}>
                  <Text style={styles.tileLabel}>🔄 From Return Pickups</Text>
                  <Text style={styles.tileValue}>{formatRs(stats.returnEarnings)}</Text>
                  <Text style={styles.tileSub}>
                    {stats.returnPickupCount} completed pickup{stats.returnPickupCount === 1 ? '' : 's'}
                  </Text>
                </View>
              </>
            )}

            <View style={styles.noteBox}>
              <Text style={styles.noteText}>💡 Rs 50 per delivery, Rs 50 per return pickup</Text>
              <Text style={styles.noteSub}>Payout requests coming in the next update</Text>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>

      <Toast toast={toast} onHide={() => setToast(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  stretch: { flexGrow: 1 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: SPACING.xl },
  content: { padding: SPACING.lg, paddingBottom: 32 },

  // ── Hero centrepiece ──────────────────────────────────────────────────
  totalBlock: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: RADII.lg,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
  },
  totalLabel: { fontSize: 12, fontWeight: '600', color: COLORS.heroText },
  totalValue: { fontSize: 38, fontWeight: '800', color: COLORS.accentLight, marginTop: 2 },
  totalSub: { fontSize: 11, color: COLORS.heroText, marginTop: 2 },

  // ── Secondary breakdown ───────────────────────────────────────────────
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },
  grid: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md },
  tile: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  tileGreen: { backgroundColor: COLORS.successSoft, marginBottom: 0 },
  tileIndigo: { backgroundColor: COLORS.primarySoft, marginBottom: 0 },
  tileLabel: { fontSize: 11.5, color: COLORS.textMuted, marginBottom: 4 },
  tileLabelGreen: { color: COLORS.success },
  tileLabelIndigo: { color: COLORS.primary },
  // Subordinate to the hero's 38px total by design.
  tileValue: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  tileValueGreen: { color: COLORS.success },
  tileValueIndigo: { color: COLORS.primary },
  tileSub: { fontSize: 10.5, color: COLORS.tabInactive, marginTop: 3 },

  // ── States ────────────────────────────────────────────────────────────
  emptyCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    gap: 4,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  stateTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginTop: SPACING.sm },
  stateBody: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm + 2,
    marginTop: SPACING.md,
  },
  retryButtonText: { fontSize: 13, fontWeight: '700', color: COLORS.background },

  // ── Note box ──────────────────────────────────────────────────────────
  noteBox: {
    backgroundColor: COLORS.accentSoft,
    borderWidth: 1,
    borderColor: COLORS.accentLight,
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  noteText: { fontSize: 13, fontWeight: '600', color: COLORS.accent },
  noteSub: { fontSize: 11, color: COLORS.accent, marginTop: 2 },
});
