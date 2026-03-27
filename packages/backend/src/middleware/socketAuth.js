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
 * Usage in index.js:
 *   io.use(socketAuthMiddleware);
 */
const jwt = require('jsonwebtoken');

function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth?.token;

  if (!token) {
    // Allow unauthenticated guests — they can chat and observe but not save progress
    socket.userId   = null;
    socket.username = 'Guest';
    return next();
  }

  try {
    const payload   = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId   = payload.userId;
    socket.username = payload.username;
    return next();
  } catch (err) {
    // Reject connections with invalid / expired tokens
    return next(new Error('Authentication failed: invalid or expired token'));
  }
}

/**
 * Stricter version — rejects unauthenticated sockets entirely.
 * Use for namespaces or rooms that require login.
 */
function requireSocketAuth(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));

  try {
    const payload   = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId   = payload.userId;
    socket.username = payload.username;
    return next();
  } catch {
    return next(new Error('Authentication failed'));
  }
}

module.exports = { socketAuthMiddleware, requireSocketAuth };
