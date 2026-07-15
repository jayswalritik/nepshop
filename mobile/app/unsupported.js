import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { ROLE_NAV_CONFIG, homeRouteForRole } from '../src/navigation/roleNavConfig';
import { COLORS } from '../src/constants/colors';

// Shown for activeRole === 'seller' | 'admin' — those roles have no app
// experience yet. If the account also holds a supported role, offer a
// switch instead of a dead end.
export default function UnsupportedRoleScreen() {
  const { user, switchRole } = useAuth();
  const [switching, setSwitching] = useState(false);

  const roles = user?.roles && user.roles.length ? user.roles : [user?.role];
  const switchableRoles = roles.filter((r) => ROLE_NAV_CONFIG[r]);

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
      <Text style={styles.title}>Not yet available in the app</Text>
      <Text style={styles.body}>
        This role isn't supported in the NepShop app yet. Please use the website instead.
      </Text>

      {switchableRoles.length > 0 && (
        <View style={styles.switcher}>
          {switchableRoles.map((role) => (
            <Pressable
              key={role}
              style={styles.switchButton}
              disabled={switching}
              onPress={() => handleSwitch(role)}
            >
              <Text style={styles.switchButtonText}>
                Switch to {ROLE_NAV_CONFIG[role].label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: COLORS.background,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  switcher: {
    width: '100%',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
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
});
