/**
 * Proximity socket handler
 *
 * Handles three concerns for the walking world map:
 *   1. Position broadcasting   — players broadcast tile coords while walking
 *   2. Direct messages (DM)    — chat between nearby or searched players
 *   3. WebRTC signaling relay  — offer / answer / ICE for video/audio calls
 *
 * Security hardening:
 *   - world:position rate-limited (max 10 updates/s) + coordinate-bounds checked
 *   - dm:send requires authenticated sender (no guests), rate-limited (3/s, burst 8),
 *     XSS-sanitized, and length-capped
 *   - call:offer / call:reject / call:end require authenticated sender, rate-limited
 *     (2 call events/s, burst 4) to prevent ring-spam harassment
 *   - WebRTC payloads validated as plain objects; serialized size capped at 64 KB
 *   - All relay 'to' fields validated as numeric strings (db user IDs)
 *   - 'from' is ALWAYS set server-side from socket.userId — cannot be spoofed
 *   - audioOnly flag is relayed as boolean so recipient shows correct UI
 */
const xss = require('xss');
const db  = require('../db');

const XSS_OPTS = {
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
};

const MAX_DM_LEN = 300;

// World map tile bounds (must match frontend MAP_W / MAP_H in WorldMap.js)
const MAP_W = 32;
const MAP_H = 20;

// Max serialized size (bytes) for WebRTC payloads (SDP offers ~4 KB; 64 KB is generous)
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
 * Simple token-bucket rate limiter.
 */
