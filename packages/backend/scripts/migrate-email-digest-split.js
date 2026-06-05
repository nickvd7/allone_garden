/**
 * Split email_digest_enabled into daily + weekly toggles (both default on).
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
      ADD COLUMN IF NOT EXISTS email_daily_digest_enabled BOOLEAN NOT NULL DEFAULT TRUE
    `);
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_weekly_digest_enabled BOOLEAN NOT NULL DEFAULT TRUE
    `);
    await client.query(`
      UPDATE users SET
        email_daily_digest_enabled = COALESCE(email_digest_enabled, TRUE),
        email_weekly_digest_enabled = COALESCE(email_digest_enabled, TRUE)
      WHERE email_daily_digest_enabled IS DISTINCT FROM COALESCE(email_digest_enabled, TRUE)
         OR email_weekly_digest_enabled IS DISTINCT FROM COALESCE(email_digest_enabled, TRUE)
    `);
    console.log('✅  email daily/weekly digest columns ready');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((e) => { console.error(e); process.exit(1); });
