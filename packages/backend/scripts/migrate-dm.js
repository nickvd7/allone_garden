/**
 * Creates the direct_messages table (PostgreSQL).
 * Safe to re-run (uses IF NOT EXISTS).
 */
const { Pool } = require('pg');
require('dotenv').config();

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL not set — skip');
    process.exit(0);
  }
  const pool   = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS direct_messages (
        id             SERIAL PRIMARY KEY,
        from_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        to_user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message        TEXT    NOT NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dm_pair
      ON direct_messages (
        LEAST(from_user_id, to_user_id),
        GREATEST(from_user_id, to_user_id),
        created_at
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dm_to_user
      ON direct_messages (to_user_id, created_at DESC)
    `);
    console.log('✅  direct_messages table ready');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((e) => { console.error(e); process.exit(1); });
