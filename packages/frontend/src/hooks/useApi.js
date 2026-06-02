/**
 * Thin wrapper around fetch that injects the JWT (Bearer and/or HttpOnly cookie)
 * and returns parsed JSON.  Falls back gracefully when the backend is offline.
 */
import { getBearerAuthHeader, getFetchCredentials } from '../auth/session';

const BASE = process.env.REACT_APP_API_URL || '';

// Thrown when the server returns 429 Too Many Requests
export class RateLimitError extends Error {
  constructor(retryAfter) {
    super('Too many requests — please slow down.');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter; // seconds, may be undefined
  }
}

/** 409 — garden was saved elsewhere; `detail` contains server garden + serverUpdatedAt */
export class ConflictError extends Error {
  constructor(detail) {
    super('Garden conflict');
    this.name = 'ConflictError';
    this.detail = detail;
  }
}

async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...getBearerAuthHeader(),
    ...(options.headers || {}),
  };

  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    credentials: getFetchCredentials(),
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    throw new RateLimitError(retryAfter ? parseInt(retryAfter, 10) : undefined);
  }

  if (response.status === 409) {
    const body = await response.json().catch(() => ({}));
    if (body.error === 'conflict') throw new ConflictError(body);
    throw new Error(body.error || body.message || 'HTTP 409');
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
  put:    (path, body)   => apiFetch(path, { method: 'PUT',    body: JSON.stringify(body) }),
  patch:  (path, body)   => apiFetch(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete: (path, body)   => apiFetch(path, { method: 'DELETE', body: JSON.stringify(body) }),
};

export default api;
