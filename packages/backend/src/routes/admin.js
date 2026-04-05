/**
 * Admin routes — server statistics and management.
 * Protected by JWT; requires admin role (level >= 99 or ADMIN_USERS env list).
 */
const express      = require('express');
const router       = express.Router();
const db           = require('../db');
const { requireAuth }  = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { auditLog }     = require('../middleware/security');
const pluginLoader     = require('../plugins/loader');
const worldMap         = require('../state/worldMap');
const pluginConfig     = require('../state/pluginConfig');
const contentStore     = require('../state/contentStore');
const proposalStore    = require('../state/proposalStore');
const { getAllPushTokens, sendPushBroadcast } = require('./push');
const { logPushBroadcast } = require('../services/pushLog');
const { isApnsConfigured } = require('../services/apnsSend');
const os = require('os');

// Valid content types for the /content/:type routes
const CONTENT_TYPES = ['plants', 'structures', 'tools', 'weather'];

// Map dimensions the admin PUT must match
const MAP_H = 20;
const MAP_W = 32;

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

// ── GET /api/admin/world — load current world map ────────────────────────────
router.get('/world', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (db.isConnected()) {
      const result = await db.query(
        "SELECT value FROM server_config WHERE key = 'world_map'"
      );
      if (result.rows.length > 0) return res.json(result.rows[0].value);
    }
    return res.json(worldMap.get());  // null = "no custom map"
  } catch (err) {
    console.error('GET /api/admin/world error:', err);
    return res.status(500).json({ error: 'Could not load world map' });
  }
});

