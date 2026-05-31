/**
 * Admin authorisation middleware.
 *
 * Usage: router.get('/secret', requireAuth, requireAdmin, handler)
 *
 * A request is considered admin if:
 *   a) the JWT username appears in the ADMIN_USERS env var (comma-separated), OR
 *   b) the user row in the DB has level >= 99.
 *
 * requireAuth must run first (sets req.user).
 */
const db = require('../db');

const ADMIN_USERS = (process.env.ADMIN_USERS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  // Fast path: username on the env allowlist
  if (ADMIN_USERS.includes(req.user.username)) return next();

  // DB path: level >= 99
  if (!db.isConnected()) {
    // Cannot verify DB-level admin status — return 503 so a legitimate admin
    // gets a clear "try again" signal rather than a misleading 403.
    return res.status(503).json({ error: 'Database unavailable — cannot verify admin status' });
  }

  const result = await db.query(
    'SELECT level FROM users WHERE id = $1',
    [req.user.userId]
  );
  if (result.rows[0]?.level >= 99) return next();

  res.status(403).json({ error: 'Admin access required' });
}

module.exports = { requireAdmin };
