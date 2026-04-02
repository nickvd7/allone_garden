/**
 * Players socket handler.
 *
 * Maintains the live roster of online players and emits the events that the
 * frontend WorldMap and PlayersPanel components expect:
 *
 *   players:list    → sent to the newly-connected socket only (initial snapshot)
 *   player:joined   → broadcast to everyone else when a user connects
 *   player:left     → broadcast to everyone else when a user disconnects
 *
 * Both authenticated and guest sockets are tracked.
 */
'use strict';

const onlinePlayers = require('../state/onlinePlayers');

module.exports = function playersHandler(socket, _io) {
  const { userId, username } = socket;

  // ── Register this socket ──────────────────────────────────────────────────
  onlinePlayers.add(socket.id, { userId, username });

  // Tell everyone else a new player has joined
  socket.broadcast.emit('player:joined', {
    id:       userId ? String(userId) : `guest:${socket.id}`,
    username: username || 'Guest',
  });

  // ── Send current roster to the joining socket ─────────────────────────────
  socket.emit('players:list', onlinePlayers.getAll().map((p) => ({
    id:       p.userId,
    username: p.username,
  })));

  // ── Clean up on disconnect ────────────────────────────────────────────────
  socket.once('disconnect', () => {
    const removed = onlinePlayers.remove(socket.id);
    if (!removed) return;

    // Only broadcast player:left if the user has NO other sockets still open
    if (!onlinePlayers.isOnline(removed.userId)) {
      socket.broadcast.emit('player:left', { id: removed.userId });
    }
  });
};
