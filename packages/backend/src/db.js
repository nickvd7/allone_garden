/**
 * Shared PostgreSQL connection pool.
 * All routes import this module to query the database.
 * Falls back gracefully when DATABASE_URL is not set (development without DB).
 */
const { Pool } = require('pg');

let pool = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL client error:', err);
  });

  console.log('🗄️  PostgreSQL pool created');
} else {
  console.warn('⚠️  DATABASE_URL not set — running without persistent database');
}

/**
 * Run a parameterised query.
 * Returns null when no pool is configured so callers can fall back to memory.
 *
 * @param {string} text   SQL string with $1 placeholders
 * @param {Array}  params Query parameters
 * @returns {Promise<import('pg').QueryResult | null>}
 */
async function query(text, params) {
  if (!pool) return null;
  return pool.query(text, params);
}

/**
 * Borrow a client from the pool for multi-statement transactions.
 * Remember to call client.release() in a finally block.
 */
async function getClient() {
  if (!pool) throw new Error('No database pool configured');
  return pool.connect();
}

/** Whether a database connection is available */
function isConnected() {
  return pool !== null;
}

module.exports = { query, getClient, isConnected };
