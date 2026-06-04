/**
 * Public world routes.
 *
 * GET  /api/world/map      — current world map (no auth required)
 * GET  /api/world/players  — online player roster (auth required)
 * GET  /api/world/stats    — public world stats: online count, server name (no auth)
 */
'use strict';

const crypto        = require('crypto');
const express       = require('express');
const router        = express.Router();
const db            = require('../db');
const worldMap      = require('../state/worldMap');
const onlinePlayers = require('../state/onlinePlayers');
const contentStore  = require('../state/contentStore');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { getWorldPois } = require('../data/worldPois');
const worldPositions = require('../state/worldPositions');
const npcWorld = require('../services/npcWorld');

/**
 * Generate short-lived TURN credentials using the coturn REST-API / HMAC-SHA1 scheme.
 * username = "<expiryUnixTime>:<userId>"
 * credential = base64(HMAC-SHA1(WEBRTC_TURN_SECRET, username))
 * coturn verifies this server-side with the same shared secret, so static passwords
 * are never exposed and each credential expires after TTL seconds.
 */
function generateTemporalTurnCredentials(userId, ttlSeconds = 3600) {
  const secret = process.env.WEBRTC_TURN_SECRET;
  if (!secret) return null;
  const expiry     = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username   = `${expiry}:${userId}`;
  const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
  return { username, credential };
}

const DEFAULT_WORLD = null;
const DEFAULT_SLOTS = [
  { x: 3,  y: 3  },
  { x: 28, y: 16 },
  { x: 3,  y: 16 },
  { x: 28, y: 3  },
  { x: 9,  y: 4  },
  { x: 23, y: 15 },
  { x: 8,  y: 14 },
  { x: 23, y: 4  },
  { x: 5,  y: 9  },
  { x: 26, y: 9  },
  { x: 14, y: 5  },
  { x: 17, y: 14 },
];

/** Hard cap — extra slots uitgeschakeld zodat spelers samenwerken op gedeelde plekken. */
const MAX_WORLD_GARDEN_SLOTS = DEFAULT_SLOTS.length;

function capGardenSlots(slots) {
  const base = Array.isArray(slots) && slots.length ? slots : DEFAULT_SLOTS;
  return base.slice(0, MAX_WORLD_GARDEN_SLOTS);
}

async function loadAllGardenOwners() {
  const result = await safeQuery(
    `SELECT g.user_id, u.username
     FROM gardens g
     JOIN users u ON u.id = g.user_id
     ORDER BY g.user_id ASC
     LIMIT 200`
  );
  if (!result?.rows?.length) return [];
  return result.rows.map((row) => ({
    userId: String(row.user_id),
    username: row.username || `Player ${row.user_id}`,
  }));
}
const WORLD_CACHE_TTL_MS = 1500;
const projectionCache = new Map();
let dbUnavailableWarned = false;

function invalidateWorldProjectionCache() {
  projectionCache.clear();
}

function isConnRefusedError(err) {
  if (!err) return false;
  if (err.code === 'ECONNREFUSED') return true;
  if (Array.isArray(err.errors) && err.errors.some((e) => e?.code === 'ECONNREFUSED')) return true;
  if (typeof err.message === 'string' && err.message.includes('ECONNREFUSED')) return true;
  return false;
}

async function safeQuery(text, params = []) {
  if (!db.isConnected()) return null;
  try {
    return await db.query(text, params);
  } catch (err) {
    if (isConnRefusedError(err)) {
      if (!dbUnavailableWarned) {
        dbUnavailableWarned = true;
        console.warn('[world] Database unavailable, falling back to in-memory world state');
      }
      return null;
    }
    throw err;
  }
}

function parseMaybeJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function normalizeWorldConfig(value) {
  const parsed = parseMaybeJson(value, DEFAULT_WORLD);
  if (!parsed || !Array.isArray(parsed.map)) return null;
  return {
    map: parsed.map,
    gardenSlots: Array.isArray(parsed.gardenSlots) && parsed.gardenSlots.length > 0
      ? parsed.gardenSlots
      : DEFAULT_SLOTS,
  };
}

