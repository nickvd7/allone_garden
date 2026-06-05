/**
 * Group chat tables (PostgreSQL).
 * Safe to re-run (IF NOT EXISTS).
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
      CREATE TABLE IF NOT EXISTS group_chats (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS group_chat_members (
        group_id     TEXT NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (group_id, user_id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS group_chat_messages (
        id             SERIAL PRIMARY KEY,
        group_id       TEXT NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
        from_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message        TEXT NOT NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_group_chat_members_user
      ON group_chat_members (user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_group_chat_messages_group
      ON group_chat_messages (group_id, created_at DESC)
    `);
    console.log('✅  group_chats tables ready');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((e) => { console.error(e); process.exit(1); });
