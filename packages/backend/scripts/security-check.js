#!/usr/bin/env node
/**
 * AllOne Garden — Pre-start security check
 *
 * Run automatically before `npm start` via the "prestart" lifecycle hook.
 * In development (NODE_ENV !== 'production') warnings are printed but the
 * process does not exit.  In production every FAIL causes a non-zero exit so
 * the server never starts in an insecure state.
 *
 * Usage:  node scripts/security-check.js
 *         npm run security-check
 *
 * In GitHub Actions, set SECURITY_CHECK_CI=true and inject the same env vars
 * a production server would need — the same rules apply as for NODE_ENV=production.
 */
require('dotenv').config();

if (process.env.SECURITY_CHECK_CI === 'true') {
  console.log('[security-check] SECURITY_CHECK_CI — using workflow-supplied environment\n');
}

const PROD = process.env.NODE_ENV === 'production';

const results = [];
let fails = 0;

function check(label, pass, detail = '') {
  const status = pass ? '✅ PASS' : (PROD ? '🚨 FAIL' : '⚠️  WARN');
  if (!pass) fails++;
  results.push({ status, label, detail });
}

// ── 1. JWT_SECRET ─────────────────────────────────────────────────────────────
const jwt = process.env.JWT_SECRET || '';
check(
  'JWT_SECRET length >= 32',
  jwt.length >= 32,
  jwt.length > 0
    ? `Currently ${jwt.length} chars — minimum 32`
    : 'JWT_SECRET is not set'
);
check(
  'JWT_SECRET is not the default placeholder',
  !['secret', 'changeme', 'your-secret', 'test-secret', 'dev-secret'].some(
    (s) => jwt.toLowerCase().includes(s)
  ),
  'Replace the placeholder with a random value: openssl rand -base64 48'
);

// ── 2. ADMIN_USERS ────────────────────────────────────────────────────────────
const adminUsers = (process.env.ADMIN_USERS || '').trim();
check(
  'ADMIN_USERS is configured',
  adminUsers.length > 0,
  'Set ADMIN_USERS=yourusername in .env'
);

// ── 3. FRONTEND_URL ───────────────────────────────────────────────────────────
const frontendUrl = process.env.FRONTEND_URL || '';
check(
  'FRONTEND_URL is set (no wildcard CORS)',
  frontendUrl.length > 0,
  'Set FRONTEND_URL=https://yourdomain.com in .env'
);
if (PROD) {
  check(
    'FRONTEND_URL uses HTTPS in production',
    frontendUrl.startsWith('https://'),
    `Currently: ${frontendUrl || '(empty)'}`
  );
}

// ── 4. DATABASE_URL ───────────────────────────────────────────────────────────
const dbUrl = process.env.DATABASE_URL || '';
check(
  'DATABASE_URL is configured (data will persist)',
  dbUrl.length > 0,
  'Without DATABASE_URL all data is lost on restart — set it in .env'
);

// ── 5. REDIS_URL (optional but recommended for multi-worker setups) ───────────
const redisUrl = process.env.REDIS_URL || '';
// Only warn, never fail — Redis is optional
results.push({
  status: redisUrl ? '✅ PASS' : 'ℹ️  INFO',
  label:  'REDIS_URL configured',
  detail: redisUrl
    ? 'Rate-limit counters will survive restarts'
    : 'Rate limiters will use in-memory store (fine for single-process)',
});

// ── 6. NODE_ENV ───────────────────────────────────────────────────────────────
const nodeEnv = process.env.NODE_ENV || '';
check(
  'NODE_ENV is set',
  nodeEnv.length > 0,
  'Set NODE_ENV=production in .env for production deployments'
);

// ── 7. SMTP (optional — warn if password reset won't work) ───────────────────
const smtpHost = process.env.SMTP_HOST || '';
results.push({
  status: smtpHost ? '✅ PASS' : 'ℹ️  INFO',
  label:  'SMTP_HOST configured',
  detail: smtpHost
    ? 'Password-reset emails will be sent'
    : 'No SMTP configured — password-reset tokens will only be logged to stdout',
});

// ── 8. P2P_ENABLED with SERVER_NAME ──────────────────────────────────────────
if (process.env.P2P_ENABLED === 'true') {
  check(
    'SERVER_NAME set when P2P is enabled',
    (process.env.SERVER_NAME || '').trim().length > 0,
    'Set SERVER_NAME=My Garden Server so federated peers can identify you'
  );
}

// ── Report ────────────────────────────────────────────────────────────────────
const W = 56;
console.log('\n' + '─'.repeat(W));
console.log(' AllOne Garden — Security Pre-flight Check');
console.log('─'.repeat(W));

for (const { status, label, detail } of results) {
  console.log(`  ${status}  ${label}`);
  if (detail && !status.includes('PASS')) {
    console.log(`         ${detail}`);
  }
}

console.log('─'.repeat(W));

if (fails > 0 && PROD) {
  console.error(`\n🚨  ${fails} check(s) failed — server will NOT start in production.\n`);
  process.exit(1);
} else if (fails > 0) {
  console.warn(`\n⚠️   ${fails} warning(s) — safe to run in development, fix before going live.\n`);
} else {
  console.log('\n✅  All checks passed.\n');
}
