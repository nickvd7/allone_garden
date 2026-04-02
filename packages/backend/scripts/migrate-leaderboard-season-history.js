/**
 * Adds user_season_scores for archived per-season leaderboard (PostgreSQL).
 * Safe to re-run (CREATE TABLE IF NOT EXISTS).
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
      CREATE TABLE IF NOT EXISTS user_season_scores (
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        cycle         INTEGER NOT NULL,
        season_index  INTEGER NOT NULL CHECK (season_index BETWEEN 0 AND 3),
        xp            INTEGER NOT NULL,
        coins         INTEGER NOT NULL,
        plants_grown  INTEGER NOT NULL,
        recorded_at   TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, cycle, season_index)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_season_scores_lookup
      ON user_season_scores (cycle, season_index)
    `);
    console.log('✅ user_season_scores ready');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
