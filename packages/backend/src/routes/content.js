'use strict';
/**
 * Public content routes.
 *
 *   GET  /api/content                          — full merged game content (no auth)
 *   POST /api/content/propose                  — submit a proposal (requireAuth)
 *   GET  /api/content/proposals/pending-count  — pending badge count (public)
 *   GET  /api/content/proposals/mine           — current user's own proposals (requireAuth)
 *   POST /api/content/proposals/:id/resubmit   — re-submit after revision_requested (requireAuth)
 *
 * Security layers on the propose endpoint:
 *   • requireAuth          — must be logged in
 *   • proposeLimiter       — max 10 proposals per user per hour (per IP in fallback)
 *   • sanitiseItem()       — strip HTML/script tags from all string fields via xss()
 *   • Field validation     — id/slug + name required; numeric bounds enforced
 *   • Duplicate guard      — blocks a second pending/revision_requested proposal for the same item
 *   • Body size            — global 64 kb cap already set in index.js
 */
const express        = require('express');
const router         = express.Router();
const rateLimit      = require('express-rate-limit');
const xss            = require('xss');
const db             = require('../db');
const contentStore   = require('../state/contentStore');
const proposalStore  = require('../state/proposalStore');
const { requireAuth } = require('../middleware/auth');
const { RedisStore } = require('rate-limit-redis');
const { redisClient, isRedisReady } = require('../redis');

const CONTENT_TYPES = ['plants', 'structures', 'tools', 'weather'];

// ── Per-user proposal rate limiter ────────────────────────────────────────────
// Max 10 proposals per userId per hour (falls back to IP if not authenticated,
// but requireAuth runs first so userId is always set when this fires).
const proposeLimiter = rateLimit({
  windowMs:    60 * 60 * 1000,  // 1 hour
  max:         10,
  keyGenerator: (req) => `propose_${req.user?.userId || req.ip}`,
  message:     { error: 'Too many proposals — please wait before submitting more.' },
  standardHeaders: true,
  legacyHeaders:   false,
  skip:        (_req) => process.env.NODE_ENV === 'test',
  store: (() => {
    if (isRedisReady()) {
      return new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
        prefix: 'rl:propose:',
      });
    }
    return undefined;
  })(),
});

// ── XSS sanitisation helper ───────────────────────────────────────────────────
// Strips all HTML tags from every string value in the proposal item.
// Applied recursively so nested strings (e.g. companion slugs) are also cleaned.
const XSS_OPTS = {
  whiteList:    {},   // no tags allowed at all
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
};

function sanitiseValue(val) {
  if (typeof val === 'string')  return xss(val.trim(), XSS_OPTS);
  if (Array.isArray(val))       return val.map(sanitiseValue);
  if (val && typeof val === 'object') return sanitiseItem(val);
  return val;
}
function sanitiseItem(item) {
  return Object.fromEntries(
    Object.entries(item).map(([k, v]) => [k, sanitiseValue(v)])
  );
}

// ── Field-level validators ────────────────────────────────────────────────────
const MAX_STR  = 120;   // max length for any string field
const MAX_DESC = 500;   // description

function validateItem(type, item) {
  const errors = [];
  const idField = type === 'plants' ? 'slug' : 'id';

  if (!item[idField] || typeof item[idField] !== 'string') {
    errors.push(`${idField} is required`);
  } else if (!/^[a-z0-9_]{1,64}$/.test(item[idField])) {
    errors.push(`${idField} must be 1–64 lowercase letters, digits, or underscores`);
  }

  if (!item.name || typeof item.name !== 'string' || item.name.trim().length === 0) {
    errors.push('name is required');
  } else if (item.name.length > MAX_STR) {
    errors.push(`name must be ≤ ${MAX_STR} characters`);
  }

  if (item.description && item.description.length > MAX_DESC) {
    errors.push(`description must be ≤ ${MAX_DESC} characters`);
  }

  if (type === 'plants') {
    if (item.growthDays !== undefined) {
      const d = Number(item.growthDays);
      if (!Number.isInteger(d) || d < 1 || d > 30) errors.push('growthDays must be an integer 1–30');
    }
    if (item.baseCoins !== undefined) {
      const c = Number(item.baseCoins);
      if (!Number.isFinite(c) || c < 0 || c > 9999) errors.push('baseCoins must be 0–9999');
    }
  }
  if (type === 'structures') {
    if (item.buildCost !== undefined) {
      const c = Number(item.buildCost);
      if (!Number.isFinite(c) || c < 0 || c > 99999) errors.push('buildCost must be 0–99999');
    }
  }
  if (type === 'weather') {
    if (item.pestChance !== undefined) {
      const p = Number(item.pestChance);
      if (!Number.isFinite(p) || p < 0 || p > 1) errors.push('pestChance must be 0–1');
    }
  }

  return errors;
}

