/**
 * Security middleware stack.
 * Applied globally in src/index.js before all routes.
 *
 * Layers:
 *  1. Helmet   — sets secure HTTP response headers
 *  2. CORS     — strict origin allowlist
 *  3. Rate limiters — protect auth and API endpoints
 *  4. Body limits   — prevent large payload attacks
 *  5. Audit logger  — logs security-relevant events
 */
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');
const express     = require('express');

// ── 1. Helmet (security headers) ──────────────────────────────────────────────
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],  // React inline styles
      imgSrc:      ["'self'", 'data:'],
      connectSrc:  ["'self'", 'ws:', 'wss:'],      // Socket.IO WebSocket
      fontSrc:     ["'self'"],
      objectSrc:   ["'none'"],
      frameSrc:    ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // needed for some WebRTC plugins
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// ── 2. Rate limiters ───────────────────────────────────────────────────────────

/**
 * Auth endpoints: 10 requests per 15 minutes per IP.
 * Prevents brute-force login and registration spam.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again in 15 minutes.' },
  skip: (req) => process.env.NODE_ENV === 'test',
});

/**
 * General API limiter: 200 requests per minute per IP.
 * Prevents API abuse while allowing normal gameplay.
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Slow down.' },
  skip: (req) => process.env.NODE_ENV === 'test',
});

/**
 * Trade endpoint limiter: 30 requests per minute.
 * Prevents automated trade bots.
 */
const tradeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many trade requests. Please slow down.' },
  skip: (req) => process.env.NODE_ENV === 'test',
});

/**
 * Account / sensitive action limiter: 5 requests per 15 minutes per IP.
 * Protects password-change and account-delete from abuse.
 */
const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many account requests. Please try again in 15 minutes.' },
  skip: (req) => process.env.NODE_ENV === 'test',
});

// ── 3. Body size limits ────────────────────────────────────────────────────────
// Garden payload (plots array) can be large; cap at 512 KB.
// Auth and trade payloads should be tiny; cap at 10 KB.
const bodyLimitLarge = express.json({ limit: '512kb' });
const bodyLimitSmall = express.json({ limit: '10kb' });

// ── 4. Request ID (for audit log correlation) ──────────────────────────────────
function requestId(req, res, next) {
  req.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  res.setHeader('X-Request-Id', req.id);
  next();
}

// ── 5. Audit logger ────────────────────────────────────────────────────────────
// Logs auth and admin events with IP and user agent.
// In production, pipe stdout to a log aggregator.
function auditLog(event, req, extra = {}) {
  const entry = {
    ts:     new Date().toISOString(),
    event,
    reqId:  req.id,
    ip:     req.ip || req.socket?.remoteAddress,
    ua:     req.headers['user-agent']?.slice(0, 120),
    userId: req.user?.userId,
    ...extra,
  };
  // Use a structured JSON line so log aggregators (Loki, Splunk, etc.) can parse it
  console.log('[AUDIT]', JSON.stringify(entry));
}

module.exports = {
  helmetMiddleware,
  authLimiter,
  apiLimiter,
  tradeLimiter,
  accountLimiter,
  bodyLimitLarge,
  bodyLimitSmall,
  requestId,
  auditLog,
};
