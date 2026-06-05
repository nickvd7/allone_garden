'use strict';

/**
 * Regels voor openbare moestuin-slots: geen overlap, volledige 3×3 op gras
 * (geen water, bergen, bomen, paden of andere speler-/NPC-tuinen).
 */

const {
  MAP_W,
  MAP_H,
  gardenFootprint,
  countGardenPlots,
  isGardenSuitableCenter,
} = require('./worldBaseTerrain');

const DOCK_COORDS = [{ x: 7, y: 4 }, { x: 8, y: 4 }, { x: 9, y: 4 }];
const DESERT_COORDS = [{ x: 24, y: 2 }, { x: 25, y: 2 }, { x: 24, y: 3 }];
const ALPINE_COORDS = [{ x: 19, y: 6 }, { x: 20, y: 6 }, { x: 19, y: 7 }];

const CASTLE_BOUNDS = { minX: 10, maxX: 22, minY: 1, maxY: 4 };

const VILLAGE_POIS = [
  { x: 12, y: 2 }, { x: 14, y: 2 }, { x: 16, y: 2 }, { x: 18, y: 1 }, { x: 20, y: 1 },
];

/** Vaste NPC-thuislocaties op volledig gras, verspreid over de kaart. */
const NPC_HOMES = [
  { id: 'npc:mila', x: 2, y: 11 },
  { id: 'npc:bo', x: 27, y: 11 },
  { id: 'npc:ivy', x: 14, y: 11 },
];

/** Standaard speler-moestuinplekken — volledig gras, geen overlap met NPC's of elkaar. */
const DEFAULT_PLAYER_GARDEN_SLOTS = [
  { x: 2, y: 4 },
  { x: 5, y: 5 },
  { x: 8, y: 5 },
  { x: 11, y: 5 },
  { x: 14, y: 5 },
  { x: 11, y: 11 },
  { x: 5, y: 11 },
  { x: 8, y: 11 },
  { x: 18, y: 11 },
  { x: 24, y: 11 },
  { x: 21, y: 14 },
  { x: 8, y: 15 },
];

function footprintsOverlap(a, b) {
  const fa = gardenFootprint(a.x, a.y);
  for (const key of gardenFootprint(b.x, b.y)) {
    if (fa.has(key)) return true;
  }
  return false;
}

function buildReservedCenters() {
  const reserved = new Set();

  const markCenter = (x, y) => {
    if (Number.isInteger(x) && Number.isInteger(y)) reserved.add(`${x},${y}`);
  };

  [...DOCK_COORDS, ...DESERT_COORDS, ...ALPINE_COORDS].forEach((c) => markCenter(c.x, c.y));

  for (let y = CASTLE_BOUNDS.minY; y <= CASTLE_BOUNDS.maxY; y += 1) {
    for (let x = CASTLE_BOUNDS.minX; x <= CASTLE_BOUNDS.maxX; x += 1) {
      markCenter(x, y);
    }
  }

  VILLAGE_POIS.forEach((poi) => {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        markCenter(poi.x + dx, poi.y + dy);
      }
    }
  });

  NPC_HOMES.forEach((npc) => {
    markCenter(npc.x, npc.y);
    gardenFootprint(npc.x, npc.y).forEach((key) => reserved.add(key));
  });

  return reserved;
}

const RESERVED_TILES = buildReservedCenters();

function isValidGardenCenter(x, y) {
  if (!isGardenSuitableCenter(x, y)) return false;
  for (const key of gardenFootprint(x, y)) {
    if (RESERVED_TILES.has(key)) return false;
  }
  return true;
}

function filterNonOverlappingSlots(slots) {
  const accepted = [];
  for (const slot of slots) {
    if (!slot || !Number.isInteger(slot.x) || !Number.isInteger(slot.y)) continue;
    if (!isValidGardenCenter(slot.x, slot.y)) continue;
    if (accepted.some((other) => footprintsOverlap(slot, other))) continue;
    accepted.push({ x: slot.x, y: slot.y });
  }
  return accepted;
}

function filterValidGardenSlots(slots) {
  const list = Array.isArray(slots) && slots.length ? slots : DEFAULT_PLAYER_GARDEN_SLOTS;
  const valid = filterNonOverlappingSlots(list);
  return valid.length > 0 ? valid : DEFAULT_PLAYER_GARDEN_SLOTS;
}

function pickFallbackSlot(usedSlots) {
  const used = new Set(usedSlots);
  for (let idx = 0; idx < DEFAULT_PLAYER_GARDEN_SLOTS.length; idx += 1) {
    if (!used.has(idx)) return idx;
  }
  return 0;
}

module.exports = {
  MAP_W,
  MAP_H,
  NPC_HOMES,
  DEFAULT_PLAYER_GARDEN_SLOTS,
  gardenFootprint,
  countGardenPlots,
  footprintsOverlap,
  isValidGardenCenter,
  filterNonOverlappingSlots,
  filterValidGardenSlots,
  pickFallbackSlot,
};
