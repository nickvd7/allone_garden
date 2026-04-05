'use strict';

/**
 * Optional HttpOnly cookie for the JWT (same name as localStorage key for consistency).
 * Enable with AUTH_HTTPONLY_COOKIE=true; pair the SPA with REACT_APP_AUTH_HTTPONLY=true.
 */
const COOKIE_NAME = 'garden_token';

function httpOnlyCookieEnabled() {
  return process.env.AUTH_HTTPONLY_COOKIE === 'true';
}

function parseJwtExpiresMs() {
  const raw = (process.env.JWT_EXPIRES_IN || '7d').trim();
  const m = /^(\d+)([smhd])$/i.exec(raw);
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = parseInt(m[1], 10);
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * (mult[m[2].toLowerCase()] || 86_400_000);
}

/**
 * @param {import('express').Response} res
 * @param {string} token
 */
function setAuthCookie(res, token) {
  if (!httpOnlyCookieEnabled() || !token) return;
  const sameSiteEnv = (process.env.AUTH_COOKIE_SAMESITE || '').toLowerCase();
  const sameSite =
    sameSiteEnv === 'none' || sameSiteEnv === 'strict' || sameSiteEnv === 'lax'
      ? sameSiteEnv
      : 'lax';
  const secure =
    sameSite === 'none' || process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: parseJwtExpiresMs(),
    path: '/',
  });
}

/** @param {import('express').Response} res */
function clearAuthCookie(res) {
  if (!httpOnlyCookieEnabled()) return;
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

/**
 * Prefer Authorization header; fall back to cookie when HttpOnly mode is on.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function getBearerTokenFromRequest(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim() || null;
  }
  if (httpOnlyCookieEnabled() && req.cookies && req.cookies[COOKIE_NAME]) {
    const c = req.cookies[COOKIE_NAME];
    return typeof c === 'string' && c.trim() ? c.trim() : null;
  }
  return null;
}

module.exports = {
  COOKIE_NAME,
  httpOnlyCookieEnabled,
  setAuthCookie,
  clearAuthCookie,
  getBearerTokenFromRequest,
};
