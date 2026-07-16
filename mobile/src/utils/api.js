// Mirrors frontend/src/utils/api.js's contract: same base URL pattern, same
// Authorization: Bearer header. Uses fetch (built into React Native) instead
// of axios — this scaffold intentionally adds no HTTP library dependency.

// Render free-tier backend. It sleeps when idle — the first request after a
// period of inactivity can take 30-60s to respond. That's a cold start, not
// a bug; don't add a shorter timeout that would misdiagnose it as one.
export const API_BASE_URL = 'https://nepshop-i10t.onrender.com/api';

// For local development against a backend running on your own machine, swap
// the export above for this one — a physical phone in Expo Go cannot reach
// "localhost" or "127.0.0.1" (those resolve to the phone itself), so you
// must use your computer's LAN IP instead, e.g.:
//export const API_BASE_URL = 'http://192.168.1.69:5000/api';
let authToken = null;

// Called by AuthContext whenever the token changes (login/logout/restore),
// so every request from that point on carries the current session.
export const setAuthToken = (token) => {
  authToken = token;
};

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

// `options.signal` (an AbortController's signal) is optional and additive —
// every existing call site that omits it behaves exactly as before. Search
// is the first caller that needs it, to cancel a superseded in-flight
// request (React Native's global fetch supports AbortController natively).
const request = async (method, path, body, options = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options.signal,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(data?.message || 'Request failed', res.status, data);
  }

  return { data };
};

const API = {
  get: (path, options) => request('GET', path, undefined, options),
  post: (path, body, options) => request('POST', path, body, options),
  put: (path, body, options) => request('PUT', path, body, options),
  patch: (path, body, options) => request('PATCH', path, body, options),
  delete: (path, options) => request('DELETE', path, undefined, options),
};

export default API;
