#!/usr/bin/env node
/**
 * Exit 0 if DATABASE_URL connects; 1 on auth/network error; 2 if unset.
 */
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.DATABASE_URL) {
  process.exit(2);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 8000,
});

pool
  .query('SELECT 1')
  .then(() => process.exit(0))
  .catch(() => process.exit(1))
  .finally(() => pool.end());
