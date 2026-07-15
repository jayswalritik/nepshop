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
// export const API_BASE_URL = 'http://192.168.1.23:5000/api';

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

const request = async (method, path, body) => {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(data?.message || 'Request failed', res.status, data);
  }

  return { data };
};

const API = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
};

export default API;
