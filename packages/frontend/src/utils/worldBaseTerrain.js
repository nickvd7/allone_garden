/**
 * Basisterrein van de wereldkaart (vóór wegen naar tuinen) — sync met backend.
 */

export const MAP_W = 32;
export const MAP_H = 20;

const G = 0;
const P = 1;
const W = 2;
const T = 3;
const D = 4;
const M = 5;
const K = 7;
const V = 8;

const BIOME_ZONE_COORDS = [
  { x: 24, y: 2 }, { x: 25, y: 2 }, { x: 24, y: 3 },
  { x: 7, y: 4 }, { x: 8, y: 4 }, { x: 9, y: 4 },
  { x: 19, y: 6 }, { x: 20, y: 6 }, { x: 19, y: 7 },
];

const CASTLE = {
  minX: 10, maxX: 22, innerMinX: 12, innerMaxX: 20, innerMinY: 1, innerMaxY: 3,
  drawbridge: { x: 16, y: 4 },
};

function applyCastleVillage(map) {
  for (let x = CASTLE.minX; x <= CASTLE.maxX; x += 1) {
    if (map[0]) map[0][x] = T;
  }
  for (let y = CASTLE.innerMinY; y <= CASTLE.innerMaxY; y += 1) {
    for (let x = CASTLE.innerMinX; x <= CASTLE.innerMaxX; x += 1) {
      if (map[y]?.[x] !== undefined && map[y][x] !== W) map[y][x] = V;
    }
  }
  for (let x = CASTLE.minX; x <= CASTLE.maxX; x += 1) {
    if (!map[4]) continue;
    map[4][x] = x === CASTLE.drawbridge.x ? P : W;
  }
  for (let y = CASTLE.innerMinY; y <= CASTLE.innerMaxY; y += 1) {
    [CASTLE.minX, CASTLE.minX + 1, CASTLE.maxX - 1, CASTLE.maxX].forEach((x) => {
      if (map[y]?.[x] !== undefined) map[y][x] = W;
    });
  }
}

export function buildBaseTerrainMap() {
  const map = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => G));

  for (let y = 0; y < MAP_H; y += 1) map[y][Math.floor(MAP_W / 2)] = P;
  for (let x = 0; x < MAP_W; x += 1) map[Math.floor(MAP_H / 2)][x] = P;

  [
    [4, 3], [5, 3], [6, 3], [4, 4], [5, 4], [6, 4],
    [25, 3], [26, 3], [27, 3], [25, 4], [26, 4], [27, 4],
    [4, 15], [5, 15], [6, 15], [4, 16], [5, 16], [6, 16],
    [25, 15], [26, 15], [27, 15], [25, 16], [26, 16], [27, 16],
  ].forEach(([x, y]) => { map[y][x] = W; });

  [
    [2, 2], [3, 2], [2, 3], [29, 2], [28, 2], [29, 3],
    [2, 17], [3, 17], [2, 16], [29, 17], [28, 17], [29, 16],
    [15, 1], [16, 1], [15, 18], [16, 18], [1, 9], [30, 10],
  ].forEach(([x, y]) => { map[y][x] = T; });

  for (let y = 0; y <= 6; y += 1) {
    for (let x = 21; x < MAP_W; x += 1) {
      if (map[y][x] === G) map[y][x] = D;
    }
  }

  [
    [20, 5], [21, 5], [22, 5], [23, 6], [24, 7], [25, 8], [26, 9], [27, 10],
    [23, 11], [22, 12], [21, 13], [20, 14],
  ].forEach(([x, y]) => {
    if (map[y] && map[y][x] !== W) map[y][x] = M;
  });

  applyCastleVillage(map);

  BIOME_ZONE_COORDS.forEach(({ x, y }, idx) => {
    if (!map[y]) return;
    if (map[y][x] === W) map[y][x] = K;
    else if (map[y][x] === T || map[y][x] === M) map[y][x] = G;
    else if (idx >= 3 && idx <= 5) map[y][x] = K;
  });

  return map;
}

export const BASE_TERRAIN = buildBaseTerrainMap();

function isOnMap(x, y) {
  return x >= 0 && x < MAP_W && y >= 0 && y < MAP_H;
}

export function gardenFootprint(cx, cy) {
  const tiles = new Set();
  if (!isOnMap(cx, cy)) return tiles;
  tiles.add(`${cx},${cy}`);
  for (let i = 0; i < 9; i += 1) {
    const tx = cx - 1 + (i % 3);
    const ty = cy + 1 + Math.floor(i / 3);
    if (isOnMap(tx, ty)) tiles.add(`${tx},${ty}`);
  }
  return tiles;
}

export function buildProtectedGardenTileSet(centers) {
  const set = new Set();
  centers.forEach(({ x, y }) => {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return;
    gardenFootprint(x, y).forEach((key) => set.add(key));
  });
  return set;
}

export function countGardenPlots(cx, cy) {
  let count = 0;
  for (let i = 0; i < 9; i += 1) {
    const tx = cx - 1 + (i % 3);
    const ty = cy + 1 + Math.floor(i / 3);
    if (isOnMap(tx, ty)) count += 1;
  }
  return count;
}

/** Alleen volledige 3×3 op gras — geen water, bomen, bergen, paden, dok, woestijn, dorp. */
export function isGardenSuitableCenter(cx, cy, terrainMap = BASE_TERRAIN) {
  if (countGardenPlots(cx, cy) !== 9) return false;
  for (const key of gardenFootprint(cx, cy)) {
    const [x, y] = key.split(',').map(Number);
    if (terrainMap[y][x] !== G) return false;
  }
  return true;
}
