/**
 * Browser auth session helpers.
 *
 * Default: JWT in localStorage (garden_token) + Bearer header.
 * Optional: set REACT_APP_AUTH_HTTPONLY=true together with backend AUTH_HTTPONLY_COOKIE=true
 * so the token is only in an HttpOnly cookie (mitigates XSS token theft; use CSP as well).
 */

export const AUTH_HTTPONLY = process.env.REACT_APP_AUTH_HTTPONLY === 'true';

export function getFetchCredentials() {
  return AUTH_HTTPONLY ? 'include' : 'same-origin';
}

export function getBearerAuthHeader() {
  if (AUTH_HTTPONLY) return {};
  try {
    const t = localStorage.getItem('garden_token');
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}

/** @returns {string|null} */
export function readGardenToken() {
  if (AUTH_HTTPONLY) return null;
  try {
    return localStorage.getItem('garden_token');
  } catch {
    return null;
  }
}

export function persistGardenToken(token) {
  if (AUTH_HTTPONLY || !token) return;
  try {
    localStorage.setItem('garden_token', token);
  } catch { /* quota */ }
}

export function clearGardenToken() {
  try {
    localStorage.removeItem('garden_token');
  } catch { /* ignore */ }
}

/**
 * True when authenticated API calls can be made (registered user, not guest).
 * @param {{ id?: number }|null} authUser
 * @param {string|null} authToken — null in HttpOnly mode
 */
export function hasAuthenticatedApi(authUser, authToken) {
  return !!(authUser && authUser.id > 0 && (authToken || AUTH_HTTPONLY));
}
