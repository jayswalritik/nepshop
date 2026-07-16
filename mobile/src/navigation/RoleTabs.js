import { Tabs } from 'expo-router';
import { ROLE_NAV_CONFIG } from './roleNavConfig';
import { COLORS } from '../constants/colors';

// Shared tab-bar shell for every role. A role's app/(<role>)/_layout.js is
// just `<RoleTabs role="..." />` — the tab list itself comes from the
// registry, so it stays in one place.
export default function RoleTabs({ role }) {
  const config = ROLE_NAV_CONFIG[role];
  const hiddenRoutes = config.hiddenRoutes || [];

  return (
    <Tabs
      screenOptions={{
        // Every tab screen renders its own header (ScreenHeader, or Home's
        // gradient hero) — the default react-navigation title bar never
        // shows anywhere in the app.
        headerShown: false,
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.tabInactive,
        tabBarStyle: { backgroundColor: COLORS.background, borderTopColor: COLORS.border },
      }}
    >
      {config.tabs.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
      ))}
      {hiddenRoutes.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ href: null, headerShown: false }} />
      ))}
    </Tabs>
  );
}
