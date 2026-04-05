/**
 * Redis client — optional, graceful-degrading.
 *
 * Configure via environment variable:
 *   REDIS_URL  — e.g. redis://localhost:6379  (or rediss:// for TLS)
 *
 * When REDIS_URL is not set the module exports a null client and all callers
 * fall back to in-memory behaviour automatically.
 *
 * Usage:
 *   const { redisClient, isRedisReady } = require('./redis');
 */
const { createClient } = require('redis');

let redisClient = null;
let _ready      = false;

if (process.env.REDIS_URL) {
  redisClient = createClient({ url: process.env.REDIS_URL });

  redisClient.on('connect', () => {
    console.log('[redis] Connected to Redis');
    _ready = true;
  });

  redisClient.on('ready', () => { _ready = true; });

  redisClient.on('error', (err) => {
    // Log but never crash the server — rate limiting falls back to in-memory
    console.warn('[redis] Connection error (falling back to in-memory):', err.message);
    _ready = false;
  });

  redisClient.on('end', () => {
    console.warn('[redis] Connection closed');
    _ready = false;
  });

  // Connect asynchronously — don't block server startup
  redisClient.connect().catch((err) => {
    console.warn('[redis] Initial connect failed:', err.message);
  });
} else {
  if (process.env.NODE_ENV !== 'test') {
    console.info('[redis] REDIS_URL not set — rate limiters will use in-memory store');
  }
}

/**
 * Returns true when a Redis client is configured and currently connected.
 */
function isRedisReady() {
  return _ready && redisClient !== null;
}

// ── JWT token revocation via Redis ───────────────────────────────────────────
//
// When a user changes their password or deletes their account, we write
// a "revoke before" timestamp (Unix seconds) to Redis.  The auth middleware
// rejects any token whose `iat` is earlier than that timestamp.
//
// Key: jwt_revoked:<userId>   Value: Unix timestamp (seconds)   TTL: JWT max age + 1 day

const JWT_MAX_SECONDS = 7 * 24 * 3600;   // must match JWT_EXPIRES_IN default (7d)

/**
 * Mark all tokens issued BEFORE now as revoked for the given user.
 * Falls back silently when Redis is unavailable.
 */
async function revokeUserTokens(userId) {
  if (!isRedisReady()) return;
  try {
    const key = `jwt_revoked:${userId}`;
    await redisClient.set(key, String(Math.floor(Date.now() / 1000)), {
      EX: JWT_MAX_SECONDS + 86400,   // keep for one extra day to handle clock skew
    });
  } catch (err) {
    console.warn('[redis] revokeUserTokens failed:', err.message);
  }
}

/**
 * Returns true if the token (identified by its `iat` claim) has been revoked.
 * Falls back to false (non-blocking) when Redis is unavailable.
 *
 * @param {string|number} userId
 * @param {number}        iat   — token issued-at timestamp (Unix seconds from JWT payload)
 */
function strictJwtRevoke() {
  return (
    process.env.JWT_REVOKE_STRICT === 'true' || process.env.NODE_ENV === 'production'
  );
}

async function isTokenRevoked(userId, iat) {
  if (!isRedisReady()) return false;
  try {
    const revokedBefore = await redisClient.get(`jwt_revoked:${userId}`);
    if (revokedBefore === null) return false;
    return iat <= Number(revokedBefore);
  } catch (err) {
    console.warn('[redis] isTokenRevoked check failed:', err.message);
    // Fail closed in production (or JWT_REVOKE_STRICT) so revoked sessions stay dead if Redis errors mid-check
    if (strictJwtRevoke()) return true;
    return false;
  }
}

module.exports = { redisClient, isRedisReady, revokeUserTokens, isTokenRevoked };
