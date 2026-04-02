/**
 * Shared in-memory world-map state.
 * Used as a fallback when no DATABASE_URL is configured.
 * Both the public /api/world route and the admin /api/admin/world route
 * read/write through this module so they share a single source of truth.
 */
'use strict';

let currentMap = null; // null = "use client default"

module.exports = {
  get: ()      => currentMap,
  set: (map)   => { currentMap = map; },
  clear: ()    => { currentMap = null; },
};
