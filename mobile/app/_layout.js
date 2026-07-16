import { Stack } from 'expo-router';
import { AuthProvider } from '../src/context/AuthContext';
import { WishlistProvider } from '../src/context/WishlistContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <WishlistProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </WishlistProvider>
    </AuthProvider>
  );
}