// ── GET /api/content — full merged content ────────────────────────────────────
router.get('/', (req, res) => {
  res.json(contentStore.getAll());
});

// ── GET /api/content/proposals/pending-count — public badge count ─────────────
router.get('/proposals/pending-count', (req, res) => {
  const count = proposalStore.list('pending').length;
  res.json({ count });
});

// ── GET /api/content/proposals/mine — current user's proposals ───────────────
router.get('/proposals/mine', requireAuth, (req, res) => {
  const { userId } = req.user;
  const mine = proposalStore.list(null).filter((p) => p.submittedBy === userId);
  // Sort newest first
  mine.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return res.json({ proposals: mine });
});

// ── POST /api/content/propose — submit a new proposal ────────────────────────
router.post('/propose', requireAuth, proposeLimiter, async (req, res) => {
  const { type, item: rawItem } = req.body;

  if (!CONTENT_TYPES.includes(type)) {
    return res.status(400).json({ error: `Unknown content type: ${type}` });
  }
  if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
    return res.status(400).json({ error: 'item must be a JSON object' });
  }

  // Sanitise all string fields (XSS prevention)
  const item = sanitiseItem(rawItem);

  // Enforce the id field format (slug for plants, id for others)
  const idField = type === 'plants' ? 'slug' : 'id';
  if (item[idField]) {
    item[idField] = item[idField].toLowerCase().replace(/\s+/g, '_');
  }

  // Field-level validation
  const errors = validateItem(type, item);
  if (errors.length > 0) {
    return res.status(400).json({ error: errors[0], errors });
  }

  const { userId, username } = req.user;

  // ── Duplicate guard ────────────────────────────────────────────────────────
  // Block if this user already has a pending or revision_requested proposal
  // for the exact same type + id/slug. They should edit the existing one instead.
  if (item[idField]) {
    const duplicate = proposalStore.list(null).find(
      (p) =>
        p.submittedBy === userId &&
        p.type        === type   &&
        p.item[idField] === item[idField] &&
        (p.status === 'pending' || p.status === 'revision_requested')
    );
    if (duplicate) {
      return res.status(409).json({
        error: `You already have an open proposal for this ${type.slice(0, -1)} (${duplicate.status}). Edit and re-submit that one instead.`,
        existingId: duplicate.id,
        existingStatus: duplicate.status,
      });
    }
  }

  const proposal = proposalStore.add({ type, item, submittedBy: userId, submittedByName: username });

  if (db.isConnected()) {
    try {
      await db.query(
        `INSERT INTO content_proposals (id, type, item, submitted_by, submitted_by_name, status, note, created_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', '', NOW())
         ON CONFLICT (id) DO NOTHING`,
        [proposal.id, proposal.type, JSON.stringify(proposal.item),
         proposal.submittedBy, proposal.submittedByName]
      );
    } catch (err) {
      console.warn('content proposal DB insert failed (in-memory only):', err.message);
    }
  }

  return res.status(201).json({ success: true, proposal });
});

// ── POST /api/content/proposals/:id/resubmit — re-submit after revision ───────
// The proposer sends an updated item for a revision_requested proposal.
// The proposal is reset to pending with the new item.
router.post('/proposals/:id/resubmit', requireAuth, proposeLimiter, async (req, res) => {
  const { id }         = req.params;
  const { item: rawItem } = req.body || {};

  if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
    return res.status(400).json({ error: 'item must be a JSON object' });
  }

  const proposal = proposalStore.get(id);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

  // Only the original proposer may re-submit
  if (proposal.submittedBy !== req.user.userId) {
    return res.status(403).json({ error: 'You can only re-submit your own proposals' });
  }
  if (proposal.status !== 'revision_requested') {
    return res.status(409).json({ error: `Proposal is ${proposal.status} — only revision_requested proposals can be re-submitted` });
  }

  // Sanitise + validate the updated item
  const item    = sanitiseItem(rawItem);
  const idField = proposal.type === 'plants' ? 'slug' : 'id';
  if (item[idField]) {
    item[idField] = item[idField].toLowerCase().replace(/\s+/g, '_');
  }

  const errors = validateItem(proposal.type, item);
  if (errors.length > 0) {
    return res.status(400).json({ error: errors[0], errors });
  }

  // Update in-memory store
  const updated = proposalStore.update(id, { item });

  // Persist to DB
  if (db.isConnected()) {
    await db.query(
      `UPDATE content_proposals
       SET item = $1, status = 'pending', note = '', reviewed_at = NULL
       WHERE id = $2`,
      [JSON.stringify(item), id]
    ).catch((err) => console.warn('resubmit DB update failed (in-memory only):', err.message));
  }

  return res.json({ success: true, proposal: updated });
});

module.exports = router;
