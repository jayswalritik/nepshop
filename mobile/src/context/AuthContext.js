import { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import API, { setAuthToken } from '../utils/api';

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
  };

  const logout = async () => {
    // No backend session/logout endpoint exists — JWTs are stateless and
    // logout is client-side token-clearing. Best-effort: for a delivery
    // agent, flip them offline server-side BEFORE the token is cleared (the
    // request needs it to authenticate). Fire-and-forget, same as web.
    if (user?.activeRole === 'delivery' || (!user?.activeRole && user?.role === 'delivery')) {
      API.put('/delivery/availability', { isAvailable: false }).catch(() => {});
    }

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

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, switchRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