async function loadWorldConfig() {
  const result = await safeQuery(
    "SELECT value FROM server_config WHERE key = 'world_map'"
  );
  if (result && result.rows.length > 0) {
      return normalizeWorldConfig(result.rows[0].value);
  }

  // Fall back to in-memory state (set by admin PUT without DB)
  return normalizeWorldConfig(worldMap.get());
}

function buildPreview(plots) {
  const parsedPlots = parseMaybeJson(plots, []);
  const growthDaysBySlug = Object.fromEntries(
    contentStore.getPlants().map((p) => [p.slug, Number(p.growthDays) || 3])
  );
  if (!Array.isArray(parsedPlots)) {
    return {
      tilled: 0,
      planted: 0,
      ready: 0,
      tiles: [],
    };
  }
  const compact = parsedPlots.slice(0, 9).map((plot) => {
    if (!plot || !plot.tilled) return 0;
    if (!plot.planted) return plot.waterLevel > 0 ? 4 : 1;
    const required = growthDaysBySlug[plot.plantType] || 3;
    const isReady = (plot.daysPlanted || 0) >= required;
    if (isReady) return 3;
    return plot.waterLevel > 0 ? 4 : 2;
  });
  return {
    tilled: parsedPlots.filter((p) => p?.tilled).length,
    planted: parsedPlots.filter((p) => p?.planted).length,
    ready: parsedPlots.filter((p) => {
      if (!p?.planted) return false;
      const required = growthDaysBySlug[p.plantType] || 3;
      return (p.daysPlanted || 0) >= required;
    }).length,
    tiles: compact,
  };
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function buildEmptyPreview() {
  return { tilled: 0, planted: 0, ready: 0, tiles: [] };
}

async function ensureStableSlots(playerIds, slots) {
  if (!Array.isArray(slots) || slots.length === 0) return {};
  if (!Array.isArray(playerIds) || playerIds.length === 0) return {};

  const uniqIds = Array.from(new Set(playerIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)));
  if (uniqIds.length === 0) return {};

  const idPlaceholders = uniqIds.map((_, i) => `$${i + 1}`).join(', ');
  const current = await safeQuery(
    `SELECT user_id, slot_index FROM world_garden_slots WHERE user_id IN (${idPlaceholders})`,
    uniqIds
  );
  if (!current) return {};
  const assignments = {};
  const used = new Set();
  for (const row of current.rows) {
    assignments[Number(row.user_id)] = Number(row.slot_index);
    used.add(Number(row.slot_index));
  }

  const maxIdx = slots.length - 1;
  if (maxIdx < 0) return assignments;

  for (const userId of uniqIds) {
    if (Number.isInteger(assignments[userId]) && assignments[userId] >= 0 && assignments[userId] <= maxIdx) {
      continue;
    }

    let assigned = false;
    for (let idx = 0; idx < slots.length; idx += 1) {
      if (used.has(idx)) continue;
      try {
        const upserted = await safeQuery(
          `INSERT INTO world_garden_slots (user_id, slot_index)
           VALUES ($1, $2)
           ON CONFLICT (user_id) DO UPDATE
             SET slot_index = EXCLUDED.slot_index, updated_at = NOW()
           RETURNING slot_index`,
          [userId, idx]
        );
        if (upserted?.rows?.[0]) {
          const slot = Number(upserted.rows[0].slot_index);
          assignments[userId] = slot;
          used.add(slot);
          assigned = true;
          break;
        }
      } catch (err) {
        if (err.code === '23505') {
          used.add(idx);
          continue;
        }
        throw err;
      }
    }

    if (!assigned) {
      const fallback = userId % slots.length;
      assignments[userId] = fallback;
    }
  }

  return assignments;
}

// ── GET /api/world/map ────────────────────────────────────────────────────────
router.get('/map', async (req, res) => {
  try {
    const map = await loadWorldConfig();
    return res.json(map); // null = "use client default"
  } catch (err) {
    console.error('GET /api/world/map error:', err);
    return res.status(500).json({ error: 'Could not load world map' });
  }
});

