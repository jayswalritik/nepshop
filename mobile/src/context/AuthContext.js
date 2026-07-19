import { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import API, { setAuthToken } from '../utils/api';
import { setPushToken } from '../utils/notifications';
import { registerForPushNotifications } from '../utils/push';

const AuthContext = createContext(null);

// Same key names as web's localStorage (frontend/src/context/AuthContext.jsx)
// for consistency — storage backend differs (SecureStore vs localStorage) so
// there's no actual collision, this is just naming convention.
const TOKEN_KEY = 'nepshop_token';
const USER_KEY = 'nepshop_user';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from secure storage on launch, then refresh from the
  // backend to pick up role approvals/status changes — mirrors the web flow.
  useEffect(() => {
    (async () => {
      const [savedToken, savedUser] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY),
        SecureStore.getItemAsync(USER_KEY),
      ]);

      if (savedToken && savedUser) {
        setToken(savedToken);
        setAuthToken(savedToken);
        setUser(JSON.parse(savedUser));

        // Fire-and-forget, same posture as the /auth/me refresh below — a
        // denied permission or Expo Go's unsupported remote push shouldn't
        // block session restore. Registers again on every restore (not just
        // first login) since the underlying Expo push token can rotate.
        registerForPushNotifications();

        try {
          const { data } = await API.get('/auth/me');
          if (data?.user) {
            setUser(data.user);
            await SecureStore.setItemAsync(USER_KEY, JSON.stringify(data.user));
          }
        } catch {
          // Keep cached user if refresh fails (e.g. Render cold start).
        }
      }

      setLoading(false);
    })();
  }, []);

  const login = async (userData, userToken) => {
    setUser(userData);
    setToken(userToken);
    setAuthToken(userToken);
    await SecureStore.setItemAsync(TOKEN_KEY, userToken);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(userData));
    // Fire-and-forget — same posture as the restore-effect's call above.
    registerForPushNotifications();
  };

  const logout = async () => {
    // No backend session/logout endpoint exists — JWTs are stateless and
    // logout is client-side token-clearing. Best-effort, BEFORE the token is
    // cleared (both these calls need auth): flip a delivery agent offline
    // server-side, and clear the push token so a stale token on this device
    // doesn't linger against the account after logout. Fire-and-forget, same
    // as web.
    if (user?.activeRole === 'delivery' || (!user?.activeRole && user?.role === 'delivery')) {
      API.put('/delivery/availability', { isAvailable: false }).catch(() => {});
    }
    setPushToken(null).catch(() => {});

    setUser(null);
    setToken(null);
    setAuthToken(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  };

  // Same endpoint as web's RoleSwitcher (POST /auth/switch-role), then
  // persists the returned user the same way a fresh login would.
  const switchRole = async (role) => {
    const { data } = await API.post('/auth/switch-role', { role });
    await login(data.user, token);
    return data.user;
  };

  // Same PUT /auth/customer/profile (default) or /auth/delivery/profile
  // endpoint as web's ProfilePage.jsx/delivery ProfilePage.jsx — the
  // response doesn't include a new token, so this persists the returned
  // user against the EXISTING token the same way switchRole above does.
  // Role-conditional via the endpoint argument (matches how logout() above
  // extends role-conditionally rather than forking) — customer's call site
  // is unchanged, delivery's profile screen passes the second argument.
  const updateProfile = async (updates, endpoint = '/auth/customer/profile') => {
    const { data } = await API.put(endpoint, updates);
    await login(data.user, token);
    return data.user;
  };

  // Merges a partial patch into the in-memory user + persisted storage
  // without a full re-login round trip — mirrors web's AuthContext.jsx
  // updateUser exactly. Used for optimistic UI (e.g. delivery agent
  // availability toggle) where the server call's own response is the
  // eventual source of truth, but the UI shouldn't wait for it to update.
  const updateUser = async (partial) => {
    if (!user) return;
    const next = { ...user, ...partial };
    setUser(next);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(next));
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, switchRole, updateProfile, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
