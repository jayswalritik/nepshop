import { Stack } from 'expo-router';
import { AuthProvider } from '../src/context/AuthContext';
import { WishlistProvider } from '../src/context/WishlistContext';
import useNotificationTapRouter from '../src/components/NotificationTapRouter';

// AppShell exists solely so useNotificationTapRouter() (a hook, not a
// component — see that file's header comment for the Fabric crash this
// fixes) can run inside AuthProvider/WishlistProvider's context while
// <Stack /> remains the ONLY thing ever rendered here — the exact same
// single-child shape this tree had before notifications existed. Do not
// add a sibling element next to <Stack /> for this or any future
// app-lifecycle listener; call its hook from here instead.
function AppShell() {
  useNotificationTapRouter();
  return <Stack screenOptions={{ headerShown: false }} />;
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
