/**
 * Persist built structures (barn, silo, etc.) on gardens row.
 */
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function migratePg() {
  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL not set — skip PostgreSQL');
    return;
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE gardens
      ADD COLUMN IF NOT EXISTS structures JSONB NOT NULL DEFAULT '{}'
    `);
    console.log('✅  gardens.structures ready (PostgreSQL)');
  } finally {
    client.release();
    await pool.end();
  }
}

async function migrateSqlite() {
  const db = require('../src/db-sqlite');
  await db.init();
  try {
    await db.query(`ALTER TABLE gardens ADD COLUMN structures TEXT`);
  } catch {
    /* exists */
  }
  console.log('✅  gardens.structures ready (SQLite)');
}

(async () => {
  await migratePg();
  if (!process.env.DATABASE_URL) await migrateSqlite();
})().catch((e) => { console.error(e); process.exit(1); });
