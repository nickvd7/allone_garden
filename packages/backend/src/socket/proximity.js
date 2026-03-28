/**
 * Proximity socket handler
 *
 * Handles three concerns for the walking world map:
 *   1. Position broadcasting   — players broadcast tile coords while walking
 *   2. Direct messages (DM)    — chat between nearby players
 *   3. WebRTC signaling relay  — offer / answer / ICE for video calls
 *
 * Security hardening applied:
 *   - world:position rate-limited (max 10 updates/s) and coordinate-bounds checked
 *   - DM target validated as numeric; text XSS-sanitized + length-capped
 *   - WebRTC payloads validated as plain objects; serialized size capped at 64 KB
 *   - All relay 'to' fields validated as numeric strings (db user IDs)
 *   - 'from' field on relayed messages is ALWAYS set server-side from socket.userId
 *     (clients cannot spoof it)
 */
const xss = require('xss');

const XSS_OPTS = {
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
};

const MAX_DM_LEN = 300;

// World map tile bounds (must match frontend MAP_W / MAP_H in WorldMap.js)
const MAP_W = 22;
const MAP_H = 14;

// Max serialized size (bytes) for WebRTC payloads (SDP offers can be ~4 KB; 64 KB is generous)
const MAX_WEBRTC_BYTES = 64 * 1024;

/**
 * Validate that a userId-style value is a safe numeric string.
 * Returns the string, or null if invalid.
 */
function safeUserId(value) {
  const s = String(value ?? '').trim();
  return s && /^\d+$/.test(s) ? s : null;
}

/**
 * Check that value is a plain object (not an array, Date, etc.) and
 * that its JSON serialization fits within maxBytes.
 */
function isSmallObject(value, maxBytes) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    return Buffer.byteLength(JSON.stringify(value)) <= maxBytes;
  } catch {
    return false;
  }
}

/**
 * Simple token-bucket rate limiter (shared with chat.js logic).
 */
function createRateLimiter(maxPerSecond = 10, burst = 20) {
  let tokens    = burst;
  let lastRefill = Date.now();
  return function isAllowed() {
    const now   = Date.now();
    const delta = (now - lastRefill) / 1000;
    lastRefill  = now;
    tokens = Math.min(burst, tokens + delta * maxPerSecond);
    if (tokens >= 1) { tokens -= 1; return true; }
    return false;
  };
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = function proximityHandler(socket, io) {

  const positionLimiter = createRateLimiter(10, 20);  // 10 moves/s max

  // ── 1. Position broadcast ─────────────────────────────────────────────────
  socket.on('world:position', ({ x, y }) => {
    // Rate limit
    if (!positionLimiter()) return;

    // Type + bounds check — reject floats, NaN, Infinity, and out-of-map coords
    if (
      typeof x !== 'number' || typeof y !== 'number' ||
      !Number.isInteger(x)  || !Number.isInteger(y)  ||
      x < 0 || x >= MAP_W   || y < 0 || y >= MAP_H
    ) return;

    socket.broadcast.emit('world:player-moved', {
      userId:   socket.userId,
      username: socket.username || 'Guest',
      x,
      y,
    });
  });

  socket.once('disconnect', () => {
    if (socket.userId) {
      socket.broadcast.emit('world:player-offline', { userId: socket.userId });
    }
  });

  // ── 2. Direct messages ────────────────────────────────────────────────────
  socket.on('dm:send', ({ to, text }) => {
    const targetId = safeUserId(to);
    if (!targetId) return;                          // invalid or missing target
    if (typeof text !== 'string') return;

    const sanitized = xss(text.trim().slice(0, MAX_DM_LEN), XSS_OPTS);
    if (!sanitized) return;

    io.to(targetId).emit('dm:receive', {
      from:         socket.userId,                  // set server-side — cannot be spoofed
      fromUsername: socket.username || 'Guest',
      text:         sanitized,
      timestamp:    Date.now(),
    });
  });

  // ── 3. WebRTC signaling relay ─────────────────────────────────────────────
  // The server never interprets SDP / ICE content — it only validates shape and size,
  // then routes to the correct socket room.
  // Crucially, 'from' is always socket.userId — clients cannot forge it.

  socket.on('call:offer', ({ to, offer }) => {
    const targetId = safeUserId(to);
    if (!targetId) return;
    if (!isSmallObject(offer, MAX_WEBRTC_BYTES)) return;   // must be a plain object ≤ 64 KB

    io.to(targetId).emit('call:offer', {
      from:         socket.userId,
      fromUsername: socket.username || 'Guest',
      offer,
    });
  });

  socket.on('call:answer', ({ to, answer }) => {
    const targetId = safeUserId(to);
    if (!targetId) return;
    if (!isSmallObject(answer, MAX_WEBRTC_BYTES)) return;

    io.to(targetId).emit('call:answer', {
      from:   socket.userId,
      answer,
    });
  });

  socket.on('call:ice-candidate', ({ to, candidate }) => {
    const targetId = safeUserId(to);
    if (!targetId) return;
    // candidate can be null (end-of-candidates marker) or a plain object ≤ 4 KB
    if (candidate !== null && !isSmallObject(candidate, 4096)) return;

    io.to(targetId).emit('call:ice-candidate', {
      from:      socket.userId,
      candidate,
    });
  });

  socket.on('call:reject', ({ to }) => {
    const targetId = safeUserId(to);
    if (!targetId) return;
    io.to(targetId).emit('call:reject', { from: socket.userId });
  });

  socket.on('call:end', ({ to }) => {
    const targetId = safeUserId(to);
    if (!targetId) return;
    io.to(targetId).emit('call:end', { from: socket.userId });
  });
};
