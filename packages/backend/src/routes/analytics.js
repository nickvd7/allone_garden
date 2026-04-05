/**
 * Analytics routes — lightweight self-hosted event tracking.
 *
 * POST /api/analytics/event   — record an event (public, rate-limited)
 * GET  /api/analytics/summary — aggregated stats (admin only)
 * GET  /api/analytics/events  — raw recent events (admin only)
 */
const express      = require('express');
const router       = express.Router();
const db           = require('../db');
const { requireAuth }  = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { apiLimiter }   = require('../middleware/security');

// ── In-memory fallback (circular buffer, max 10 000 events) ──────────────────
const MAX_MEM = 10_000;
const memEvents = [];
let memSeq = 0;

function storeMemory(name, properties, userId, sessionId) {
  if (memEvents.length >= MAX_MEM) memEvents.shift();
  memEvents.push({
    id:         ++memSeq,
    event_name: name,
    properties,
    user_id:    userId || null,
    session_id: sessionId || null,
    created_at: new Date().toISOString(),
  });
}

// ── Schema migration (runs once at startup) ──────────────────────────────────
async function ensureTable() {
  const res = await db.query(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id         SERIAL PRIMARY KEY,
      event_name VARCHAR(100) NOT NULL,
      properties JSONB,
      user_id    INTEGER,
      session_id VARCHAR(64),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_analytics_event_name ON analytics_events(event_name);
    CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events(created_at DESC);
  `);
  return res;
}
ensureTable().catch(() => {/* no DB, memory mode */});

// ── Allowed event names (whitelist to prevent DB pollution) ──────────────────
const ALLOWED_EVENTS = new Set([
  'session_start',
  'page_view',
  'crop_planted',
  'crop_harvested',
  'structure_built',
  'trade_completed',
  'level_up',
  'quest_completed',
  'plugin_activated',
  'world_joined',
  'world_left',
  'proposal_created',
  'proposal_voted',
  'content_created',
  'chat_message_sent',
]);

// ── POST /api/analytics/event ────────────────────────────────────────────────
router.post('/event', apiLimiter, async (req, res) => {
  const { event, properties = {}, sessionId } = req.body;

  if (!event || typeof event !== 'string') {
    return res.status(400).json({ error: 'event name required' });
  }
  if (!ALLOWED_EVENTS.has(event)) {
    return res.status(400).json({ error: 'unknown event' });
  }

  // Strip any PII from properties; only keep safe fields
  const safe = {};
  const allowedProps = ['cropType', 'structureType', 'season', 'weather',
                        'level', 'page', 'plugin', 'duration', 'count'];
  for (const k of allowedProps) {
    if (properties[k] !== undefined) safe[k] = properties[k];
  }

  // Optional: attach userId from JWT if present (auth header optional)
  let userId = null;
  try {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET, { algorithms: ['HS256'] });
      userId =
        typeof decoded.userId === 'number' && Number.isFinite(decoded.userId)
          ? decoded.userId
          : null;
    }
  } catch { /* anonymous event */ }

  try {
    const result = await db.query(
      `INSERT INTO analytics_events (event_name, properties, user_id, session_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [event, safe, userId, sessionId || null]
    );
    if (!result) storeMemory(event, safe, userId, sessionId);
    return res.json({ ok: true });
  } catch {
    storeMemory(event, safe, userId, sessionId);
    return res.json({ ok: true });
  }
});

// ── GET /api/analytics/summary ───────────────────────────────────────────────
router.get('/summary', requireAuth, requireAdmin, async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 90);

  const dbResult = await db.query(`
    SELECT
      event_name,
      COUNT(*)                                      AS total,
      COUNT(DISTINCT session_id)                    AS sessions,
      COUNT(DISTINCT user_id)                       AS unique_users,
      DATE_TRUNC('day', created_at)::DATE           AS day
    FROM analytics_events
    WHERE created_at >= NOW() - ($1::integer * INTERVAL '1 day')
    GROUP BY event_name, day
    ORDER BY day DESC, total DESC
  `, [days]);

  if (dbResult) {
    return res.json({ source: 'db', days, rows: dbResult.rows });
  }

  // In-memory summary
  const cutoff = Date.now() - days * 86_400_000;
  const filtered = memEvents.filter(e => new Date(e.created_at).getTime() >= cutoff);
  const counts = {};
  for (const e of filtered) {
    counts[e.event_name] = (counts[e.event_name] || 0) + 1;
  }
  const rows = Object.entries(counts)
    .map(([event_name, total]) => ({ event_name, total }))
    .sort((a, b) => b.total - a.total);

  return res.json({ source: 'memory', days, rows, total_stored: memEvents.length });
});

// ── GET /api/analytics/events ────────────────────────────────────────────────
router.get('/events', requireAuth, requireAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

  const dbResult = await db.query(
    `SELECT id, event_name, properties, user_id, session_id, created_at
     FROM analytics_events ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );

  if (dbResult) {
    return res.json({ source: 'db', events: dbResult.rows });
  }

  const events = memEvents.slice(-limit).reverse();
  return res.json({ source: 'memory', events });
});

module.exports = router;
