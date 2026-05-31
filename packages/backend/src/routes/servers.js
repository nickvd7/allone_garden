'use strict';
/**
 * Server registry — GET /api/servers, POST /api/servers/register, heartbeat, delete.
 *
 * Only active when SERVER_REGISTRY_ENABLED=true.  When IS_MAIN_SERVER=true this
 * server always appears as the first "official" entry regardless of the DB.
 *
 * Registration flow:
 *  1. Community server POSTs { name, url, ... }
 *  2. We verify it is reachable (GET <url>/health → 200)
 *  3. We store it and return a token
 *  4. Server sends POST /heartbeat every 5 min to stay visible
 *  Servers not seen for 30 min are hidden; not seen for 24 h are pruned nightly.
 */

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const https   = require('https');
const http    = require('http');
const { URL } = require('url');
const rateLimit = require('express-rate-limit');

const db            = require('../db');
const { requireAuth } = require('../middleware/auth');
const onlinePlayers = require('../state/onlinePlayers');

const REGISTRY_ENABLED = process.env.SERVER_REGISTRY_ENABLED === 'true';
const IS_MAIN          = process.env.IS_MAIN_SERVER === 'true';
const ADMIN_USERS      = (process.env.ADMIN_USERS || '').split(',').map(s => s.trim()).filter(Boolean);

// ── Rate limiters ─────────────────────────────────────────────────────────────

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 3,
  message: { error: 'Too many registrations. Try again in 1 hour.' },
  standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

const heartbeatLimiter = rateLimit({
  windowMs: 60 * 1000, max: 15,
  message: { error: 'Heartbeat rate limit exceeded.' },
  standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns true when an IP address (v4 or v6) or hostname is private/loopback.
// Used for both the pre-resolution hostname check and the post-resolution
// socket.remoteAddress check (DNS-rebinding guard).
function isPrivateIp(ip) {
  const s = (ip || '').toLowerCase();
  const v4 = s.replace(/^::ffff:/i, ''); // unwrap IPv4-mapped IPv6
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|169\.254\.)/.test(v4)) return true;
  if (/^fe80:/i.test(s) || s === '::1' || s === '0:0:0:0:0:0:0:1') return true;
  return false;
}

/**
 * Attempt a health check against <rawUrl>/health.
 * Only allows http:// and https:// to prevent SSRF to internal services.
 * Also checks the resolved socket IP (DNS-rebinding guard).
 * Returns true if the response is HTTP 200, false otherwise.
 */
function checkHealth(rawUrl, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(rawUrl + '/health');
    } catch {
      return resolve(false);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return resolve(false);
    }

    // Block private/loopback hostnames before DNS lookup (SSRF guard)
    if (isPrivateIp(parsed.hostname)) {
      return resolve(false);
    }

    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(parsed.href, { timeout: timeoutMs }, (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    });

    // DNS-rebinding guard: reject if the resolved IP is private
    req.on('socket', (socket) => {
      socket.once('connect', () => {
        if (isPrivateIp(socket.remoteAddress || '')) {
          req.destroy(new Error('DNS rebinding: resolved to private address'));
          resolve(false);
        }
      });
    });

    req.on('error',   () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function safeString(v, max) {
  return (typeof v === 'string' ? v : '').slice(0, max).trim();
}

// ── GET /api/servers ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const servers = [];

  // This server itself (main server entry — always first)
  if (IS_MAIN) {
    const publicUrl = process.env.APP_URL || '';
    // Only expose when we have a real public URL (not localhost)
    if (publicUrl && !/localhost|127\.0\.0\.1/.test(publicUrl)) {
      servers.push({
        id: 0,
        name:        process.env.SERVER_NAME || 'AllOne Garden',
        url:         publicUrl,
        description: process.env.SERVER_MOTD || '',
        playerCount: onlinePlayers.getCount(),
        version:     process.env.npm_package_version || '1.0.0',
        isMain:      true,
        verified:    true,
        lastSeen:    new Date().toISOString(),
      });
    }
  }

  // Community servers from DB
  if (REGISTRY_ENABLED && db.isConnected()) {
    try {
      const result = await db.query(`
        SELECT id, name, url, description, owner, player_count, version, verified, last_seen
        FROM   server_registry
        WHERE  verified = true
          AND  last_seen > NOW() - INTERVAL '30 minutes'
        ORDER  BY player_count DESC, last_seen DESC
        LIMIT  50
      `);
      for (const row of result.rows) {
        servers.push({
          id:          row.id,
          name:        row.name,
          url:         row.url,
          description: row.description || '',
          owner:       row.owner || '',
          playerCount: row.player_count || 0,
          version:     row.version || '',
          isMain:      false,
          verified:    row.verified,
          lastSeen:    row.last_seen,
        });
      }
    } catch (err) {
      console.error('[servers] DB error listing servers:', err.message);
    }
  }

  res.json({ servers, registryEnabled: REGISTRY_ENABLED });
});

