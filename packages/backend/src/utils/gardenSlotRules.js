'use strict';

/**
 * Regels voor openbare moestuin-slots: geen overlap met dok, dorps-POI's, biomes of NPC-huizen.
 */

const MAP_W = 32;
const MAP_H = 20;

const DOCK_COORDS = [{ x: 7, y: 4 }, { x: 8, y: 4 }, { x: 9, y: 4 }];
const DESERT_COORDS = [{ x: 24, y: 2 }, { x: 25, y: 2 }, { x: 24, y: 3 }];
const ALPINE_COORDS = [{ x: 19, y: 6 }, { x: 20, y: 6 }, { x: 19, y: 7 }];

const CASTLE_BOUNDS = { minX: 10, maxX: 22, minY: 1, maxY: 4 };

const VILLAGE_POIS = [
  { x: 12, y: 2 }, { x: 14, y: 2 }, { x: 16, y: 2 }, { x: 18, y: 1 }, { x: 20, y: 1 },
];

/** Vaste NPC-thuislocaties (niet in speler-slots). */
const NPC_HOMES = [
  { id: 'npc:mila', x: 4, y: 12 },
  { id: 'npc:bo', x: 25, y: 15 },
  { id: 'npc:ivy', x: 15, y: 16 },
];

/** Standaard speler-moestuinplekken — geen dok/biome/kasteel/NPC overlap. */
const DEFAULT_PLAYER_GARDEN_SLOTS = [
  { x: 3, y: 3 },
  { x: 28, y: 16 },
  { x: 3, y: 16 },
  { x: 28, y: 3 },
  { x: 5, y: 9 },
  { x: 26, y: 9 },
  { x: 11, y: 11 },
  { x: 20, y: 11 },
  { x: 6, y: 6 },
  { x: 25, y: 6 },
  { x: 11, y: 17 },
  { x: 20, y: 17 },
];

function gardenFootprint(cx, cy) {
  const tiles = [`${cx},${cy}`];
  for (let i = 0; i < 9; i += 1) {
    const tx = cx - 1 + (i % 3);
    const ty = cy + 1 + Math.floor(i / 3);
    tiles.push(`${tx},${ty}`);
  }
  return tiles;
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

function isOnMap(x, y) {
  return x >= 0 && x < MAP_W && y >= 0 && y < MAP_H;
}

function isValidGardenCenter(x, y) {
  if (!isOnMap(x, y)) return false;
  const key = `${x},${y}`;
  if (RESERVED_TILES.has(key)) return false;
  return !gardenFootprint(x, y).some((tile) => RESERVED_TILES.has(tile));
}

function filterValidGardenSlots(slots) {
  const list = Array.isArray(slots) && slots.length ? slots : DEFAULT_PLAYER_GARDEN_SLOTS;
  const valid = list.filter((s) => isValidGardenCenter(s.x, s.y));
  return valid.length > 0 ? valid : DEFAULT_PLAYER_GARDEN_SLOTS;
}

function pickFallbackSlot(usedSlots) {
  const used = new Set(usedSlots);
  for (const slot of DEFAULT_PLAYER_GARDEN_SLOTS) {
    const idx = DEFAULT_PLAYER_GARDEN_SLOTS.indexOf(slot);
    if (!used.has(idx)) return idx;
  }
  return 0;
}

module.exports = {
  MAP_W,
  MAP_H,
  NPC_HOMES,
  DEFAULT_PLAYER_GARDEN_SLOTS,
  isValidGardenCenter,
  filterValidGardenSlots,
  pickFallbackSlot,
};
