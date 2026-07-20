import { Stack } from 'expo-router';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { WishlistProvider } from '../src/context/WishlistContext';
import useNotificationTapRouter from '../src/components/NotificationTapRouter';

// AppShell exists solely so useNotificationTapRouter() (a hook, not a
// component — see that file's header comment for the Fabric crash this
// fixes) can run inside AuthProvider/WishlistProvider's context while
// <Stack /> remains the ONLY thing ever rendered here — the exact same
// single-child shape this tree had before notifications existed. Do not
// add a sibling element next to <Stack /> for this or any future
// app-lifecycle listener; call its hook from here instead.
//
// key={activeRole}: role switch (AccountScreen.js's handleSwitch ->
// switchRole() -> router.replace(homeRouteForRole(role))) still crashed
// with the same Fabric "child already has a parent" exception even with a
// single-child root, because the two role groups' navigators
// (app/(customer)/_layout.js and app/(delivery)/_layout.js) are
// structurally near-identical Tabs trees — same nesting depth, both with a
// ScreenHeader + NotificationBellIcon in the header, both registering a
// hidden route literally named "notifications". A plain router.replace
// keeps the outgoing screen's native view tree mounted alongside the
// incoming one for the duration of the stack transition; when both sides
// are this structurally similar, Fabric's mounting manager can attempt to
// reuse a native view tag from the outgoing tree for the incoming tree's
// corresponding position, racing the two into the exact reparenting crash
// this stack shows. Keying the whole <Stack> by the active role forces
// React to treat a role switch as a brand new tree — full synchronous
// unmount of the old subtree before the new one ever mounts — so there is
// no window where both role trees coexist for Fabric to confuse. Only
// changes on an actual role switch or login/logout; not on internal
// navigation (tab taps, hidden-route pushes) within a single role, so it
// doesn't affect normal in-role navigation performance.
//
// This does NOT reset useNotificationTapRouter()'s state: the hook runs in
// AppShell itself, which is not remounted (only the <Stack> element it
// returns changes key) — the listener registration, pendingRef/handledRef/
// tokenRef/userRef all survive a role switch untouched. tokenRef/userRef
// are refreshed every render regardless, so a pending cold-start push tap
// that arrives mid role-switch still replays correctly once token is set.
function AppShell() {
  useNotificationTapRouter();
  const { user } = useAuth();
  const activeRole = user?.activeRole || user?.role || 'guest';
  return <Stack key={activeRole} screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <WishlistProvider>
        <AppShell />
      </WishlistProvider>
    </AuthProvider>
  );
}