// ── POST /api/servers/register ────────────────────────────────────────────────
router.post('/register', registerLimiter, async (req, res) => {
  if (!REGISTRY_ENABLED) {
    return res.status(403).json({ error: 'Server registry is not enabled on this server.' });
  }

  const name  = safeString(req.body?.name,        100);
  const rawUrl = safeString(req.body?.url,         300);
  const desc  = safeString(req.body?.description, 300);
  const owner = safeString(req.body?.owner,        100);

  if (name.length < 2)  return res.status(400).json({ error: 'name must be at least 2 characters' });
  if (!rawUrl)          return res.status(400).json({ error: 'url is required' });

  let origin;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
    origin = parsed.origin;
  } catch {
    return res.status(400).json({ error: 'url must be a valid http:// or https:// address' });
  }

  if (!db.isConnected()) {
    return res.status(503).json({ error: 'Server registry requires a database.' });
  }

  // Return existing token if already registered
  try {
    const existing = await db.query(
      'SELECT id, token FROM server_registry WHERE url = $1',
      [origin]
    );
    if (existing.rows.length > 0) {
      return res.json({ ok: true, already: true, id: existing.rows[0].id, token: existing.rows[0].token });
    }
  } catch (err) {
    console.error('[servers/register] lookup error:', err.message);
    return res.status(500).json({ error: 'Registry error' });
  }

  const token = crypto.randomBytes(32).toString('hex');

  let serverId;
  try {
    const result = await db.query(
      `INSERT INTO server_registry (name, url, description, owner, token, verified)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING id`,
      [name, origin, desc, owner, token]
    );
    serverId = result.rows[0].id;
  } catch (err) {
    console.error('[servers/register] insert error:', err.message);
    return res.status(500).json({ error: 'Failed to register server' });
  }

  // Verify health asynchronously — non-blocking
  setImmediate(async () => {
    const healthy = await checkHealth(origin);
    if (healthy) {
      await db.query('UPDATE server_registry SET verified = true WHERE id = $1', [serverId]);
      console.log(`[servers] Verified community server: ${origin}`);
    } else {
      console.warn(`[servers] Health check failed for ${origin} — marked unverified`);
    }
  });

  res.json({ ok: true, id: serverId, token, message: 'Registered. Health check in progress (may take a few seconds).' });
});

// ── POST /api/servers/heartbeat ───────────────────────────────────────────────
router.post('/heartbeat', heartbeatLimiter, async (req, res) => {
  if (!REGISTRY_ENABLED) {
    return res.status(403).json({ error: 'Registry not enabled.' });
  }

  const rawUrl     = safeString(req.body?.url,   300);
  const token      = safeString(req.body?.token,  70);
  const playerCount = Math.max(0, parseInt(req.body?.playerCount) || 0);

  if (!rawUrl || !token) {
    return res.status(400).json({ error: 'url and token required' });
  }

  let origin;
  try {
    origin = new URL(rawUrl).origin;
  } catch {
    return res.status(400).json({ error: 'Invalid url' });
  }

  if (!db.isConnected()) {
    return res.status(503).json({ error: 'Registry requires DB.' });
  }

  try {
    const result = await db.query(
      `UPDATE server_registry
          SET last_seen    = NOW(),
              player_count = $1
        WHERE url   = $2
          AND token = $3
       RETURNING id`,
      [playerCount, origin, token]
    );
    if (!result.rows.length) {
      return res.status(401).json({ error: 'Invalid token or URL not registered.' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[servers/heartbeat] error:', err.message);
    res.status(500).json({ error: 'Heartbeat failed' });
  }
});

// ── DELETE /api/servers/:id (admin only) ─────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  if (!ADMIN_USERS.includes(req.user.username)) {
    return res.status(403).json({ error: 'Admin only.' });
  }

  const id = parseInt(req.params.id, 10);
  if (!id || id < 1) return res.status(400).json({ error: 'Invalid id' });

  if (!db.isConnected()) {
    return res.status(503).json({ error: 'Registry requires DB.' });
  }

  await db.query('DELETE FROM server_registry WHERE id = $1', [id]);
  res.json({ ok: true });
});

// ── Nightly cleanup (called by the server on startup, prunes stale entries) ───
async function pruneStaleServers() {
  if (!REGISTRY_ENABLED || !db.isConnected()) return;
  try {
    const result = await db.query(
      `DELETE FROM server_registry WHERE last_seen < NOW() - INTERVAL '24 hours'`
    );
    if (result.rowCount > 0) {
      console.log(`[servers] Pruned ${result.rowCount} stale server(s) from registry`);
    }
  } catch (err) {
    console.warn('[servers] Prune error:', err.message);
  }
}

module.exports = router;
module.exports.pruneStaleServers = pruneStaleServers;
