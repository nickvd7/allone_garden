/** Shared tile colors / helpers for DOM + Pixi map renderers */

export const TILE_BG_HEX = {
  0: '#5fa33a',
  1: '#b8955a',
  2: '#3a8fc8',
  3: '#3a7a22',
  4: '#8bc34a',
  5: '#d2b56b',
  6: '#8a9099',
  7: '#6d4f2a',
  8: '#8b7b62',
};

/** Pixi gradient stops per biome kind (top → bottom) */
export const BIOME_PIXI_GRADIENTS = {
  grass: ['#6fb044', '#5fa33a', '#4a852e'],
  path: ['#c9a86a', '#b8955a', '#9a7d48'],
  water: ['#4aa3d8', '#2b6cb0', '#1e4f7a'],
  forest: ['#3d7a32', '#2e5c28', '#1b3d18'],
  mountain: ['#a8b0b8', '#6e7680', '#4a5058'],
  desert: ['#e8d4a0', '#d2b56b', '#b8954a'],
  dock: ['#8b6914', '#6d4f2a', '#523a18'],
  garden: ['#8bc34a', '#7bc67e', '#689f38'],
  village: ['#a89878', '#8b7b62', '#6e5f4a'],
};

export function hexToPixiColor(hex) {
  const h = String(hex || '#5fa33a').replace('#', '');
  return parseInt(h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h.slice(0, 6), 16);
}

export function biomeKindForTile(tileCode) {
  if (tileCode === 2) return 'water';
  if (tileCode === 3) return 'forest';
  if (tileCode === 4) return 'garden';
  if (tileCode === 5) return 'mountain';
  if (tileCode === 7) return 'dock';
  if (tileCode === 8) return 'village';
  if (tileCode === 1) return 'path';
  return 'grass';
}

export function tileBackgroundHex(tileCode, { highlighted = false } = {}) {
  if (tileCode === 4) return highlighted ? '#7bc67e' : '#8bc34a';
  return TILE_BG_HEX[tileCode] || TILE_BG_HEX[0];
}

export function tilePixiGradient(tileCode, { highlighted = false } = {}) {
  const kind = biomeKindForTile(tileCode);
  if (kind === 'garden' && highlighted) {
    return ['#8fd492', '#7bc67e', '#6aab5a'];
  }
  return BIOME_PIXI_GRADIENTS[kind] || BIOME_PIXI_GRADIENTS.grass;
}

export function drawPixiTileBackground(Graphics, pxTile, gradientStops) {
  const g = new Graphics();
  const pad = 1;
  const size = pxTile - pad;
  const stops = gradientStops.length >= 2 ? gradientStops : [gradientStops[0], gradientStops[0]];
  const bandH = size / (stops.length - 1);
  stops.forEach((hex, i) => {
    const y0 = i * bandH;
    const h = i === stops.length - 1 ? size - y0 : bandH + 0.5;
    g.rect(0, y0, size, h);
    g.fill(hexToPixiColor(hex));
  });
  // inset depth (match CSS box-shadow)
  g.rect(size - 2, 2, 2, size - 4);
  g.fill({ color: 0x000000, alpha: 0.14 });
  g.rect(2, 2, size - 4, 2);
  g.fill({ color: 0xffffff, alpha: 0.1 });
  g.rect(0, 0, size, size);
  g.stroke({ width: 1, color: 0x000000, alpha: 0.06 });
  return g;
}

export function drawPixiPlotPanel(Graphics, pxTile, { tilled, planted, active }) {
  const inset = Math.max(4, Math.round(pxTile * 0.12));
  const g = new Graphics();
  const w = pxTile - inset * 2;
  const h = pxTile - inset * 2;
  g.roundRect(inset, inset, w, h, 6);
  if (planted) g.fill({ color: 0x4a7c30, alpha: 0.55 });
  else if (tilled) g.fill({ color: 0x724a34, alpha: 0.48 });
  else g.fill({ color: 0x4a7c30, alpha: 0.32 });
  g.roundRect(inset, inset, w, h, 6);
  g.stroke({
    width: active ? 2 : 1,
    color: active ? 0xfff59d : 0xffffff,
    alpha: active ? 0.95 : 0.55,
  });
  if (active) {
    g.roundRect(inset - 1, inset - 1, w + 2, h + 2, 7);
    g.stroke({ width: 1, color: 0xffeb3b, alpha: 0.35 });
  }
  return g;
}
