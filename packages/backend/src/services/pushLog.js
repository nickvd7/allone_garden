/**
 * Persist admin/cron push broadcast metadata when a database is available.
 */
const db = require('../db');

/**
 * @param {object} p
 * @param {string} p.title
 * @param {string} p.body
 * @param {number} p.tokenCount
 * @param {number} p.sent
 * @param {number} p.failures
 * @param {string} [p.mode]
 * @param {'admin'|'cron'} p.source
 * @param {number|null} [p.adminUserId]
 */
async function logPushBroadcast(p) {
  if (!db.isConnected()) return;
  try {
    await db.query(
      `INSERT INTO push_broadcast_log (title, body_preview, token_count, sent, failures, mode, source, admin_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        String(p.title).slice(0, 200),
        String(p.body || '').slice(0, 500),
        p.tokenCount | 0,
        p.sent | 0,
        p.failures | 0,
        (p.mode || '').slice(0, 32) || null,
        p.source === 'cron' ? 'cron' : 'admin',
        p.adminUserId === null || p.adminUserId === undefined
          ? null
          : Number(p.adminUserId),
      ]
    );
  } catch (e) {
    console.warn('[pushLog]', e.message);
  }
}

async function logPushClientEvent(userId, event) {
  if (!db.isConnected()) return;
  const ev = String(event || '').slice(0, 32);
  if (!ev) return;
  try {
    await db.query(
      `INSERT INTO push_client_events (user_id, event) VALUES ($1, $2)`,
      [userId, ev]
    );
  } catch (e) {
    console.warn('[pushLog] client event', e.message);
  }
}

module.exports = { logPushBroadcast, logPushClientEvent };
