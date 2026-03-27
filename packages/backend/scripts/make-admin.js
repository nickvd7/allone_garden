#!/usr/bin/env node
/**
 * make-admin.js — promote a user to admin (level 99).
 *
 * Usage:
 *   node scripts/make-admin.js <username>
 *
 * Requires DATABASE_URL to be set (or a .env file in the backend root).
 *
 * Example:
 *   DATABASE_URL=postgres://... node scripts/make-admin.js alice
 */
require('dotenv').config();
const { Pool } = require('pg');

const username = process.argv[2];
if (!username) {
  console.error('Usage: node scripts/make-admin.js <username>');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add it to .env or export it first.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const result = await pool.query(
      `UPDATE users SET level = 99 WHERE username = $1 RETURNING id, username, level`,
      [username]
    );

    if (result.rows.length === 0) {
      console.error(`User "${username}" not found.`);
      process.exit(1);
    }

    const { id, level } = result.rows[0];
    console.log(`✅ "${username}" (id=${id}) promoted to level ${level} (admin).`);
  } catch (err) {
    console.error('Database error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
