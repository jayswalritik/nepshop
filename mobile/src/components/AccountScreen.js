import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { ROLE_NAV_CONFIG, homeRouteForRole } from '../navigation/roleNavConfig';
import ScreenHeader from './ScreenHeader';
import { COLORS, RADII, SHADOWS, SPACING } from '../constants/colors';

// Shared by both customer and delivery Account tabs — exercises the real
// auth plumbing (logout, role switch). Wishlist/Offers rows are customer
// -only. Wishlist now navigates to the real hidden-route screen
// (app/(customer)/wishlist.js); Offers remains a visible-but-disabled
// "coming soon" entry — out of scope for this task.
export default function AccountScreen() {
  const { user, logout, switchRole } = useAuth();
  const [switching, setSwitching] = useState(false);

  const roles = user?.roles && user.roles.length ? user.roles : [user?.role];
  const activeRole = user?.activeRole || user?.role;
  const switchableRoles = roles.filter((r) => ROLE_NAV_CONFIG[r] && r !== activeRole);
  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase();

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const handleSwitch = async (role) => {
    setSwitching(true);
    try {
      await switchRole(role);
      router.replace(homeRouteForRole(role));
    } catch (err) {
      Alert.alert('Could not switch role', err.data?.message || 'Please try again.');
    } finally {
      setSwitching(false);
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

        {activeRole === 'customer' && (
          <View style={styles.section}>
            <AccountRow icon="heart-outline" label="Wishlist" onPress={() => router.push('/(customer)/wishlist')} />
            <AccountRow icon="pricetag-outline" label="Offers" badge="Coming soon" disabled last />
          </View>
        )}

        {switchableRoles.length > 0 && (
          <View style={styles.section}>
            {switchableRoles.map((role, i) => (
              <AccountRow
                key={role}
                icon="swap-horizontal-outline"
                label={`Switch to ${ROLE_NAV_CONFIG[role].label}`}
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