function createRateLimiter(maxPerSecond = 10, burst = 20) {
  let tokens     = burst;
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

  const positionLimiter = createRateLimiter(10, 20);  // 10 moves/s
  const dmLimiter       = createRateLimiter(3,  8);   // 3 DMs/s, burst 8
  const callLimiter     = createRateLimiter(2,  4);   // 2 call-signals/s, burst 4
  const iceLimiter      = createRateLimiter(25, 50);  // ICE candidates are high-freq during setup

  // ── 1. Position broadcast ─────────────────────────────────────────────────
  socket.on('world:position', ({ x, y }) => {
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
    // Guests (userId = null) cannot send DMs — no stable identity to reply to
    if (!socket.userId) return;

    if (!dmLimiter()) return;                           // rate limit

    const targetId = safeUserId(to);
    if (!targetId) return;                              // invalid or missing target

    // Prevent DMs to self
    if (targetId === String(socket.userId)) return;

    if (typeof text !== 'string') return;

    const sanitized = xss(text.trim().slice(0, MAX_DM_LEN), XSS_OPTS);
    if (!sanitized) return;

    const timestamp = Date.now();

    io.to(targetId).emit('dm:receive', {
      from:         socket.userId,                      // set server-side — cannot be spoofed
      fromUsername: socket.username,
      text:         sanitized,
      timestamp,
    });

    // Persist to DB (fire-and-forget)
    if (db.isConnected()) {
      db.query(
        'INSERT INTO direct_messages (from_user_id, to_user_id, message) VALUES ($1, $2, $3)',
        [socket.userId, targetId, sanitized]
      ).catch((err) => console.error('[dm] DB write failed:', err.message));
    }
  });

  // ── 3. WebRTC signaling relay ─────────────────────────────────────────────
  // The server never interprets SDP / ICE content — it only validates shape/size,
  // then routes to the correct socket room.
  // 'from' is always socket.userId so clients cannot spoof caller identity.
  // 'audioOnly' is relayed as a boolean so the recipient shows the correct UI.

  socket.on('call:offer', ({ to, offer, audioOnly }) => {
    // Only authenticated users may initiate calls
    if (!socket.userId) return;

    if (!callLimiter()) return;                         // prevent ring-spam

    const targetId = safeUserId(to);
    if (!targetId) return;
    if (targetId === String(socket.userId)) return;     // no calls to self
    if (!isSmallObject(offer, MAX_WEBRTC_BYTES)) return;

    io.to(targetId).emit('call:offer', {
      from:         socket.userId,
      fromUsername: socket.username,
      offer,
      audioOnly:    audioOnly === true,                 // strict boolean coercion
    });
  });

  socket.on('call:answer', ({ to, answer }) => {
    if (!socket.userId) return;
    if (!callLimiter()) return;

    const targetId = safeUserId(to);
    if (!targetId) return;
    if (!isSmallObject(answer, MAX_WEBRTC_BYTES)) return;

    io.to(targetId).emit('call:answer', {
      from:   socket.userId,
      answer,
    });
  });

  socket.on('call:ice-candidate', ({ to, candidate }) => {
    if (!socket.userId) return;
    if (!iceLimiter()) return;   // dedicated high-capacity bucket for ICE trickle

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
    if (!socket.userId) return;
    if (!callLimiter()) return;

    const targetId = safeUserId(to);
    if (!targetId) return;
    io.to(targetId).emit('call:reject', { from: socket.userId });
  });

  socket.on('call:end', ({ to }) => {
    if (!socket.userId) return;
    if (!callLimiter()) return;

    const targetId = safeUserId(to);
    if (!targetId) return;
    io.to(targetId).emit('call:end', { from: socket.userId });
  });

  // ── 4. Group call room management ─────────────────────────────────────────
  // groupCallRooms is module-scoped so it persists across socket connections.
  socket.on('group-call:create', ({ roomId }) => {
    if (!socket.userId) return;
    if (!roomId || typeof roomId !== 'string' || roomId.length > 64) return;
    if (!module.exports._groupCallRooms) module.exports._groupCallRooms = {};
    const rooms = module.exports._groupCallRooms;
    if (!rooms[roomId]) rooms[roomId] = new Set();
    rooms[roomId].add(socket.id);
    socket.join(`group-call:${roomId}`);
    socket.emit('group-call:created', { roomId, participants: [] });
  });

  socket.on('group-call:join', ({ roomId }) => {
    if (!socket.userId) return;
    if (!roomId || typeof roomId !== 'string' || roomId.length > 64) return;
    if (!module.exports._groupCallRooms) module.exports._groupCallRooms = {};
    const rooms = module.exports._groupCallRooms;
    const room = rooms[roomId];
    if (!room) return;
    const existingParticipants = [...room].map((sid) => {
      const s = io.sockets.sockets.get(sid);
      return s ? { socketId: sid, userId: s.userId, username: s.username } : null;
    }).filter(Boolean);
    room.add(socket.id);
    socket.join(`group-call:${roomId}`);
    // Notify existing participants of new joiner
    socket.to(`group-call:${roomId}`).emit('group-call:peer-joined', {
      peerId: socket.id, userId: socket.userId, username: socket.username,
    });
    // Send list of existing participants to new joiner
    socket.emit('group-call:joined', { roomId, participants: existingParticipants });
  });

  socket.on('group-call:leave', ({ roomId }) => {
    if (roomId && module.exports._groupCallRooms?.[roomId]) {
      module.exports._groupCallRooms[roomId].delete(socket.id);
      if (module.exports._groupCallRooms[roomId].size === 0) {
        delete module.exports._groupCallRooms[roomId];
      }
    }
    if (roomId) {
      socket.to(`group-call:${roomId}`).emit('group-call:peer-left', { peerId: socket.id });
      socket.leave(`group-call:${roomId}`);
    }
  });

  socket.on('group-call:offer', ({ to, offer }) => {
    if (!socket.userId) return;
    if (!isSmallObject(offer, MAX_WEBRTC_BYTES)) return;
    io.to(to).emit('group-call:offer', { from: socket.id, offer });
  });

  socket.on('group-call:answer', ({ to, answer }) => {
    if (!socket.userId) return;
    if (!isSmallObject(answer, MAX_WEBRTC_BYTES)) return;
    io.to(to).emit('group-call:answer', { from: socket.id, answer });
  });

  socket.on('group-call:ice', ({ to, candidate }) => {
    if (!socket.userId) return;
    if (candidate !== null && !isSmallObject(candidate, 4096)) return;
    io.to(to).emit('group-call:ice', { from: socket.id, candidate });
  });
};
