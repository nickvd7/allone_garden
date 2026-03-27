/**
 * Admin routes — server statistics and management.
 * Protected by JWT; requires admin role (level >= 99 or ADMIN_USERS env list).
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');
const pluginLoader    = require('../plugins/loader');
const os = require('os');

// ── Admin check middleware ─────────────────────────────────────────────────────
const ADMIN_USERS = (process.env.ADMIN_USERS || '').split(',').map((s) => s.trim()).filter(Boolean);

async function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  // Allow by username list (env) or by level >= 99 in DB
  if (ADMIN_USERS.includes(req.user.username)) return next();

  if (db.isConnected()) {
    const result = await db.query('SELECT level FROM users WHERE id = $1', [req.user.userId]);
    if (result.rows[0]?.level >= 99) return next();
  }

  res.status(403).json({ error: 'Admin access required' });
}

// ── GET /api/admin/stats — server overview ────────────────────────────────────
router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
  const uptime   = process.uptime();
  const memUsage = process.memoryUsage();
  const cpuLoad  = os.loadavg();

  let dbStats = null;
  if (db.isConnected()) {
    const [users, gardens, trades, messages] = await Promise.all([
      db.query('SELECT COUNT(*) FROM users'),
      db.query('SELECT COUNT(*) FROM gardens'),
      db.query('SELECT COUNT(*) FROM trade_listings'),
      db.query('SELECT COUNT(*) FROM chat_messages'),
    ]);
    dbStats = {
      totalUsers:    parseInt(users.rows[0].count),
      totalGardens:  parseInt(gardens.rows[0].count),
      activeListings: parseInt(trades.rows[0].count),
      chatMessages:   parseInt(messages.rows[0].count),
    };
  }

  res.json({
    server: {
      uptime,
      uptimeFormatted: formatUptime(uptime),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    memory: {
      heapUsedMB:  Math.round(memUsage.heapUsed  / 1024 / 1024),
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      rssMB:       Math.round(memUsage.rss       / 1024 / 1024),
    },
    cpu: {
      load1: cpuLoad[0].toFixed(2),
      load5: cpuLoad[1].toFixed(2),
      cores: os.cpus().length,
      model: os.cpus()[0]?.model || 'unknown',
    },
    database: dbStats,
    plugins: pluginLoader.listLoaded(),
  });
});

// ── GET /api/admin/players — list registered players ─────────────────────────
router.get('/players', requireAuth, requireAdmin, async (req, res) => {
  if (!db.isConnected()) {
    return res.json({ players: [], note: 'No database — in-memory mode' });
  }

  const result = await db.query(
    `SELECT id, username, email, level, xp, coins, plants_grown, last_login, created_at
     FROM users ORDER BY last_login DESC NULLS LAST LIMIT 100`
  );
  res.json({ players: result.rows });
});

// ── GET /api/admin/plugins — list loaded plugins ──────────────────────────────
router.get('/plugins', requireAuth, requireAdmin, (req, res) => {
  res.json(pluginLoader.listLoaded());
});

// ── POST /api/admin/plugins/:name/reload — hot-reload a plugin ────────────────
router.post('/plugins/:name/reload', requireAuth, requireAdmin, (req, res) => {
  const { name } = req.params;
  pluginLoader.unloadPlugin(name);
  res.json({ success: true, message: `Plugin "${name}" unloaded. Restart to reload.` });
});

// ── GET /api/admin/peers — known federation peers ────────────────────────────
router.get('/peers', requireAuth, requireAdmin, async (req, res) => {
  if (!db.isConnected()) return res.json([]);

  const result = await db.query(
    'SELECT peer_id, server_name, last_seen, player_count FROM known_peers ORDER BY last_seen DESC'
  );
  res.json(result.rows);
});

// ── Helper ────────────────────────────────────────────────────────────────────
function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
}

module.exports = router;