// ── PUT /api/admin/world — save world map ─────────────────────────────────────
router.put('/world', requireAuth, requireAdmin, async (req, res) => {
  const { map, gardenSlots } = req.body;

  if (
    !Array.isArray(map) ||
    map.length !== MAP_H ||
    !map.every((row) => Array.isArray(row) && row.length === MAP_W)
  ) {
    return res.status(400).json({ error: `map must be a ${MAP_H}×${MAP_W} array` });
  }
  if (!Array.isArray(gardenSlots)) {
    return res.status(400).json({ error: 'gardenSlots must be an array' });
  }

  const value = { map, gardenSlots };
  worldMap.set(value);

  if (db.isConnected()) {
    await db.query(
      `INSERT INTO server_config (key, value)
       VALUES ('world_map', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(value)]
    );
  }

  return res.json({ success: true, map, gardenSlots });
});

// ── GET /api/admin/plugins/:name/config — get plugin config ───────────────────
router.get('/plugins/:name/config', requireAuth, requireAdmin, async (req, res) => {
  const { name } = req.params;
  try {
    if (db.isConnected()) {
      const result = await db.query(
        'SELECT config FROM plugin_config WHERE plugin_name = $1',
        [name]
      );
      if (result.rows.length > 0) return res.json(result.rows[0].config);
    }
    return res.json(pluginConfig.get(name) || {});
  } catch (err) {
    console.error(`GET /api/admin/plugins/${name}/config error:`, err);
    return res.status(500).json({ error: 'Could not load plugin config' });
  }
});

// ── PUT /api/admin/plugins/:name/config — save plugin config ──────────────────
router.put('/plugins/:name/config', requireAuth, requireAdmin, async (req, res) => {
  const { name } = req.params;
  const config   = req.body;

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return res.status(400).json({ error: 'config must be a JSON object' });
  }

  pluginConfig.set(name, config);

  if (db.isConnected()) {
    await db.query(
      `INSERT INTO plugin_config (plugin_name, config)
       VALUES ($1, $2)
       ON CONFLICT (plugin_name) DO UPDATE SET config = $2, updated_at = NOW()`,
      [name, JSON.stringify(config)]
    );
  }

  return res.json({ success: true });
});

// ── GET /api/admin/content/:type — list custom overrides for a content type ───
router.get('/content/:type', requireAuth, requireAdmin, async (req, res) => {
  const { type } = req.params;
  if (!CONTENT_TYPES.includes(type)) {
    return res.status(400).json({ error: `Unknown content type: ${type}. Must be one of: ${CONTENT_TYPES.join(', ')}` });
  }
  try {
    if (db.isConnected()) {
      const result = await db.query(
        "SELECT value FROM server_config WHERE key = $1",
        [`content_${type}`]
      );
      if (result.rows.length > 0) {
        const stored = result.rows[0].value;
        contentStore.setCustom(type, stored);
      }
    }
    return res.json(contentStore.getCustom(type));
  } catch (err) {
    console.error(`GET /api/admin/content/${type} error:`, err);
    return res.status(500).json({ error: 'Could not load content' });
  }
});

// ── PUT /api/admin/content/:type — replace custom overrides for a type ────────
// Body: array of content items. Existing custom items are fully replaced.
router.put('/content/:type', requireAuth, requireAdmin, async (req, res) => {
  const { type } = req.params;
  if (!CONTENT_TYPES.includes(type)) {
    return res.status(400).json({ error: `Unknown content type: ${type}` });
  }
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Body must be a JSON array of content items' });
  }

  const items = req.body;
  contentStore.setCustom(type, items);

  if (db.isConnected()) {
    await db.query(
      `INSERT INTO server_config (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [`content_${type}`, JSON.stringify(items)]
    );
  }

  return res.json({ success: true, type, count: items.length });
});

// ── GET /api/admin/content/proposals — list all proposals ────────────────────
router.get('/content/proposals', requireAuth, requireAdmin, (req, res) => {
  const { status } = req.query; // optional filter: pending | approved | rejected | revision_requested
  const list = proposalStore.list(status || null);
  return res.json({ proposals: list, total: list.length });
});

// ── POST /api/admin/content/proposals/:id/approve — approve (optionally with edits) ──
router.post('/content/proposals/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  const { id }   = req.params;
  const { note, item: editedItem } = req.body || {};

  const proposal = proposalStore.get(id);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  if (proposal.status !== 'pending' && proposal.status !== 'revision_requested') {
    return res.status(409).json({ error: `Proposal is already ${proposal.status}` });
  }

  // Use admin-edited item if provided, otherwise original proposal item
  const itemToPublish = (editedItem && typeof editedItem === 'object') ? editedItem : proposal.item;

  // Publish: merge the (possibly edited) item into the live custom overrides
  const existing = contentStore.getCustom(proposal.type);
  const idField  = proposal.type === 'plants' ? 'slug' : 'id';
  const merged   = [
    ...existing.filter((c) => c[idField] !== itemToPublish[idField]),
    itemToPublish,
  ];
  contentStore.setCustom(proposal.type, merged);

  if (db.isConnected()) {
    const publishKey = `content_${proposal.type}`;
    await db.query(
      `INSERT INTO server_config (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [publishKey, JSON.stringify(merged)]
    ).catch((err) => console.warn('content approve DB update failed:', err.message));

    await db.query(
      `UPDATE content_proposals SET status = 'approved', note = $1, reviewed_at = NOW() WHERE id = $2`,
      [note || '', id]
    ).catch(() => {});
  }

  proposalStore.setStatus(id, 'approved', note || '');
  auditLog('proposal.approved', req, {
    proposalId: id,
    type: proposal.type,
    itemId: itemToPublish[proposal.type === 'plants' ? 'slug' : 'id'],
    edited: !!(editedItem && typeof editedItem === 'object'),
  });

  // Notify the proposer in real-time via Socket.IO
  const ioApprove = req.app.get('io');
  if (ioApprove && proposal.submittedBy) {
    ioApprove.to(String(proposal.submittedBy)).emit('proposal:status_changed', {
      proposalId: id,
      status:     'approved',
      note:       note || '',
      itemName:   proposal.item.name || itemToPublish[proposal.type === 'plants' ? 'slug' : 'id'],
      type:       proposal.type,
    });
  }

  return res.json({ success: true, proposal: proposalStore.get(id) });
});

// ── POST /api/admin/content/proposals/:id/reject — reject a proposal ──────────
router.post('/content/proposals/:id/reject', requireAuth, requireAdmin, async (req, res) => {
  const { id }   = req.params;
  const { note } = req.body || {};

  const proposal = proposalStore.get(id);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  if (proposal.status === 'approved') {
    return res.status(409).json({ error: 'Proposal is already approved' });
  }

  if (db.isConnected()) {
    await db.query(
      `UPDATE content_proposals SET status = 'rejected', note = $1, reviewed_at = NOW() WHERE id = $2`,
      [note || '', id]
    ).catch(() => {});
  }

  proposalStore.setStatus(id, 'rejected', note || '');
  auditLog('proposal.rejected', req, { proposalId: id, type: proposal.type });

  const ioReject = req.app.get('io');
  if (ioReject && proposal.submittedBy) {
    ioReject.to(String(proposal.submittedBy)).emit('proposal:status_changed', {
      proposalId: id,
      status:     'rejected',
      note:       note || '',
      itemName:   proposal.item.name,
      type:       proposal.type,
    });
  }

  return res.json({ success: true, proposal: proposalStore.get(id) });
});

// ── POST /api/admin/content/proposals/:id/request-revision — send back to proposer ──
router.post('/content/proposals/:id/request-revision', requireAuth, requireAdmin, async (req, res) => {
  const { id }   = req.params;
  const { note } = req.body || {};

  if (!note || !note.trim()) {
    return res.status(400).json({ error: 'A revision note is required so the proposer knows what to fix' });
  }

  const proposal = proposalStore.get(id);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  if (proposal.status === 'approved') {
    return res.status(409).json({ error: 'Proposal is already approved' });
  }

  if (db.isConnected()) {
    // Increment revision_count in the DB alongside the status change
    await db.query(
      `UPDATE content_proposals
       SET status = 'revision_requested', note = $1, reviewed_at = NOW(),
           revision_count = revision_count + 1
       WHERE id = $2`,
      [note.trim(), id]
    ).catch(() => {});
  }

  proposalStore.setStatus(id, 'revision_requested', note.trim());
  auditLog('proposal.revision_requested', req, { proposalId: id, type: proposal.type });

  const ioRevise = req.app.get('io');
  if (ioRevise && proposal.submittedBy) {
    ioRevise.to(String(proposal.submittedBy)).emit('proposal:status_changed', {
      proposalId: id,
      status:     'revision_requested',
      note:       note.trim(),
      itemName:   proposal.item.name,
      type:       proposal.type,
    });
  }

  return res.json({ success: true, proposal: proposalStore.get(id) });
});

// ── GET /api/admin/push/logs — recent broadcast history (DB) ───────────────────
router.get('/push/logs', requireAuth, requireAdmin, async (req, res) => {
  if (!db.isConnected()) {
    return res.json({ logs: [], note: 'No database — logs unavailable' });
  }
  try {
    const r = await db.query(
      `SELECT id, created_at, title, token_count, sent, failures, mode, source
       FROM push_broadcast_log
       ORDER BY id DESC
       LIMIT 100`
    );
    return res.json({ logs: r.rows });
  } catch (e) {
    console.error('[admin/push/logs]', e.message);
    return res.status(500).json({ error: 'Could not load logs' });
  }
});

// ── POST /api/admin/push/notify — FCM v1 / legacy / optional direct APNs ───────
router.post('/push/notify', requireAuth, requireAdmin, async (req, res) => {
  const { title, body } = req.body || {};
  if (!title || typeof title !== 'string' || title.length > 120) {
    return res.status(400).json({ error: 'title required (max 120 chars)' });
  }
  if (!body || typeof body !== 'string' || body.length > 500) {
    return res.status(400).json({ error: 'body required (max 500 chars)' });
  }
  try {
    const rows = await getAllPushTokens();
    const canSend = !!(
      process.env.FCM_SERVER_KEY
      || process.env.FCM_SERVICE_ACCOUNT_JSON
      || process.env.FCM_SERVICE_ACCOUNT_PATH
      || isApnsConfigured()
    );
    if (!canSend) {
      return res.json({
        ok:      true,
        sent:    0,
        message: 'No push credentials — FCM (v1/legacy) or APNs (APNS_KEY_PATH, …)',
        tokens:  rows.length,
      });
    }
    const result = await sendPushBroadcast(rows, { title, body });
    await logPushBroadcast({
      title,
      body,
      tokenCount: rows.length,
      sent:       result.sent,
      failures:   result.failures,
      mode:       result.mode,
      source:     'admin',
      adminUserId: req.user.userId,
    });
    auditLog('push.notify', req, { tokenCount: rows.length, mode: result.mode });
    return res.json({ ok: true, tokens: rows.length, ...result });
  } catch (err) {
    console.error('[admin/push/notify]', err.message);
    return res.status(500).json({ error: 'Send failed' });
  }
});

// ── Helper ────────────────────────────────────────────────────────────────────
function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
}

module.exports = router;
