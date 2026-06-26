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

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('nepshop_token');
    localStorage.removeItem('nepshop_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook — use this anywhere to get auth state
export const useAuth = () => useContext(AuthContext);