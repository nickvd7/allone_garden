/**
 * Shared admin role checks (env allowlist + DB level >= 99).
 */

const ADMIN_USERS = (process.env.ADMIN_USERS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isAdminUser(user) {
  if (!user) return false;
  if (ADMIN_USERS.includes(user.username)) return true;
  return Number(user.level) >= 99;
}

module.exports = { ADMIN_USERS, isAdminUser };
