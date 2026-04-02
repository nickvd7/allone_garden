'use strict';
/**
 * contentStore.js — runtime content registry.
 *
 * Merges built-in default game data with any custom items saved by admins.
 * Custom items are stored in server_config under keys:
 *   content_plants | content_structures | content_tools | content_weather
 *
 * Merge strategy:
 *   • Custom item with same slug/id as a default → overrides the default
 *   • Custom item with new slug/id → appended after defaults
 *   • Custom item with _deleted: true → removed from the merged list
 */

const { PLANTS, STRUCTURES, TOOLS, WEATHER } = require('./defaultContent');

// ── In-memory custom overrides ────────────────────────────────────────────────
// Shape: { plants: [...], structures: [...], tools: [...], weather: [...] }
let customs = { plants: [], structures: [], tools: [], weather: [] };

// ── Merge helper ──────────────────────────────────────────────────────────────
/**
 * Merges defaults with custom overrides.
 * @param {object[]} defaults  — default items array
 * @param {object[]} overrides — custom items array
 * @param {string}   idField   — 'slug' for plants, 'id' for others
 * @returns {object[]} merged list (deleted items excluded)
 */
function merge(defaults, overrides, idField) {
  // Build a map of custom items keyed by idField
  const customMap = new Map(overrides.map((item) => [item[idField], item]));

  // Override or keep defaults
  const merged = defaults
    .map((def) => customMap.get(def[idField]) || def)
    .filter((item) => !item._deleted);

  // Append brand-new custom items (not in defaults)
  const defaultIds = new Set(defaults.map((d) => d[idField]));
  overrides
    .filter((c) => !defaultIds.has(c[idField]) && !c._deleted)
    .forEach((c) => merged.push(c));

  return merged;
}

// ── Public API ────────────────────────────────────────────────────────────────
module.exports = {
  /** Full merged list of plants */
  getPlants()     { return merge(PLANTS,     customs.plants,     'slug'); },
  /** Full merged list of structures */
  getStructures() { return merge(STRUCTURES, customs.structures, 'id');   },
  /** Full merged list of tools */
  getTools()      { return merge(TOOLS,      customs.tools,      'id');   },
  /** Full merged list of weather conditions */
  getWeather()    { return merge(WEATHER,    customs.weather,    'id');   },

  /** All four merged lists in one object */
  getAll() {
    return {
      plants:     this.getPlants(),
      structures: this.getStructures(),
      tools:      this.getTools(),
      weather:    this.getWeather(),
    };
  },

  /**
   * Replace the full custom-overrides array for a content type.
   * Called on startup (load from DB) and whenever an admin saves changes.
   * @param {'plants'|'structures'|'tools'|'weather'} type
   * @param {object[]} items
   */
  setCustom(type, items) {
    if (!Object.prototype.hasOwnProperty.call(customs, type)) {
      throw new Error(`Unknown content type: ${type}`);
    }
    customs[type] = Array.isArray(items) ? items : [];
  },

  /**
   * Returns the raw custom-overrides array for a type (not merged with defaults).
   */
  getCustom(type) {
    return customs[type] ?? [];
  },

  /** Reset all custom overrides (used in tests) */
  clear() {
    customs = { plants: [], structures: [], tools: [], weather: [] };
  },
};
