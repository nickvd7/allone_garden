/** Kasteeldorp met gracht, binnenplein en loopbrug — sync layout in WorldMap + WorldBuilder. */

export const CASTLE = {
  minX: 10,
  maxX: 22,
  innerMinX: 12,
  innerMaxX: 20,
  innerMinY: 1,
  innerMaxY: 3,
  drawbridge: { x: 16, y: 4 },
  gate: { x: 16, y: 3 },
};

export const CASTLE_DRAWBRIDGE = CASTLE.drawbridge;

/** Teken kasteel + gracht op de basiskaart (vóór wegen). */
export function applyCastleVillage(map, tileCodes) {
  const { W, T, V, P } = tileCodes;
  const { minX, maxX, innerMinX, innerMaxX, innerMinY, innerMaxY, drawbridge } = CASTLE;

  for (let x = minX; x <= maxX; x += 1) {
    if (map[0]?.[x] !== undefined) map[0][x] = T;
  }

  for (let y = innerMinY; y <= innerMaxY; y += 1) {
    for (let x = innerMinX; x <= innerMaxX; x += 1) {
      if (map[y]?.[x] !== undefined && map[y][x] !== W) map[y][x] = V;
    }
  }

  for (let x = minX; x <= maxX; x += 1) {
    if (!map[4]) continue;
    map[4][x] = x === drawbridge.x ? P : W;
  }

  for (let y = innerMinY; y <= innerMaxY; y += 1) {
    [minX, minX + 1, maxX - 1, maxX].forEach((x) => {
      if (map[y]?.[x] !== undefined) map[y][x] = W;
    });
  }
}

export function isCastleVillageTile(x, y) {
  return x >= CASTLE.minX && x <= CASTLE.maxX && y >= 1 && y <= 4;
}

export function isCastleDrawbridge(x, y) {
  return x === CASTLE.drawbridge.x && y === CASTLE.drawbridge.y;
}

export function isCastleGate(x, y) {
  return x === CASTLE.gate.x && y === CASTLE.gate.y;
}
