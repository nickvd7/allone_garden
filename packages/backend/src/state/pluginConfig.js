/**
 * Shared in-memory plugin-configuration state.
 * Used as a fallback when no DATABASE_URL is configured.
 * Maps plugin name → config object.
 */
'use strict';

const configs = new Map();

module.exports = {
  get:  (name)        => configs.get(name) ?? null,
  set:  (name, cfg)   => { configs.set(name, cfg); },
  all:  ()            => Object.fromEntries(configs),
  clear: (name)       => { if (name) configs.delete(name); else configs.clear(); },
};
