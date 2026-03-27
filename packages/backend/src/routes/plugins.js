/**
 * Plugin Marketplace routes.
 *
 * GET  /api/plugins               — list plugins loaded on this server (public)
 * GET  /api/plugins/registry      — proxy the community registry (if configured)
 * POST /api/plugins/:name/install — download + install a plugin (admin only)
 * POST /api/plugins/:name/unload  — unload a running plugin (admin only)
 */
const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const https   = require('https');
const crypto  = require('crypto');

const pluginLoader = require('../plugins/loader');
const db           = require('../db');
const { requireAuth }  = require('../middleware/auth');
const { auditLog }     = require('../middleware/security');

const PLUGINS_ROOT     = path.resolve(__dirname, '../../../../../plugins/community');
const REGISTRY_URL     = process.env.PLUGIN_REGISTRY_URL || '';

// ── Admin check (re-used from admin.js pattern) ───────────────────────────────
const ADMIN_USERS = (process.env.ADMIN_USERS || '').split(',').map((s) => s.trim()).filter(Boolean);

async function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (ADMIN_USERS.includes(req.user.username)) return next();
  if (db.isConnected()) {
    const result = await db.query('SELECT level FROM users WHERE id = $1', [req.user.userId]);
    if (result.rows[0]?.level >= 99) return next();
  }
  res.status(403).json({ error: 'Admin access required' });
}

// ── GET /api/plugins ──────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  res.json(pluginLoader.listLoaded());
});

// ── GET /api/plugins/registry ─────────────────────────────────────────────────

router.get('/registry', async (req, res) => {
  if (!REGISTRY_URL) {
    // Return built-in bundled plugin catalogue when no external registry is set
    return res.json(BUNDLED_CATALOGUE);
  }

  // Proxy the external registry with a 5 s timeout
  try {
    const data = await fetchJson(REGISTRY_URL, 5000);
    res.json(data);
  } catch (err) {
    console.error('[plugins] Registry fetch failed:', err.message);
    // Fall back to bundled catalogue on error
    res.json(BUNDLED_CATALOGUE);
  }
});

// ── POST /api/plugins/:name/unload ────────────────────────────────────────────

router.post('/:name/unload', requireAuth, requireAdmin, (req, res) => {
  const { name } = req.params;
  const unloaded = pluginLoader.unloadPlugin(name);
  if (!unloaded) return res.status(404).json({ error: `Plugin "${name}" is not loaded` });
  auditLog('plugin_unload', req, { pluginName: name });
  res.json({ success: true });
});

// ── POST /api/plugins/:name/install ──────────────────────────────────────────
// Installs a plugin from the community catalogue by downloading its source.
// The source is SHA-256 verified against the catalogue's declared checksum.

router.post('/:name/install', requireAuth, requireAdmin, async (req, res) => {
  const { name } = req.params;

  // Validate name: only lowercase letters, digits, hyphens
  if (!/^[a-z0-9-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid plugin name' });
  }

  // Find the plugin entry in the catalogue
  const catalogue = REGISTRY_URL
    ? await fetchJson(REGISTRY_URL, 5000).catch(() => BUNDLED_CATALOGUE)
    : BUNDLED_CATALOGUE;

  const entry = catalogue.find((p) => p.name === name);
  if (!entry) return res.status(404).json({ error: `Plugin "${name}" not found in registry` });
  if (!entry.downloadUrl) return res.status(400).json({ error: 'No download URL for this plugin' });

  try {
    const source = await fetchText(entry.downloadUrl, 10000);

    // Verify SHA-256 if the catalogue provides one
    if (entry.sha256) {
      const actual = crypto.createHash('sha256').update(source).digest('hex');
      if (actual !== entry.sha256) {
        return res.status(400).json({ error: 'Plugin checksum mismatch — installation aborted' });
      }
    }

    const pluginDir = path.join(PLUGINS_ROOT, name);
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'index.js'), source, 'utf8');

    // Write metadata
    fs.writeFileSync(
      path.join(pluginDir, 'package.json'),
      JSON.stringify({ name, version: entry.version || '0.0.0', description: entry.description }, null, 2)
    );

    const db_ = require('../db');
    const meta = pluginLoader.loadPlugin(pluginDir, { db: db_, io: req.app.get('io') });
    if (!meta) return res.status(500).json({ error: 'Plugin loaded from disk but failed to initialise' });

    auditLog('plugin_install', req, { pluginName: name, version: entry.version });
    res.status(201).json({ success: true, plugin: meta });
  } catch (err) {
    console.error('[plugins] Install error:', err.message);
    res.status(500).json({ error: 'Installation failed: ' + err.message });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function fetchJson(url, timeoutMs) {
  return fetchText(url, timeoutMs).then((t) => JSON.parse(t));
}

function fetchText(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
        if (body.length > 512 * 1024) {   // 512 KB cap
          req.destroy();
          reject(new Error('Response too large'));
        }
      });
      res.on('end', () => resolve(body));
    });
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

// ── Built-in catalogue (shown when PLUGIN_REGISTRY_URL is not set) ────────────

const BUNDLED_CATALOGUE = [
  {
    name:        'achievements',
    version:     '1.0.0',
    author:      'AllOne Garden',
    description: 'Unlockable badges for in-game milestones (first harvest, 100 coins, etc.)',
    tags:        ['gameplay', 'progression'],
    installed:   true,
    downloadUrl: null,   // bundled — no download needed
  },
  {
    name:        'weather-forecast',
    version:     '1.0.0',
    author:      'AllOne Garden',
    description: 'Shows a 5-day weather forecast generated each new in-game day.',
    tags:        ['weather', 'ui'],
    installed:   true,
    downloadUrl: null,
  },
];

module.exports = router;
