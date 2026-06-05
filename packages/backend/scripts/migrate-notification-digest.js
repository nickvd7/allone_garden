/**
 * Notification digest prefs + email log + last_active_at on users.
 */
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL not set — skip');
    process.exit(0);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_digest_enabled BOOLEAN NOT NULL DEFAULT TRUE
    `);
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW()
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_email_log (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind       TEXT NOT NULL DEFAULT 'digest',
        sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notification_email_log_user
      ON notification_email_log (user_id, sent_at DESC)
    `);
    console.log('✅  notification digest tables/columns ready');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((e) => { console.error(e); process.exit(1); });
