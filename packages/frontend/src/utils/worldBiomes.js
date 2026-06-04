/** Biome metadata and optional 3×1 world garden strips (plots 9–17 in game state). */

export const BIOME_TILE = {
  0: 'grass',
  1: 'path',
  2: 'water',
  3: 'forest',
  4: 'garden',
  5: 'desert',
  6: 'mountain',
  7: 'dock',
  8: 'village',
};

export const BIOME_ZONES = [
  {
    id: 'desert',
    emoji: '🏜️',
    labelKey: 'worldMap.biome_desert',
    hintKey: 'worldMap.biome_desert_hint',
    /** 3 tiles in NE desert */
    coords: [{ x: 24, y: 2 }, { x: 25, y: 2 }, { x: 24, y: 3 }],
    plotIndices: [9, 10, 11],
  },
  {
    id: 'dock',
    emoji: '🌊',
    labelKey: 'worldMap.biome_water',
    hintKey: 'worldMap.biome_water_hint',
    coords: [{ x: 7, y: 4 }, { x: 8, y: 4 }, { x: 9, y: 4 }],
    plotIndices: [12, 13, 14],
  },
  {
    id: 'alpine',
    emoji: '⛰️',
    labelKey: 'worldMap.biome_alpine',
    hintKey: 'worldMap.biome_alpine_hint',
    coords: [{ x: 19, y: 6 }, { x: 20, y: 6 }, { x: 19, y: 7 }],
    plotIndices: [15, 16, 17],
  },
];

export function buildBiomeCoordMaps() {
  const coordToPlot = {};
  const coordToZone = {};
  BIOME_ZONES.forEach((zone) => {
    zone.coords.forEach((c, i) => {
      const key = `${c.x},${c.y}`;
      coordToPlot[key] = zone.plotIndices[i];
      coordToZone[key] = zone;
    });
  });
  return { coordToPlot, coordToZone };
}

export function biomeForTileCode(code) {
  return BIOME_TILE[code] || 'grass';
}
