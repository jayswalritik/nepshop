import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { isRoleSupported, homeRouteForRole } from '../src/navigation/roleNavConfig';
import { COLORS } from '../src/constants/colors';

// Entry gate: waits for session restore, then sends the user to the right
// place — login, their role's home tab, or the unsupported-role screen.
export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  const activeRole = user.activeRole || user.role;

  if (!isRoleSupported(activeRole)) {
    return <Redirect href="/unsupported" />;
  }

  return <Redirect href={homeRouteForRole(activeRole)} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
});
