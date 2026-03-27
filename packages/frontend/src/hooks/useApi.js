/**
 * Thin wrapper around fetch that injects the JWT token from localStorage
 * and returns parsed JSON.  Falls back gracefully when the backend is offline.
 */
const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function getToken() {
  return localStorage.getItem('garden_token');
}

// Thrown when the server returns 429 Too Many Requests
export class RateLimitError extends Error {
  constructor(retryAfter) {
    super('Too many requests — please slow down.');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter; // seconds, may be undefined
  }
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${BASE}${path}`, { ...options, headers });

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    throw new RateLimitError(retryAfter ? parseInt(retryAfter, 10) : undefined);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  get:    (path)         => apiFetch(path),
  post:   (path, body)   => apiFetch(path, { method: 'POST',   body: JSON.stringify(body) }),
  delete: (path, body)   => apiFetch(path, { method: 'DELETE', body: JSON.stringify(body) }),
};

export default api;
