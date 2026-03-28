/**
 * Chat socket handler — hardened version.
 *
 * Security measures:
 *  - XSS sanitization on every message (strips HTML/JS)
 *  - Per-socket rate limiting (max 2 msg/s, burst of 5)
 *  - Message length cap (500 chars)
 *  - Username binding from JWT (set by socketAuthMiddleware)
 *  - Typing indicator throttle (no extra data passed through)
 */
const xss = require('xss');
const db  = require('../db');

// XSS options — strip ALL HTML tags, keep plain text only
const XSS_OPTIONS = {
  whiteList: {},         // no tags allowed
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
};

const MAX_MESSAGE_LENGTH = 500;

/**
 * Simple token-bucket rate limiter per socket.
 * Allows a burst of up to BURST messages,
 * then enforces MAX_PER_SECOND.
 */
function createRateLimiter(maxPerSecond = 2, burst = 5) {
  let tokens    = burst;
  let lastRefill = Date.now();

  return function isAllowed() {
    const now   = Date.now();
    const delta = (now - lastRefill) / 1000;
    lastRefill  = now;
    tokens = Math.min(burst, tokens + delta * maxPerSecond);

    if (tokens >= 1) {
      tokens -= 1;
      return true;
    }
    return false;
  };
}

module.exports = function chatHandler(socket, io) {
  const rateLimiter = createRateLimiter(2, 5);

  socket.on('chat:message', (data) => {
    // Rate limit check
    if (!rateLimiter()) {
      socket.emit('chat:error', { message: 'You are sending messages too fast.' });
      return;
    }

    // Validate payload shape
    if (!data || typeof data.text !== 'string') return;

    const raw   = data.text.trim();
    if (raw.length === 0) return;
    if (raw.length > MAX_MESSAGE_LENGTH) {
      socket.emit('chat:error', { message: `Message too long (max ${MAX_MESSAGE_LENGTH} chars).` });
      return;
    }

    // Sanitize: strip all HTML/JS before broadcasting
    const sanitized = xss(raw, XSS_OPTIONS);

    const message = {
      id:        Date.now(),
      userId:    socket.userId,                    // set by socketAuthMiddleware (never from client)
      username:  socket.username || 'Guest',       // idem
      text:      sanitized,
      timestamp: new Date(),
    };

    io.emit('chat:message', message);

    // Persist to DB (fire-and-forget; guests have no userId so skip)
    if (socket.userId && db.pool) {
      db.pool
        .query(
          'INSERT INTO chat_messages (user_id, message) VALUES ($1, $2)',
          [socket.userId, sanitized]
        )
        .catch((err) => console.error('[chat] DB write failed:', err.message));
    }
  });

  socket.on('chat:typing', () => {
    // Re-use the same rate limiter — typing events count toward the same budget
    if (!rateLimiter()) return;
    // Only broadcast the fact that someone is typing — no client-supplied data
    socket.broadcast.emit('chat:typing', {
      userId:    socket.userId,
      username:  socket.username || 'Guest',
      isTyping:  true,
    });
  });
};
