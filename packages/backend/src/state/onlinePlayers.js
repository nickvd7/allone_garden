/**
 * onlinePlayers — in-memory registry of currently-connected players.
 *
 * Keyed by socketId so that duplicate user sessions (two tabs) each have their
 * own entry and neither accidentally removes the other on disconnect.
 *
 * Shape per entry:
 *   { userId: string, username: string, connectedAt: number }
 */
'use strict';

/** @type {Map<string, {userId:string, username:string, connectedAt:number}>} */
const _players = new Map();

/**
 * Register a socket. Auth users keep their numeric userId; guests get a synthetic
 * "guest:<socketId>" identity so world presence can still render for guest mode.
 */
function add(socketId, { userId, username }) {
  const effectiveUserId = userId ? String(userId) : `guest:${socketId}`;
  _players.set(socketId, {
    userId: effectiveUserId,
    username: username || 'Guest',
    connectedAt: Date.now(),
  });
}

/**
 * Remove a socket on disconnect.
 * Returns the removed entry, or undefined if not found.
 */
function remove(socketId) {
  const entry = _players.get(socketId);
  _players.delete(socketId);
  return entry;
}

/**
 * Returns an array of unique players (deduplicated by userId — last seen wins).
 * Suitable for broadcasting as players:list.
 */
function getAll() {
  const seen = new Map();
  for (const entry of _players.values()) {
    seen.set(entry.userId, entry);
  }
  return Array.from(seen.values());
}

/** Total unique players currently connected (authenticated + guests). */
function getCount() {
  return getAll().length;
}

/**
 * Check whether a given userId has at least one active socket.
 */
function isOnline(userId) {
  const s = String(userId);
  for (const entry of _players.values()) {
    if (entry.userId === s) return true;
  }
  return false;
}

module.exports = { add, remove, getAll, getCount, isOnline };
