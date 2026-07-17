import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
      // Hidden routes (href:null screens below) are registered as tab
      // routes in this same navigator, not stack-pushed screens — so both
      // Android hardware back and in-app back buttons (router.back()) go
      // through the tab router's GO_BACK handling. The default
      // backBehavior ('firstRoute') only ever remembers "current + first
      // tab", so back always lands on the first tab (Home) no matter where
      // you came from. 'history' makes the router track real visit order,
      // so back correctly returns to whichever tab/hidden-route was
      // actually active before.
      backBehavior="history"
      screenOptions={{
        // Every tab screen renders its own header (ScreenHeader, or Home's
        // gradient hero) — the default react-navigation title bar never
        // shows anywhere in the app.
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.tabInactive,
        tabBarStyle: { backgroundColor: COLORS.background, borderTopColor: COLORS.border },
      }}
    >
      {config.tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, size }) => <Ionicons name={tab.icon} size={size} color={color} />,
          }}
        />
      ))}
      {hiddenRoutes.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ href: null, headerShown: false }} />
      ))}
    </Tabs>
  );
}
