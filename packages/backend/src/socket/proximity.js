/**
 * Proximity socket handler
 *
 * Handles three concerns for the walking world map:
 *   1. Position broadcasting   — players broadcast tile coords while walking
 *   2. Direct messages (DM)    — chat between nearby players
 *   3. WebRTC signaling relay  — offer / answer / ICE for video calls
 *
 * All WebRTC and DM messages are relayed server-side (never processed here).
 * Server-side rooms are userId strings (set up in index.js), so
 *   io.to(String(targetId)).emit(...)
 * routes the message to the correct socket.
 */
const xss = require('xss');

const XSS_OPTS = {
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
};

const MAX_DM_LEN = 300;

module.exports = function proximityHandler(socket, io) {

  // ── 1. Position broadcast ─────────────────────────────────────────────────
  // Emitted by the client every time the player moves on the world map.
  socket.on('world:position', ({ x, y }) => {
    if (typeof x !== 'number' || typeof y !== 'number') return;
    // Broadcast to everyone else so they can render this player on their map
    socket.broadcast.emit('world:player-moved', {
      userId:   socket.userId,
      username: socket.username || 'Guest',
      x,
      y,
    });
  });

  // When a socket disconnects, tell everyone to remove them from the map
  socket.once('disconnect', () => {
    if (!socket.userId) return;
    socket.broadcast.emit('world:player-offline', { userId: socket.userId });
  });

  // ── 2. Direct messages ────────────────────────────────────────────────────
  socket.on('dm:send', ({ to, text }) => {
    if (!to || typeof text !== 'string') return;
    const sanitized = xss(text.trim().slice(0, MAX_DM_LEN), XSS_OPTS);
    if (!sanitized) return;

    io.to(String(to)).emit('dm:receive', {
      from:         socket.userId,
      fromUsername: socket.username || 'Guest',
      text:         sanitized,
      timestamp:    Date.now(),
    });
  });

  // ── 3. WebRTC signaling relay ─────────────────────────────────────────────
  // The server never inspects the SDP / ICE payloads — it only routes them.

  socket.on('call:offer', ({ to, offer }) => {
    if (!to || !offer) return;
    io.to(String(to)).emit('call:offer', {
      from:         socket.userId,
      fromUsername: socket.username || 'Guest',
      offer,
    });
  });

  socket.on('call:answer', ({ to, answer }) => {
    if (!to || !answer) return;
    io.to(String(to)).emit('call:answer', {
      from:   socket.userId,
      answer,
    });
  });

  socket.on('call:ice-candidate', ({ to, candidate }) => {
    if (!to) return;
    io.to(String(to)).emit('call:ice-candidate', {
      from:      socket.userId,
      candidate,
    });
  });

  socket.on('call:reject', ({ to }) => {
    if (!to) return;
    io.to(String(to)).emit('call:reject', { from: socket.userId });
  });

  socket.on('call:end', ({ to }) => {
    if (!to) return;
    io.to(String(to)).emit('call:end', { from: socket.userId });
  });
};
