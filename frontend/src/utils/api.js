import axios from 'axios';

// Must match backend/middleware/authMiddleware.js's SUSPENDED_MESSAGE
// verbatim — this is how a suspension-triggered 403 is told apart from any
// other 403 (e.g. role-restriction "Access denied") on ANY protected route,
// not just login.
const SUSPENDED_MESSAGE = 'Your account has been suspended. Please contact support.';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

// Automatically attach token to every request if it exists
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('nepshop_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A previously-valid session can turn invalid mid-session (admin suspends
// the account) — the backend now enforces this on every request via
// protect(). When it does, force the same logout + suspended-message
// experience the login page already gives a suspended login attempt,
// instead of leaving stale "logged in" state on screen while every action
// silently 403s. AuthPage picks the message up from sessionStorage on its
// next mount (reuses its existing apiError banner — see AuthPage.jsx).
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 403 && error.response?.data?.message === SUSPENDED_MESSAGE) {
      localStorage.removeItem('nepshop_token');
      localStorage.removeItem('nepshop_user');
      sessionStorage.setItem('nepshop_suspended_notice', SUSPENDED_MESSAGE);
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default API;