/**
 * Shared database module.
 *
 * Priority order:
 *  1. PostgreSQL  — when DATABASE_URL is set (production / Docker)
 *  2. SQLite      — when SQLITE_PATH is set, or ELECTRON_MODE=1 without DATABASE_URL
 *                   (Electron desktop: persistent local storage without PostgreSQL)
 *  3. In-memory   — no persistence; all routes fall through to their mem-stores
 *
 * All routes use this module via { query, getClient, isConnected }.
 * The interface is identical regardless of the backend, so no route code changes.
 */
const { Pool } = require('pg');

let pool    = null;
let sqlite  = null;
let pgDisabled = false;
let pgDisableWarned = false;

function isConnRefusedError(err) {
  if (!err) return false;
  if (err.code === 'ECONNREFUSED') return true;
  if (Array.isArray(err.errors) && err.errors.some((e) => e?.code === 'ECONNREFUSED')) return true;
  if (typeof err.message === 'string' && err.message.includes('ECONNREFUSED')) return true;
  return false;
}

function disablePostgresForRuntime(err) {
  if (pgDisabled) return;
  pgDisabled = true;
  if (!pgDisableWarned) {
    pgDisableWarned = true;
    console.warn('⚠️  PostgreSQL unavailable; falling back to in-memory/SQLite runtime');
    if (err?.message) console.warn(`   reason: ${err.message}`);
  }
}

// ── 1. PostgreSQL ──────────────────────────────────────────────────────────────
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL client error:', err);
    if (isConnRefusedError(err)) disablePostgresForRuntime(err);
  });

  console.log('🗄️  PostgreSQL pool created');
  // Best-effort startup probe: if DB is unreachable, disable postgres path early.
  pool.query('SELECT 1').catch((err) => {
    if (isConnRefusedError(err)) disablePostgresForRuntime(err);
  });

// ── 2. SQLite (Electron desktop / offline) ────────────────────────────────────
} else if (process.env.SQLITE_PATH || process.env.ELECTRON_MODE === '1') {
  const sqliteModule = require('./db-sqlite');
  const dbPath = process.env.SQLITE_PATH || require('path').join(
    // Electron sets APPDATA / HOME; fall back to os.tmpdir for bare Node runs
    process.env.APPDATA || process.env.HOME || require('os').tmpdir(),
    'allone-garden', 'garden.db'
  );
  sqliteModule.init(dbPath);

  // Register clean shutdown
  process.on('exit',    () => sqliteModule.close());
  process.on('SIGTERM', () => { sqliteModule.close(); process.exit(0); });
  process.on('SIGINT',  () => { sqliteModule.close(); process.exit(0); });

  sqlite = sqliteModule;

} else {
  console.warn('⚠️  DATABASE_URL not set — running without persistent database');
}

// ── Query interface ────────────────────────────────────────────────────────────

/**
 * Run a parameterised query.
 * Returns null when neither PostgreSQL nor SQLite is configured so callers
 * can fall back to their in-memory stores.
 *
 * @param {string} text   SQL string with $1/$2 placeholders
 * @param {Array}  params Query parameters
 * @returns {Promise<{ rows: any[], rowCount: number } | null>}
 */
async function query(text, params) {
  if (pool && !pgDisabled) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      if (isConnRefusedError(err)) {
        disablePostgresForRuntime(err);
        return null;
      }
      throw err;
    }
  }
  if (sqlite) return sqlite.query(text, params);
  return null;
}

/**
 * Borrow a client / connection for multi-statement transactions.
 * Remember to call client.release() in a finally block.
 */
async function getClient() {
  if (pool && !pgDisabled) return pool.connect();
  if (sqlite) return sqlite.getClient();
  throw new Error('No database configured');
}

/** Whether a persistent database connection is available (PostgreSQL or SQLite) */
function isConnected() {
  if (pool && !pgDisabled) return true;
  if (sqlite) return sqlite.isConnected();
  return false;
}

module.exports = { query, getClient, isConnected };
