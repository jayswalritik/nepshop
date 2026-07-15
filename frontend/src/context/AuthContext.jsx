import { createContext, useContext, useState, useEffect } from 'react';
import API from '../utils/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load user from localStorage on app start, then refresh from backend
  useEffect(() => {
    const savedToken = localStorage.getItem('nepshop_token');
    const savedUser  = localStorage.getItem('nepshop_user');

    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));

      // Refresh from backend to pick up role approvals, status changes, etc.
      API.get('/auth/me')
        .then(({ data }) => {
          if (data?.user) {
            setUser(data.user);
            localStorage.setItem('nepshop_user', JSON.stringify(data.user));
          }
        })
        .catch(() => { /* keep cached user if refresh fails */ })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = (userData, userToken) => {
    setUser(userData);
    setToken(userToken);
    localStorage.setItem('nepshop_token', userToken);
    localStorage.setItem('nepshop_user', JSON.stringify(userData));
  };

  // Merges partial fields into the cached user (state + localStorage) —
  // used for optimistic updates (e.g. delivery agent availability) without
  // a full re-login.
  const updateUser = (partial) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      localStorage.setItem('nepshop_user', JSON.stringify(next));
      return next;
    });
  };

  const logout = () => {
    // No backend session/logout endpoint exists — JWTs are stateless and
    // logout is purely client-side token-clearing. Best-effort: for a
    // delivery agent, flip them offline server-side BEFORE the token is
    // removed (the request needs it to authenticate). Fire-and-forget —
    // never blocks logout on network latency.
    if (user?.activeRole === 'delivery' || (!user?.activeRole && user?.role === 'delivery')) {
      API.put('/delivery/availability', { isAvailable: false }).catch(() => {});
    }

    setUser(null);
    setToken(null);
    localStorage.removeItem('nepshop_token');
    localStorage.removeItem('nepshop_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, updateUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook — use this anywhere to get auth state
export const useAuth = () => useContext(AuthContext);