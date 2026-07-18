import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { ROLE_NAV_CONFIG, homeRouteForRole } from '../navigation/roleNavConfig';
import { updateAvailability } from '../utils/delivery';
import ScreenHeader from './ScreenHeader';
import { COLORS, RADII, SHADOWS, SPACING } from '../constants/colors';

// Shared by both customer and delivery Account tabs — exercises the real
// auth plumbing (logout, role switch, role-switcher visibility). Edit
// Profile/Wishlist/Offers rows are customer-only, each navigating to a real
// hidden-route screen (app/(customer)/profile.js, wishlist.js, offers.js).
// Delivery's own rows (availability toggle, Edit Profile & Payout) are the
// same pattern extended, not forked — mirrors frontend/src/pages/delivery/
// Dashboard.jsx's sidebar (availability toggle) + ProfilePage.jsx (profile
// editing entry point).
export default function AccountScreen() {
  const { user, logout, switchRole, updateUser } = useAuth();
  const [switching, setSwitching] = useState(false);
  const [availLoading, setAvailLoading] = useState(false);

  const roles = user?.roles && user.roles.length ? user.roles : [user?.role];
  const activeRole = user?.activeRole || user?.role;
  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase();

  // Mirrors frontend/src/components/common/RoleSwitcher.jsx exactly: hidden
  // entirely for single-role accounts or anyone holding admin (regardless
  // of what other roles they also have), never just filtered per-row. Web's
  // dropdown lists every role the account holds (seller included — its
  // roleConfig map has a seller entry) — mobile has no seller tab set, so
  // that one row falls through handleSwitch's `|| '/unsupported'` fallback
  // below (same fallback login.js already uses) and lands on the existing
  // "not yet available in the app" screen instead of a broken tab set.
  const showSwitcher = roles.length >= 2 && !roles.includes('admin');
  const switchableRoles = showSwitcher
    ? roles.filter((r) => r !== activeRole && (ROLE_NAV_CONFIG[r] || r === 'seller'))
    : [];
  const roleLabel = (r) => ROLE_NAV_CONFIG[r]?.label || r.charAt(0).toUpperCase() + r.slice(1);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const handleSwitch = async (role) => {
    setSwitching(true);
    try {
      await switchRole(role);
      router.replace(homeRouteForRole(role) || '/unsupported');
    } catch (err) {
      Alert.alert('Could not switch role', err.data?.message || 'Please try again.');
    } finally {
      setSwitching(false);
    }
  };

  // Availability toggle — UI/sorting signal only (backend/models/User.js —
  // never gates assignment, deliveries, or settlements). Optimistic, with
  // reconcile-on-failure (revert + alert) — mirrors web's Dashboard.jsx
  // toggleAvailability exactly (lines ~42-55).
  const toggleAvailability = async () => {
    const next = !user?.isAvailable;
    await updateUser({ isAvailable: next });
    setAvailLoading(true);
    const result = await updateAvailability(next);
    setAvailLoading(false);
    if (result.success) {
      await updateUser({ isAvailable: result.isAvailable });
    } else {
      await updateUser({ isAvailable: !next });
      Alert.alert('Could not update availability', result.message || 'Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Account" />
      <View style={styles.container}>
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials || '?'}</Text>
          </View>
          <Text style={styles.name}>{user?.firstName} {user?.lastName}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>{ROLE_NAV_CONFIG[activeRole]?.label || activeRole} mode</Text>
          </View>
        </View>

        {activeRole === 'delivery' && (
          <View style={styles.availabilityCard}>
            <View style={styles.availabilityTextWrap}>
              <Text style={styles.availabilityLabel}>Availability</Text>
              <Text style={styles.availabilitySub}>
                {user?.isAvailable ? 'Showing as available for new assignments' : 'Showing as offline'}
              </Text>
            </View>
            <Switch
              value={!!user?.isAvailable}
              onValueChange={toggleAvailability}
              disabled={availLoading}
              trackColor={{ false: COLORS.border, true: COLORS.successSoft }}
              thumbColor={user?.isAvailable ? COLORS.success : '#fff'}
            />
          </View>
        )}

        {activeRole === 'customer' && (
          <View style={styles.section}>
            <AccountRow icon="create-outline" label="Edit Profile" onPress={() => router.push('/(customer)/profile')} />
            <AccountRow icon="heart-outline" label="Wishlist" onPress={() => router.push('/(customer)/wishlist')} />
            <AccountRow icon="pricetag-outline" label="Offers" onPress={() => router.push('/(customer)/offers')} last />
          </View>
        )}

        {activeRole === 'delivery' && (
          <View style={styles.section}>
            <AccountRow icon="create-outline" label="Edit Profile & Payout" onPress={() => router.push('/(delivery)/profile')} last />
          </View>
        )}

        {switchableRoles.length > 0 && (
          <View style={styles.section}>
            {switchableRoles.map((role, i) => (
              <AccountRow
                key={role}
                icon="swap-horizontal-outline"
                label={`Switch to ${roleLabel(role)}`}
                onPress={() => handleSwitch(role)}
                disabled={switching}
                last={i === switchableRoles.length - 1}
              />
            ))}
          </View>
        )}

        <View style={styles.section}>
          <AccountRow
            icon="log-out-outline"
            label="Log out"
            onPress={handleLogout}
            tone="danger"
            last
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function AccountRow({ icon, label, onPress, disabled, badge, tone = 'default', last }) {
  const iconColor = tone === 'danger' ? COLORS.danger : COLORS.primary;
  const labelColor = tone === 'danger' ? COLORS.danger : COLORS.text;

  return (
    <Pressable
      style={[styles.row, !last && styles.rowDivider]}
      onPress={onPress}
      disabled={disabled || !onPress}
    >
      <View style={[styles.rowIconWrap, disabled && styles.rowIconWrapDisabled]}>
        <Ionicons name={icon} size={18} color={disabled ? COLORS.tabInactive : iconColor} />
      </View>
      <Text style={[styles.rowLabel, { color: labelColor }, disabled && styles.rowLabelDisabled]}>
        {label}
      </Text>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={16} color={COLORS.tabInactive} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    padding: SPACING.lg,
  },
  profile: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  avatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  email: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
    marginBottom: SPACING.sm,
  },
  rolePill: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
  },
  rolePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  section: {
    backgroundColor: COLORS.card,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.lg,
    ...SHADOWS.card,
  },
  availabilityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.card,
  },
  availabilityTextWrap: { flex: 1, marginRight: SPACING.md },
  availabilityLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  availabilitySub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowIconWrap: {
    width: 32,
    height: 32,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconWrapDisabled: {
    opacity: 0.6,
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  rowLabelDisabled: {
    color: COLORS.tabInactive,
  },
  badge: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.tabInactive,
  },
});
