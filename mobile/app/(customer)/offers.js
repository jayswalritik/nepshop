import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import API from '../../src/utils/api';
import AppHero from '../../src/components/AppHero';
import Toast from '../../src/components/Toast';
import { COLORS, RADII, SHADOWS, SPACING } from '../../src/constants/colors';
import { formatRs } from '../../src/utils/format';

// Pushed hidden route (mobile/src/navigation/roleNavConfig.js's
// hiddenRoutes), reached from the Account tab's "Offers" row — mirrors
// frontend/src/pages/customer/OffersPage.jsx (same GET /coupons/available
// endpoint web's Offers tab AND CartPage's suggestion list both call). All
// eligibility filtering (isActive/isPublic/not-expired/under usage limit)
// already happens server-side in couponController.getAvailableCoupons —
// this screen only renders what the API returns, no client-side filtering
// or business logic, same as web.
//
// STANDING RULE: hidden-route screens showing server state stay mounted in
// the background — useFocusEffect refetches on every focus, never a
// mount-only useEffect.
const discountLabel = (c) => (c.type === 'fixed' ? `Rs ${c.value} OFF` : `${c.value}% OFF`);

export default function OffersScreen() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);
  const [toast, setToast] = useState(null);

  const fetchOffers = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const { data } = await API.get('/coupons/available');
      setCoupons(data.coupons || []);
    } catch {
      // leave prior list in place on failure
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchOffers(false);
    }, [fetchOffers])
  );

  const handleRefresh = () => fetchOffers(true);

  const handleCopy = async (code) => {
    await Clipboard.setStringAsync(code);
    setCopiedCode(code);
    setToast({ type: 'success', message: `Copied "${code}"` });
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <AppHero title="Offers & Coupons" onBack={() => router.back()} subtitle="Apply these codes at checkout to save" wordmarkSuffix=" · Customer" />

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : coupons.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
        >
          <View style={styles.centerFill}>
            <Text style={styles.emptyGlyph}>🎟️</Text>
            <Text style={styles.emptyTitle}>No offers right now</Text>
            <Text style={styles.emptyBody}>Check back soon for new deals and discounts</Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
        >
          {coupons.map((c) => (
            <View key={c.code} style={styles.card}>
              <View style={styles.stub}>
                <Text style={styles.stubEyebrow}>SAVE</Text>
                <Text style={styles.stubValue}>{discountLabel(c)}</Text>
              </View>

              <View style={styles.details}>
                <Text style={styles.description} numberOfLines={2}>
                  {c.description || discountLabel(c)}
                </Text>

                <View style={styles.metaWrap}>
                  {c.minOrder > 0 && <Text style={styles.meta}>Min. order: {formatRs(c.minOrder)}</Text>}
                  {c.type === 'percentage' && c.maxDiscount > 0 && (
                    <Text style={styles.meta}>Max discount: {formatRs(c.maxDiscount)}</Text>
                  )}
                  {c.expiresAt && (
                    <Text style={styles.meta}>
                      Expires: {new Date(c.expiresAt).toLocaleDateString('en-NP', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  )}
                </View>

                <View style={styles.codeRow}>
                  <View style={styles.codeBox}>
                    <Text style={styles.codeText}>{c.code}</Text>
                  </View>
                  <Pressable style={styles.copyButton} onPress={() => handleCopy(c.code)} hitSlop={6}>
                    <Text style={styles.copyButtonText}>{copiedCode === c.code ? '✓ Copied' : 'Copy'}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <Toast toast={toast} onHide={() => setToast(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: SPACING.xl },
  emptyContainer: { flexGrow: 1 },
  emptyGlyph: { fontSize: 44, marginBottom: SPACING.sm },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  emptyBody: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
  list: { padding: SPACING.lg, paddingBottom: 32, gap: SPACING.md },
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  stub: {
    width: 92,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  stubEyebrow: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.heroText,
    marginBottom: 2,
  },
  stubValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 19,
  },
  details: {
    flex: 1,
    padding: SPACING.md,
  },
  description: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  metaWrap: {
    marginBottom: SPACING.sm,
    gap: 1,
  },
  meta: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  codeBox: {
    flex: 1,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.sm - 2,
  },
  codeText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 1,
  },
  copyButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  copyButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
});
