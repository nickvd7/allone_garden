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
const { RedisStore } = require('rate-limit-redis');
const express     = require('express');
const { redisClient, isRedisReady } = require('../redis');

/**
 * Returns the rate-limit store to use.
 * Uses Redis when available so limits survive restarts and work in clustered
 * deployments. Falls back to default in-memory store when Redis is not configured.
 */
function makeStore(prefix) {
  if (isRedisReady()) {
    return new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: `rl:${prefix}:`,
    });
  }
  return undefined; // express-rate-limit default: in-memory Map
}

// ── 1. Helmet (security headers) ──────────────────────────────────────────────
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],  // React inline styles
      imgSrc:      ["'self'", 'data:'],
      // Browser CSP applies to documents this server serves (e.g. Electron); keep tight.
      connectSrc:  ["'self'"],
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
  skip: (_req) => process.env.NODE_ENV === 'test',
  store: makeStore('auth'),
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
  skip: (_req) => process.env.NODE_ENV === 'test',
  store: makeStore('api'),
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
  skip: (_req) => process.env.NODE_ENV === 'test',
  store: makeStore('trade'),
});

/**
 * Leaderboard limiter: 30 requests per minute per IP.
 * Public endpoint — needs a tighter cap than the global 200 req/min.
 */
const leaderboardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many leaderboard requests. Please slow down.' },
  skip: (_req) => process.env.NODE_ENV === 'test',
  store: makeStore('leaderboard'),
});

/**
 * Plant recognition limiter: 15 requests per 5 minutes per IP.
 *
 * Each request proxies an external paid vision API call (OpenAI / Anthropic /
 * Gemini). A tight cap prevents billing abuse and API quota exhaustion caused
 * by a single misbehaving client. Intentionally stricter than the global 200/min.
 */
const recognitionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,   // 5-minute window
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many recognition requests. Please wait a few minutes before trying again.' },
  skip: (_req) => process.env.NODE_ENV === 'test',
  store: makeStore('recognition'),
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
  skip: (_req) => process.env.NODE_ENV === 'test',
  store: makeStore('account'),
});

// ── 3. CSRF guard (Origin check for cookie-auth mode) ─────────────────────────
//
// When AUTH_HTTPONLY_COOKIE=true the browser automatically attaches the auth
// cookie to every same-site request, making state-changing endpoints vulnerable
// to cross-site request forgery.  We defend with a lightweight Origin check:
//
//   - Allow if Origin matches FRONTEND_URL (exact) or APP_URL.
//   - Allow if Origin is absent AND the request came from a non-browser client
//     (Electron, mobile app, curl) — identifiable by no Sec-Fetch-Site header.
//   - Deny everything else with 403.
//
// This is intentionally a no-op when AUTH_HTTPONLY_COOKIE is not enabled,
// since token-based (Bearer) auth is not CSRF-vulnerable.

const AUTH_HTTPONLY_COOKIE = process.env.AUTH_HTTPONLY_COOKIE === 'true';

const _csrfAllowed = new Set(
  [process.env.FRONTEND_URL, process.env.APP_URL]
    .flatMap((v) => (v || '').split(','))
    .map((v) => v.trim().replace(/\/$/, ''))
    .filter(Boolean)
);

function csrfGuard(req, res, next) {
  if (!AUTH_HTTPONLY_COOKIE) return next();

  const origin = req.headers['origin'];
  if (!origin) {
    // No Origin — allow only if the browser didn't add Sec-Fetch-Site
    // (i.e. this is a non-browser/server-to-server call, not a cross-origin form).
    if (req.headers['sec-fetch-site'] === undefined) return next();
    return res.status(403).json({ error: 'CSRF check failed: missing Origin' });
  }

  const normalised = origin.replace(/\/$/, '');
  if (_csrfAllowed.has(normalised) || normalised === `http://localhost:${process.env.PORT || 5000}`) {
    return next();
  }

  return res.status(403).json({ error: 'CSRF check failed: Origin not allowed' });
}

// ── 4. Body size limits ────────────────────────────────────────────────────────
// Garden payload (plots array) can be large; cap at 512 KB.
// Auth and trade payloads should be tiny; cap at 10 KB.
const bodyLimitLarge = express.json({ limit: '512kb' });
const bodyLimitSmall = express.json({ limit: '10kb' });

// ── 5. Request ID (for audit log correlation) ──────────────────────────────────
function requestId(req, res, next) {
  req.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  res.setHeader('X-Request-Id', req.id);
  next();
}

// ── 6. Audit logger ────────────────────────────────────────────────────────────
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
  leaderboardLimiter,
  recognitionLimiter,
  bodyLimitLarge,
  bodyLimitSmall,
  csrfGuard,
  requestId,
  auditLog,
};
