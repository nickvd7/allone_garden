'use strict';

function parseAllowedOrigins(rawOrigins) {
  const fallback = ['http://localhost:3000'];
  if (!rawOrigins || !rawOrigins.trim()) return fallback;

  const origins = rawOrigins
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  return origins.length > 0 ? [...new Set(origins)] : fallback;
}

function buildCorsOriginValidator(allowedOrigins) {
  const allowed = new Set(allowedOrigins);
  return (origin, callback) => {
    // Allow same-origin and non-browser requests (curl, health checks, server-side)
    if (!origin) return callback(null, true);
    if (allowed.has(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  };
}

function parseTrustProxy(rawTrustProxy, nodeEnv) {
  if (rawTrustProxy && rawTrustProxy.trim()) {
    const value = rawTrustProxy.trim().toLowerCase();
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    return rawTrustProxy.trim();
  }
  return nodeEnv === 'production' ? 1 : false;
}

module.exports = {
  parseAllowedOrigins,
  buildCorsOriginValidator,
  parseTrustProxy,
};
