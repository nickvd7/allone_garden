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
const { ADMIN_USERS, isAdminUser } = require('../utils/adminRole');

async function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  // Fast path: username on the env allowlist
  if (ADMIN_USERS.includes(req.user.username)) return next();

  // DB path: level >= 99
  if (!db.isConnected()) {
    // If a database is configured but currently unreachable we cannot verify a
    // DB-level admin, so return 503 ("try again") rather than a misleading 403.
    // In pure in-memory mode (no DATABASE_URL / SQLITE_PATH) there is no DB-level
    // admin at all — access comes solely from the ADMIN_USERS allowlist checked
    // above — so a non-allowlisted user is definitively not an admin → 403.
    if (process.env.DATABASE_URL || process.env.SQLITE_PATH) {
      return res.status(503).json({ error: 'Database unavailable — cannot verify admin status' });
    }
    return res.status(403).json({ error: 'Admin access required' });
  }

  const result = await db.query(
    'SELECT level FROM users WHERE id = $1',
    [req.user.userId]
  );
  if (result.rows[0]?.level >= 99) return next();

  res.status(403).json({ error: 'Admin access required' });
}

module.exports = { requireAdmin, isAdminUser };
