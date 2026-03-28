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

module.exports = { redisClient, isRedisReady };
