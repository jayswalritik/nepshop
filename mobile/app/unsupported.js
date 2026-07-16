import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/context/AuthContext';
import { ROLE_NAV_CONFIG, homeRouteForRole } from '../src/navigation/roleNavConfig';
import ScreenHeader from '../src/components/ScreenHeader';
import { COLORS, RADII, SPACING } from '../src/constants/colors';

// Shown for activeRole === 'seller' | 'admin' — those roles have no app
// experience yet. If the account also holds a supported role, offer a
// switch instead of a dead end. Styled shell, same as every other screen —
// only the content ("not yet supported") is a placeholder.
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
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader title="NepShop" />
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="phone-portrait-outline" size={30} color={COLORS.primary} />
        </View>
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
    padding: SPACING.xl,
    gap: SPACING.xs,
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
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  body: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  switcher: {
    width: '100%',
    alignItems: 'center',
    marginTop: SPACING.xl,
    gap: SPACING.sm,
  },
  switchButton: {
    width: '100%',
    maxWidth: 280,
    paddingVertical: SPACING.md,
    borderRadius: RADII.sm + 2,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: 'center',
  },
  switchButtonText: {
    color: COLORS.primary,
    fontWeight: '600',
  },
});
