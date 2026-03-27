/**
 * Generates PWA icons for AllOne Garden without any npm dependencies.
 * Uses only Node.js built-ins (zlib, fs, path).
 *
 * Output:
 *   packages/frontend/public/icons/icon-192.png   (192×192)
 *   packages/frontend/public/icons/icon-512.png   (512×512)
 *
 * Design: green background (#4caf50) with a white leaf/sprout shape.
 *
 * Run: node scripts/generate-icons.js
 */

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── CRC32 (required by PNG format) ────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length    = Buffer.alloc(4);
  const crcBuf    = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crcBuf]);
}

// ── PNG builder ───────────────────────────────────────────────────────────────
function makePNG(pixels, size) {
  // pixels: Uint8Array of size*size*4 (RGBA)
  const sig  = Buffer.from([137,80,78,71,13,10,26,10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8]  = 8; // bit depth
  ihdr[9]  = 6; // colour type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Raw scanlines (filter byte 0 = None per row)
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * (1 + size * 4) + 1 + x * 4;
      raw[dst]   = pixels[src];
      raw[dst+1] = pixels[src+1];
      raw[dst+2] = pixels[src+2];
      raw[dst+3] = pixels[src+3];
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Icon drawing ──────────────────────────────────────────────────────────────
function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 4);

  // Background: #4caf50 (green)
  const BG  = [0x4c, 0xaf, 0x50, 255];
  // Darker green ring for depth
  const RIM = [0x2e, 0x7d, 0x32, 255];
  // White for the sprout
  const WHT = [255, 255, 255, 255];

  const cx = size / 2;
  const cy = size / 2;
  const r  = size / 2;

  function set(x, y, colour) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    pixels[i]   = colour[0];
    pixels[i+1] = colour[1];
    pixels[i+2] = colour[2];
    pixels[i+3] = colour[3];
  }

  // Fill background + round corners by setting alpha=0 outside the circle
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist > r) {
        set(x, y, [0,0,0,0]); // transparent outside circle
      } else if (dist > r - size * 0.04) {
        set(x, y, RIM); // thin dark rim
      } else {
        set(x, y, BG);
      }
    }
  }

  // Draw a simple sprout/seedling in white using relative coordinates
  // Stem: vertical bar from 30% to 65% height, centered
  const stemW = Math.max(2, Math.round(size * 0.045));
  const stemX = Math.round(cx - stemW / 2);
  const stemTop    = Math.round(size * 0.32);
  const stemBottom = Math.round(size * 0.68);

  for (let y = stemTop; y <= stemBottom; y++) {
    for (let x = stemX; x < stemX + stemW; x++) {
      set(x, y, WHT);
    }
  }

  // Left leaf: ellipse leaning left from mid-stem
  const leafH    = Math.round(size * 0.19);
  const leafW    = Math.round(size * 0.15);
  const lLeafCX  = Math.round(cx - leafW * 0.7);
  const lLeafCY  = Math.round(size * 0.43);

  for (let y = lLeafCY - leafH; y <= lLeafCY + leafH; y++) {
    for (let x = lLeafCX - leafW; x <= lLeafCX + leafW; x++) {
      const nx = (x - lLeafCX) / leafW;
      const ny = (y - lLeafCY) / leafH;
      if (nx*nx + ny*ny <= 1) set(x, y, WHT);
    }
  }

  // Right leaf: ellipse leaning right
  const rLeafCX = Math.round(cx + leafW * 0.7);
  const rLeafCY = Math.round(size * 0.38);

  for (let y = rLeafCY - leafH; y <= rLeafCY + leafH; y++) {
    for (let x = rLeafCX - leafW; x <= rLeafCX + leafW; x++) {
      const nx = (x - rLeafCX) / leafW;
      const ny = (y - rLeafCY) / leafH;
      if (nx*nx + ny*ny <= 1) set(x, y, WHT);
    }
  }

  // Top bud: small circle at tip of stem
  const budR = Math.round(size * 0.09);
  const budY = Math.round(size * 0.28);
  for (let y = budY - budR; y <= budY + budR; y++) {
    for (let x = Math.round(cx) - budR; x <= Math.round(cx) + budR; x++) {
      const dx = x - cx;
      const dy = y - budY;
      if (dx*dx + dy*dy <= budR*budR) set(x, y, WHT);
    }
  }

  return pixels;
}

// ── Write icons ───────────────────────────────────────────────────────────────
const OUT_DIR = path.resolve(__dirname, '../packages/frontend/public/icons');
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const size of [192, 512]) {
  const pixels = drawIcon(size);
  const png    = makePNG(pixels, size);
  const dest   = path.join(OUT_DIR, `icon-${size}.png`);
  fs.writeFileSync(dest, png);
  console.log(`✅ Generated ${dest} (${png.length} bytes)`);
}

console.log('');
console.log('Icons written to packages/frontend/public/icons/');
