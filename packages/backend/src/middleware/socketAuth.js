/**
 * Socket.IO authentication middleware.
 *
 * Runs before the 'connection' event.
 * Verifies the JWT token sent in socket.handshake.auth.token,
 * then sets socket.userId and socket.username so handlers can
 * trust the identity without further checks.
 *
 * Guest connections (no token) are allowed but get userId = null.
 * Routes that need a real user must check socket.userId explicitly.
 *
 * When Redis is available, revoked tokens (post password-change) are rejected.
 *
 * Usage in index.js:
 *   io.use(socketAuthMiddleware);
 */
const jwt              = require('jsonwebtoken');
const { isTokenRevoked } = require('../redis');

async function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth?.token;

  if (!token) {
    // Allow unauthenticated guests — they can chat and observe but not save progress
    socket.userId   = null;
    socket.username = 'Guest';
    return next();
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return next(new Error('Authentication failed: invalid or expired token'));
  }

  // Check revocation list (non-blocking — fails open when Redis is down)
  if (await isTokenRevoked(payload.userId, payload.iat)) {
    return next(new Error('Authentication failed: token has been revoked'));
  }

  socket.userId   = payload.userId;
  socket.username = payload.username;
  return next();
}

/**
 * Stricter version — rejects unauthenticated sockets entirely.
 * Use for namespaces or rooms that require login.
 */
async function requireSocketAuth(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return next(new Error('Authentication failed'));
  }

  if (await isTokenRevoked(payload.userId, payload.iat)) {
    return next(new Error('Authentication failed: token has been revoked'));
  }

  socket.userId   = payload.userId;
  socket.username = payload.username;
  return next();
}

module.exports = { socketAuthMiddleware, requireSocketAuth };
