/** Ring coordinates around the 3×3 garden (house at hx, hy; plots at y+1..y+3). */
export const STRUCTURE_RING_OFFSETS = [
  [-2, 1], [-2, 2], [-2, 3],
  [2, 1], [2, 2], [2, 3],
  [-1, 4], [0, 4], [1, 4],
  [-1, 0], [1, 0],
  [-2, 0], [2, 0],
];

export function getStructureRingCoords(hx, hy) {
  return STRUCTURE_RING_OFFSETS.map(([dx, dy]) => ({ x: hx + dx, y: hy + dy }));
}

export function firstFreeStructureSlot(structures = {}) {
  const used = new Set();
  Object.values(structures).forEach((st) => {
    if (st?.built && Number.isInteger(st.ringSlot)) used.add(st.ringSlot);
  });
  for (let i = 0; i < STRUCTURE_RING_OFFSETS.length; i += 1) {
    if (!used.has(i)) return i;
  }
  return -1;
}
