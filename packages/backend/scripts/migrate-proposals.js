/**
 * migrate-proposals.js — creates the content_proposals table.
 * Safe to re-run (CREATE TABLE IF NOT EXISTS).
 * Usage: npm run db:proposals
 */
require('dotenv').config();

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  console.log('▶ Running content_proposals migration…');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS content_proposals (
      id                VARCHAR(64)  PRIMARY KEY,
      type              VARCHAR(32)  NOT NULL CHECK (type IN ('plants','structures','tools','weather')),
      item              JSONB        NOT NULL,
      submitted_by      INTEGER      REFERENCES users(id) ON DELETE SET NULL,
      submitted_by_name VARCHAR(100),
      status            VARCHAR(32)  NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','rejected','revision_requested')),
      revision_count    SMALLINT     NOT NULL DEFAULT 0,
      note              TEXT         DEFAULT '',
      created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      reviewed_at       TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_content_proposals_status ON content_proposals(status);
  `);

  console.log('✅ content_proposals table ready.');
  await pool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
