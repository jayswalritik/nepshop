import { Stack } from 'expo-router';
import { AuthProvider } from '../src/context/AuthContext';
import { WishlistProvider } from '../src/context/WishlistContext';
import NotificationTapRouter from '../src/components/NotificationTapRouter';

export default function RootLayout() {
  return (
    <AuthProvider>
      <WishlistProvider>
        <Stack screenOptions={{ headerShown: false }} />
        <NotificationTapRouter />
      </WishlistProvider>
    </AuthProvider>
  );
}
