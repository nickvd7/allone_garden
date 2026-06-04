/**
 * Pixi is an optional performance layer (e.g. Raspberry Pi), not the default look.
 * Desktop/Mac keeps the CSS map (gradients, inset depth, plot panels).
 */

export function isLowPowerDevice() {
  if (typeof navigator === 'undefined') return true;
  const cores = navigator.hardwareConcurrency || 2;
  const mem = navigator.deviceMemory || 4;
  if (cores <= 4 && mem <= 2) return true;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
  } catch {
    return true;
  }
  return false;
}

export function shouldUsePixiMap() {
  const mode = (process.env.REACT_APP_PIXI_MAP || 'auto').toLowerCase();
  if (mode === 'on') return true;
  if (mode === 'off' || mode === 'dom') return false;
  // auto: DOM op krachtige clients; Pixi alleen op zwakke hardware
  return isLowPowerDevice();
}
