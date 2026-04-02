/**
 * QR routes — offline garden seed-packet integration.
 *
 * GET  /api/qr/code/:plantSlug   — generate a QR code SVG for a plant
 * POST /api/qr/scan              — decode a scanned string and return plant info
 *
 * QR payload format: "allonegarden:plant:<slug>"
 * Example:           "allonegarden:plant:tomato"
 */
const express = require('express');
const router  = express.Router();
const QRCode  = require('qrcode');
const { requireAuth } = require('../middleware/auth');

// ── Known plants (mirrors frontend SEEDS + common content plants) ─────────────
const KNOWN_PLANTS = new Set([
  'tomato', 'carrot', 'lettuce', 'radish', 'corn',
  'potato', 'pumpkin', 'sunflower', 'blueberry',
  'wheat', 'pepper', 'cucumber', 'zucchini', 'strawberry',
  'lavender', 'mint', 'basil',
]);

const PLANT_NAMES = {
  tomato:     'Tomato',
  carrot:     'Carrot',
  lettuce:    'Lettuce',
  radish:     'Radish',
  corn:       'Corn',
  potato:     'Potato',
  pumpkin:    'Pumpkin',
  sunflower:  'Sunflower',
  blueberry:  'Blueberry',
  wheat:      'Wheat',
  pepper:     'Pepper',
  cucumber:   'Cucumber',
  zucchini:   'Zucchini',
  strawberry: 'Strawberry',
  lavender:   'Lavender',
  mint:       'Mint',
  basil:      'Basil',
};

const QR_PREFIX = 'allonegarden:plant:';

// ── GET /api/qr/code/:plantSlug ───────────────────────────────────────────────
// Returns an SVG QR code image for a given plant slug.
// No auth required so QR codes can be embedded in printable sheets.
router.get('/code/:plantSlug', async (req, res) => {
  const slug = req.params.plantSlug.toLowerCase().trim();

  if (!KNOWN_PLANTS.has(slug)) {
    return res.status(404).json({ error: `Unknown plant: ${slug}` });
  }

  const payload = `${QR_PREFIX}${slug}`;

  try {
    const svg = await QRCode.toString(payload, {
      type:         'svg',
      margin:       2,
      color:        { dark: '#2e7d32', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });

    res.set('Content-Type', 'image/svg+xml');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(svg);
  } catch (err) {
    return res.status(500).json({ error: 'QR generation failed', detail: err.message });
  }
});

// ── GET /api/qr/sheet ─────────────────────────────────────────────────────────
// Returns a JSON list of all plants with their QR payload strings — useful for
// generating a printable sticker sheet on the frontend.
router.get('/sheet', requireAuth, async (req, res) => {
  const plants = Array.from(KNOWN_PLANTS).map((slug) => ({
    slug,
    name:    PLANT_NAMES[slug] || slug,
    payload: `${QR_PREFIX}${slug}`,
    qrUrl:   `/api/qr/code/${slug}`,
  }));
  return res.json({ plants });
});

// ── POST /api/qr/scan ─────────────────────────────────────────────────────────
// Accepts a scanned QR string, validates the prefix, returns plant info.
// Auth optional — the frontend sends it if available for analytics purposes.
router.post('/scan', async (req, res) => {
  const { code } = req.body;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'code is required' });
  }

  const trimmed = code.trim();

  if (!trimmed.startsWith(QR_PREFIX)) {
    return res.status(422).json({
      error: 'Not an AllOne Garden QR code',
      hint:  'Expected format: allonegarden:plant:<slug>',
    });
  }

  const slug = trimmed.slice(QR_PREFIX.length).toLowerCase();

  if (!KNOWN_PLANTS.has(slug)) {
    return res.status(404).json({ error: `Unknown plant slug: ${slug}` });
  }

  return res.json({
    ok:   true,
    slug,
    name: PLANT_NAMES[slug] || slug,
  });
});

module.exports = router;
