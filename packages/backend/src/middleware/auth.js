/**
 * JWT authentication middleware.
 * Attach to any route that requires a logged-in user.
 *
 * Usage:
 *   const { requireAuth } = require('../middleware/auth');
 *   router.get('/protected', requireAuth, handler);
 *
 * On success injects req.user = { userId, username }.
 *
 * When Redis is available, tokens that were revoked after a password change
 * or account deletion are rejected with 401 even if they are cryptographically
 * valid.  Falls back gracefully when Redis is unavailable.
 */
const jwt                           = require('jsonwebtoken');
const { isTokenRevoked }            = require('../redis');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = header.slice(7);

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'Token expired or invalid' });
  }

  // Check Redis revocation list (non-blocking — fails open when Redis is down)
  if (await isTokenRevoked(payload.userId, payload.iat)) {
    return res.status(401).json({ error: 'Token has been revoked — please log in again' });
  }

  req.user = { userId: payload.userId, username: payload.username };
  next();
}

/**
 * Optional auth — attaches req.user when a valid token is present,
 * but never blocks the request. Useful for public endpoints that
 * show extra info to logged-in users.
 */
async function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET, { algorithms: ['HS256'] });
      if (!(await isTokenRevoked(payload.userId, payload.iat))) {
        req.user = { userId: payload.userId, username: payload.username };
      }
    } catch {
      // Ignore invalid token for optional auth
    }
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
