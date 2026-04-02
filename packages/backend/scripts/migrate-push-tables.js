/**
 * Adds push_broadcast_log + push_client_events (PostgreSQL).
 * Safe to re-run.
 */
const { Pool } = require('pg');
require('dotenv').config();

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL not set — skip');
    process.exit(0);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS push_broadcast_log (
        id            SERIAL PRIMARY KEY,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        title         VARCHAR(200) NOT NULL,
        body_preview  TEXT,
        token_count   INTEGER NOT NULL DEFAULT 0,
        sent          INTEGER NOT NULL DEFAULT 0,
        failures      INTEGER NOT NULL DEFAULT 0,
        mode          VARCHAR(32),
        source        VARCHAR(16) NOT NULL DEFAULT 'admin',
        admin_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS push_client_events (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        event      VARCHAR(64) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_push_client_events_user
      ON push_client_events (user_id, created_at DESC)
    `);
    console.log('✅ push tables ready');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
