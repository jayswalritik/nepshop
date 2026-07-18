import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getDeliveryOrders } from '../../src/utils/delivery';
import ScreenHeader from '../../src/components/ScreenHeader';
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
export default function EarningsScreen() {
  const [stats, setStats] = useState({ deliveryEarnings: 0, deliveredCount: 0, returnEarnings: 0, returnPickupCount: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
  const totalEarned = stats.deliveryEarnings + stats.returnEarnings;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Earnings" />
      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchStats(true)} tintColor={COLORS.primary} />}
        >
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Earnings Summary</Text>

            <View style={styles.grid}>
              <View style={[styles.tile, styles.tileGreen]}>
                <Text style={[styles.tileLabel, styles.tileLabelGreen]}>Total Earned</Text>
                <Text style={[styles.tileValue, styles.tileValueGreen]}>{formatRs(totalEarned)}</Text>
                <Text style={[styles.tileSub, styles.tileLabelGreen]}>Deliveries + return pickups</Text>
              </View>
              <View style={[styles.tile, styles.tileIndigo]}>
                <Text style={[styles.tileLabel, styles.tileLabelIndigo]}>Deliveries Done</Text>
                <Text style={[styles.tileValue, styles.tileValueIndigo]}>{stats.deliveredCount}</Text>
              </View>
            </View>

            <View style={styles.grid}>
              <View style={styles.tile}>
                <Text style={styles.tileLabel}>🚚 From Deliveries</Text>
                <Text style={styles.tileValueSmall}>{formatRs(stats.deliveryEarnings)}</Text>
              </View>
              <View style={styles.tile}>
                <Text style={styles.tileLabel}>🔄 From Return Pickups</Text>
                <Text style={styles.tileValueSmall}>{formatRs(stats.returnEarnings)}</Text>
                <Text style={styles.tileSub}>
                  {stats.returnPickupCount} completed pickup{stats.returnPickupCount === 1 ? '' : 's'}
                </Text>
              </View>
            </View>

            <View style={styles.noteBox}>
              <Text style={styles.noteText}>💡 Rs 50 per delivery, Rs 50 per return pickup</Text>
              <Text style={styles.noteSub}>Payout requests coming in the next update</Text>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: SPACING.lg, paddingBottom: 32 },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: SPACING.lg,
    ...SHADOWS.card,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.md },
  grid: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md },
  tile: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADII.md, padding: SPACING.md },
  tileGreen: { backgroundColor: COLORS.successSoft },
  tileIndigo: { backgroundColor: COLORS.primarySoft },
  tileLabel: { fontSize: 11.5, color: COLORS.textMuted, marginBottom: 4 },
  tileLabelGreen: { color: COLORS.success },
  tileLabelIndigo: { color: COLORS.primary },
  tileValue: { fontSize: 22, fontWeight: '700' },
  tileValueGreen: { color: COLORS.success },
  tileValueIndigo: { color: COLORS.primary },
  tileValueSmall: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  tileSub: { fontSize: 10.5, color: COLORS.tabInactive, marginTop: 3 },
  noteBox: {
    backgroundColor: COLORS.accentSoft,
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  noteText: { fontSize: 13, fontWeight: '600', color: COLORS.accent },
  noteSub: { fontSize: 11, color: COLORS.accent, marginTop: 2 },
});
