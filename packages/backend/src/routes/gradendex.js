/**
 * Gradendex routes
 *
 * Public read — no authentication required for GET.
 * Admin write — POST / PUT / DELETE require a valid JWT and admin privileges.
 *
 * GET  /api/gradendex              → list all entries (optionally ?category=plant)
 * GET  /api/gradendex/can-edit     → { canEdit: bool } — lightweight admin probe
 * GET  /api/gradendex/:slug        → single entry
 * POST /api/gradendex              → create entry  (admin)
 * PUT  /api/gradendex/:slug        → update entry  (admin)
 * DELETE /api/gradendex/:slug      → delete entry  (admin)
 */
const express    = require('express');
const { body, param, query, validationResult } = require('express-validator');
const xss        = require('xss');
const db         = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');

const router = express.Router();

// ── In-memory fallback (used when DATABASE_URL is not configured) ─────────────
// Seeded by migrate-gradendex.js; here we only keep a tiny stub so the
// frontend can render something even without a database.
const MEM_ENTRIES = [];

function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}

const XSS_SAFE = { whiteList: {}, stripIgnoreTag: true };
const sanitise  = (s) => xss(String(s ?? ''), XSS_SAFE).slice(0, 4000);

// ── GET /api/gradendex ────────────────────────────────────────────────────────
router.get('/',
  query('category').optional().isString().trim().escape(),
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const cat = req.query.category;
      if (db.isConnected()) {
        const sql = cat
          ? 'SELECT * FROM gradendex_entries WHERE category = $1 ORDER BY category, name'
          : 'SELECT * FROM gradendex_entries ORDER BY category, name';
        const result = await db.query(sql, cat ? [cat] : []);
        return res.json({ entries: result.rows });
      }
      const entries = cat ? MEM_ENTRIES.filter((e) => e.category === cat) : MEM_ENTRIES;
      res.json({ entries });
    } catch (err) {
      res.status(500).json({ error: 'Could not load Gradendex entries' });
    }
  }
);

// ── GET /api/gradendex/can-edit ───────────────────────────────────────────────
// Lightweight probe: returns { canEdit: true } if the caller is an admin.
// Used by the standalone Gradendex page to decide whether to show edit buttons.
router.get('/can-edit', requireAuth, requireAdmin, (_req, res) => {
  res.json({ canEdit: true });
});

// ── GET /api/gradendex/:slug ──────────────────────────────────────────────────
router.get('/:slug',
  param('slug').isSlug(),
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      if (db.isConnected()) {
        const result = await db.query(
          'SELECT * FROM gradendex_entries WHERE slug = $1',
          [req.params.slug]
        );
        if (!result.rows[0]) return res.status(404).json({ error: 'Entry not found' });
        return res.json({ entry: result.rows[0] });
      }
      const entry = MEM_ENTRIES.find((e) => e.slug === req.params.slug);
      if (!entry) return res.status(404).json({ error: 'Entry not found' });
      res.json({ entry });
    } catch (err) {
      res.status(500).json({ error: 'Could not load entry' });
    }
  }
);

// ── Shared validation rules for write operations ──────────────────────────────
const WRITE_RULES = [
  body('name').isString().trim().notEmpty().isLength({ max: 100 }),
  body('emoji').optional().isString().trim().isLength({ max: 10 }),
  body('category').optional().isIn(['plant', 'structure', 'tool', 'other']),
  body('short_desc').optional().isString().trim().isLength({ max: 300 }),
  body('long_desc').optional().isString().isLength({ max: 8000 }),
  body('growth_days').optional({ nullable: true }).isInt({ min: 0, max: 365 }),
  body('base_coins').optional({ nullable: true }).isInt({ min: 0, max: 9999 }),
  body('companion_good').optional().isArray(),
  body('companion_bad').optional().isArray(),
  body('tips').optional().isArray(),
];

