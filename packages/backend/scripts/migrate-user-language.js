#!/usr/bin/env node
/**
 * Adds preferred_language to users (PostgreSQL).
 */
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.DATABASE_URL) {
  console.log('⏭️  migrate-user-language: no DATABASE_URL — skip');
  process.exit(0);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10) DEFAULT 'nl'
    `);
    console.log('✅  users.preferred_language ready');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
