import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { ROLE_NAV_CONFIG, homeRouteForRole } from '../navigation/roleNavConfig';
import { COLORS } from '../constants/colors';

// Account placeholder — exercises the real auth plumbing (logout, role
// switch) even though it has no other account-management features yet.
export default function AccountScreen() {
  const { user, logout, switchRole } = useAuth();
  const [switching, setSwitching] = useState(false);

  const roles = user?.roles && user.roles.length ? user.roles : [user?.role];
  const activeRole = user?.activeRole || user?.role;
  const switchableRoles = roles.filter((r) => ROLE_NAV_CONFIG[r] && r !== activeRole);

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
    <View style={styles.container}>
      <Text style={styles.title}>Account</Text>
      <Text style={styles.name}>
        {user?.firstName} {user?.lastName}
      </Text>
      <Text style={styles.email}>{user?.email}</Text>
      <Text style={styles.role}>{ROLE_NAV_CONFIG[activeRole]?.label || activeRole} mode</Text>

      {switchableRoles.length > 0 && (
        <View style={styles.switcher}>
          <Text style={styles.switcherLabel}>Switch mode</Text>
          {switchableRoles.map((role) => (
            <Pressable
              key={role}
              style={styles.switchButton}
              disabled={switching}
              onPress={() => handleSwitch(role)}
            >
              <Text style={styles.switchButtonText}>
                {ROLE_NAV_CONFIG[role].label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <Pressable style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>Log out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    padding: 24,
    gap: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.text,
  },
  email: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  role: {
    fontSize: 13,
    color: COLORS.primary,
    marginBottom: 16,
  },
  switcher: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
    gap: 8,
  },
  switcherLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  switchButton: {
    width: '100%',
    maxWidth: 280,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: 'center',
  },
  switchButtonText: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  logoutButton: {
    width: '100%',
    maxWidth: 280,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    marginTop: 12,
  },
  logoutButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