// ── POST /api/gradendex ───────────────────────────────────────────────────────
router.post('/',
  requireAuth, requireAdmin,
  body('slug').isSlug().isLength({ max: 50 }),
  ...WRITE_RULES,
  async (req, res) => {
    if (!validate(req, res)) return;
    const { slug, name, emoji = '', category = 'plant', short_desc = '',
            long_desc = '', growth_days = null, base_coins = null,
            companion_good = [], companion_bad = [], tips = [] } = req.body;
    try {
      if (db.isConnected()) {
        const result = await db.query(`
          INSERT INTO gradendex_entries
            (slug, name, emoji, category, short_desc, long_desc,
             growth_days, base_coins, companion_good, companion_bad, tips,
             updated_by, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
          RETURNING *
        `, [
          slug.toLowerCase(), sanitise(name), sanitise(emoji), category,
          sanitise(short_desc), sanitise(long_desc),
          growth_days, base_coins,
          JSON.stringify(companion_good),
          JSON.stringify(companion_bad),
          JSON.stringify(tips.map(sanitise)),
          req.user.username,
        ]);
        return res.status(201).json({ entry: result.rows[0] });
      }
      // In-memory fallback
      if (MEM_ENTRIES.find((e) => e.slug === slug)) {
        return res.status(409).json({ error: 'Slug already exists' });
      }
      const entry = { id: Date.now(), slug, name, emoji, category, short_desc, long_desc,
                      growth_days, base_coins, companion_good, companion_bad, tips,
                      updated_at: new Date().toISOString(), updated_by: req.user.username };
      MEM_ENTRIES.push(entry);
      res.status(201).json({ entry });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Slug already exists' });
      res.status(500).json({ error: 'Could not create entry' });
    }
  }
);

// ── PUT /api/gradendex/:slug ──────────────────────────────────────────────────
router.put('/:slug',
  requireAuth, requireAdmin,
  param('slug').isSlug(),
  ...WRITE_RULES,
  async (req, res) => {
    if (!validate(req, res)) return;
    const { slug } = req.params;
    const { name, emoji, category, short_desc, long_desc,
            growth_days, base_coins, companion_good, companion_bad, tips } = req.body;
    try {
      if (db.isConnected()) {
        // Build partial update — only overwrite fields that were sent
        const setClauses = [];
        const vals       = [];
        let   idx        = 1;

        const set = (col, val) => { setClauses.push(`${col} = $${idx++}`); vals.push(val); };

        if (name          !== undefined) set('name',          sanitise(name));
        if (emoji         !== undefined) set('emoji',         sanitise(emoji));
        if (category      !== undefined) set('category',      category);
        if (short_desc    !== undefined) set('short_desc',    sanitise(short_desc));
        if (long_desc     !== undefined) set('long_desc',     sanitise(long_desc));
        if (growth_days   !== undefined) set('growth_days',   growth_days);
        if (base_coins    !== undefined) set('base_coins',    base_coins);
        if (companion_good !== undefined) set('companion_good', JSON.stringify(companion_good));
        if (companion_bad  !== undefined) set('companion_bad',  JSON.stringify(companion_bad));
        if (tips           !== undefined) set('tips', JSON.stringify(tips.map(sanitise)));

        set('updated_by', req.user.username);
        set('updated_at', new Date());

        vals.push(slug);
        const result = await db.query(
          `UPDATE gradendex_entries SET ${setClauses.join(', ')} WHERE slug = $${idx} RETURNING *`,
          vals
        );
        if (!result.rows[0]) return res.status(404).json({ error: 'Entry not found' });
        return res.json({ entry: result.rows[0] });
      }
      // In-memory fallback
      const idx2 = MEM_ENTRIES.findIndex((e) => e.slug === slug);
      if (idx2 === -1) return res.status(404).json({ error: 'Entry not found' });
      MEM_ENTRIES[idx2] = {
        ...MEM_ENTRIES[idx2], ...req.body,
        updated_at: new Date().toISOString(), updated_by: req.user.username,
      };
      res.json({ entry: MEM_ENTRIES[idx2] });
    } catch (err) {
      res.status(500).json({ error: 'Could not update entry' });
    }
  }
);

// ── DELETE /api/gradendex/:slug ───────────────────────────────────────────────
router.delete('/:slug',
  requireAuth, requireAdmin,
  param('slug').isSlug(),
  async (req, res) => {
    if (!validate(req, res)) return;
    const { slug } = req.params;
    try {
      if (db.isConnected()) {
        const result = await db.query(
          'DELETE FROM gradendex_entries WHERE slug = $1 RETURNING slug',
          [slug]
        );
        if (!result.rows[0]) return res.status(404).json({ error: 'Entry not found' });
        return res.json({ deleted: slug });
      }
      const idx = MEM_ENTRIES.findIndex((e) => e.slug === slug);
      if (idx === -1) return res.status(404).json({ error: 'Entry not found' });
      MEM_ENTRIES.splice(idx, 1);
      res.json({ deleted: slug });
    } catch (err) {
      res.status(500).json({ error: 'Could not delete entry' });
    }
  }
);

module.exports = router;
