/**
 * player_proposals — trade & collaboration offers between players (and bots).
 * Run: node scripts/migrate-player-proposals.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function runPg() {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS player_proposals (
        id            SERIAL PRIMARY KEY,
        from_user_id  INTEGER NOT NULL,
        to_user_id    INTEGER NOT NULL,
        kind          VARCHAR(24) NOT NULL,
        payload       JSONB NOT NULL DEFAULT '{}',
        message       TEXT,
        status        VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at    TIMESTAMP DEFAULT NOW(),
        responded_at  TIMESTAMP
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_player_proposals_to
      ON player_proposals (to_user_id, status, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_player_proposals_from
      ON player_proposals (from_user_id, created_at DESC)
    `);
    console.log('✅  player_proposals table ready (PostgreSQL)');
  } finally {
    client.release();
    await pool.end();
  }
}

async function runSqlite() {
  const db = require('../src/db-sqlite');
  await db.init();
  await db.query(`
    CREATE TABLE IF NOT EXISTS player_proposals (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id  INTEGER NOT NULL,
      to_user_id    INTEGER NOT NULL,
      kind          TEXT NOT NULL,
      payload       TEXT NOT NULL DEFAULT '{}',
      message       TEXT,
      status        TEXT NOT NULL DEFAULT 'pending',
      created_at    TEXT DEFAULT (datetime('now')),
      responded_at  TEXT
    )
  `);
  console.log('✅  player_proposals table ready (SQLite)');
}

(async () => {
  if (process.env.DATABASE_URL) await runPg();
  else await runSqlite();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