// ── GET /api/world/gardens ─────────────────────────────────────────────────────
// Public world projection payload:
// map + stable slots + current occupants + compact garden previews
router.get('/gardens', optionalAuth, async (req, res) => {
  try {
    const viewerKey = req.user?.userId ? `u:${req.user.userId}` : 'anon';
    const cached = projectionCache.get(viewerKey);
    if (cached && Date.now() - cached.ts < WORLD_CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    const world = await loadWorldConfig();
    let slots = capGardenSlots(world?.gardenSlots);

    const roster = onlinePlayers.getAll().map((p) => ({
      userId: String(p.userId),
      username: p.username,
      online: true,
    }));
    const maybeMe = req.user?.userId
      ? [{ userId: String(req.user.userId), username: req.user.username || 'Guest', online: true }]
      : [];

    const allGardenOwners = await loadAllGardenOwners();
    const onlineIds = new Set([
      ...roster.map((p) => p.userId),
      ...maybeMe.map((p) => p.userId),
    ]);

    const mergedPlayers = new Map();
    for (const p of allGardenOwners) {
      mergedPlayers.set(p.userId, { ...p, online: onlineIds.has(p.userId) });
    }
    for (const p of [...roster, ...maybeMe]) {
      if (!p.userId) continue;
      mergedPlayers.set(p.userId, { userId: p.userId, username: p.username, online: true });
    }

    const uniquePlayers = Array.from(mergedPlayers.values()).filter((p) => !!p.userId);

    let slotByUserId = {};
    if (db.isConnected()) {
      const numericIds = uniquePlayers
        .map((p) => Number(p.userId))
        .filter((id) => Number.isInteger(id) && id > 0);
      slotByUserId = await ensureStableSlots(numericIds, slots);
    }

    const usedSlots = new Set(Object.values(slotByUserId).filter((s) => Number.isInteger(s)));
    const playersWithoutSlot = uniquePlayers.filter((p) => !Number.isInteger(slotByUserId[Number(p.userId)]));
    playersWithoutSlot.forEach((p, idx) => {
      const key = String(p.userId);
      const preferred = slots.length > 0 ? hashString(key) % slots.length : -1;
      let chosen = preferred;
      if (chosen >= 0 && usedSlots.has(chosen)) {
        for (let i = 0; i < slots.length; i += 1) {
          if (!usedSlots.has(i)) {
            chosen = i;
            break;
          }
        }
      }
      if (chosen < 0) chosen = idx % slots.length;
      slotByUserId[key] = chosen;
      usedSlots.add(chosen);
    });

    for (const [key, val] of Object.entries(slotByUserId)) {
      slotByUserId[String(key)] = Number(val);
    }

    const occupants = uniquePlayers
      .map((p) => ({
        userId: p.userId,
        username: p.username,
        online: !!p.online,
        slotId: slotByUserId[String(p.userId)] ?? slotByUserId[Number(p.userId)],
      }))
      .filter((o) => Number.isInteger(o.slotId))
      .map((o) => ({
        ...o,
        x: slots[o.slotId]?.x,
        y: slots[o.slotId]?.y,
      }))
      .filter((o) => Number.isInteger(o.x) && Number.isInteger(o.y));

    const gardenPreviewByUserId = {};
    if (db.isConnected() && occupants.length > 0) {
      const numericIds = occupants
        .map((o) => Number(o.userId))
        .filter((id) => Number.isInteger(id) && id > 0);
      if (numericIds.length > 0) {
        const idPlaceholders = numericIds.map((_, i) => `$${i + 1}`).join(', ');
        const gardens = await safeQuery(
          `SELECT user_id, plots FROM gardens WHERE user_id IN (${idPlaceholders})`,
          numericIds
        );
        if (gardens) {
          for (const row of gardens.rows) {
            gardenPreviewByUserId[String(row.user_id)] = buildPreview(row.plots);
          }
        }
      }
    }

    for (const occ of occupants) {
      if (!gardenPreviewByUserId[String(occ.userId)]) {
        gardenPreviewByUserId[String(occ.userId)] = buildEmptyPreview();
      }
    }

    const slotShareCounts = {};
    occupants.forEach((o) => {
      slotShareCounts[o.slotId] = (slotShareCounts[o.slotId] || 0) + 1;
    });

    const occupantsWithShare = occupants.map((o) => ({
      ...o,
      sharedCount: slotShareCounts[o.slotId] || 1,
    }));

    const payload = {
      map: world?.map || null,
      gardenSlots: slots,
      maxGardenSlots: MAX_WORLD_GARDEN_SLOTS,
      occupants: occupantsWithShare,
      gardenPreviewByUserId,
    };
    projectionCache.set(viewerKey, { ts: Date.now(), data: payload });
    return res.json(payload);
  } catch (err) {
    console.error('GET /api/world/gardens error:', err);
    return res.status(500).json({ error: 'Could not load world gardens' });
  }
});

// ── GET /api/world/pois — museum, venues, future interactables ───────────────
router.get('/pois', (req, res) => {
  res.json({ pois: getWorldPois() });
});

router.get('/positions', (req, res) => {
  res.json({ positions: worldPositions.getSnapshot() });
});

router.get('/npcs', (req, res) => {
  res.json(npcWorld.getNpcWorld());
});

// ── GET /api/world/players ────────────────────────────────────────────────────
// Returns the deduplicated list of currently-online authenticated players.
// Useful as a REST fallback before the socket emits players:list, and for
// server-to-server federation queries.
router.get('/players', requireAuth, (req, res) => {
  const players = onlinePlayers.getAll().map((p) => ({
    id:       p.userId,
    username: p.username,
  }));
  res.json({ players, count: players.length });
});

// ── GET /api/world/stats ──────────────────────────────────────────────────────
// Lightweight public stats endpoint — no auth required.
// Used by the server-browser / landing page.
router.get('/stats', (req, res) => {
  res.json({
    onlineCount:  onlinePlayers.getCount(),
    serverName:   process.env.SERVER_NAME  || 'AllOne Garden',
    serverMOTD:   process.env.SERVER_MOTD  || '',
    version:      process.env.npm_package_version || '1.0.0',
  });
});

// ── GET /api/world/ice-servers ────────────────────────────────────────────────
// Returns the ICE server list (STUN + optional TURN) for WebRTC peer connections.
// Keeps ICE config server-side so TURN credentials are never baked into the
// frontend build.
//
// STUN servers are returned to everyone (no credentials, public infrastructure).
// TURN credentials are only returned to authenticated users to prevent third
// parties from abusing the TURN relay and running up bandwidth costs.
//
// Environment variables (all optional):
//   WEBRTC_STUN_SERVERS  — comma-separated stun: URLs
//   WEBRTC_TURN_URL      — single turn: or turns: URL
//   WEBRTC_TURN_USERNAME — TURN credential username
//   WEBRTC_TURN_PASSWORD — TURN credential password
router.get('/ice-servers', optionalAuth, (req, res) => {
  const stunList = (process.env.WEBRTC_STUN_SERVERS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
    .map((urls) => ({ urls }));

  const iceServers = [...stunList];

  // Only provide TURN credentials to authenticated users
  if (process.env.WEBRTC_TURN_URL && req.user) {
    const turnEntry = { urls: process.env.WEBRTC_TURN_URL };

    // Prefer short-lived HMAC credentials (coturn REST-API / temporal credentials)
    // over static passwords. Falls back to static env vars if no secret configured.
    const temporal = generateTemporalTurnCredentials(req.user.userId);
    if (temporal) {
      turnEntry.username   = temporal.username;
      turnEntry.credential = temporal.credential;
    } else {
      if (process.env.WEBRTC_TURN_USERNAME) turnEntry.username   = process.env.WEBRTC_TURN_USERNAME;
      if (process.env.WEBRTC_TURN_PASSWORD) turnEntry.credential = process.env.WEBRTC_TURN_PASSWORD;
    }
    iceServers.push(turnEntry);
  }

  // Auth users get a private short cache (credentials expire in 1 h).
  // Unauthenticated users only receive STUN — safe to cache longer.
  const cacheHeader = req.user ? 'private, max-age=300' : 'public, max-age=3600';
  res.setHeader('Cache-Control', cacheHeader);
  res.json({ iceServers });
});

router.invalidateWorldProjectionCache = invalidateWorldProjectionCache;
module.exports = router;
