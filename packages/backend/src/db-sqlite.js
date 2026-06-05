/**
 * SQLite adapter for AllOne Garden backend.
 *
 * Provides the same { query, getClient, isConnected } interface as db.js
 * so all existing routes work without modification.
 *
 * Used when SQLITE_PATH is set (Electron desktop mode) and no PostgreSQL
 * DATABASE_URL is configured. Data is stored in a single .db file in the
 * Electron userData directory, so the game state survives app restarts.
 *
 * Translation layer handles the main pg→SQLite differences:
 *   - $1, $2 … parameters  →  ?, ? …
 *   - NOW()                 →  datetime('now')
 *   - ::text casts          →  removed (no-op in SQLite)
 *   - RETURNING clause      →  supported natively (SQLite ≥ 3.35, shipped with
 *                               better-sqlite3 ≥ 8.x)
 *   - ON CONFLICT … DO UPDATE  →  supported natively (SQLite ≥ 3.24)
 *   - JSONB columns         →  stored as TEXT; JSON.stringify/parse is handled
 *                               by the callers (they already do this)
 *
 * Tables created on first run: users, gardens, password_reset_tokens.
 * All other tables used only when PostgreSQL is available (leaderboard extras,
 * trade history, chat logs) simply remain absent; those routes already have
 * in-memory fallbacks.
 */
'use strict';

const path = require('path');

let db = null; // better-sqlite3 Database instance

// ── SQL translation ────────────────────────────────────────────────────────────

/**
 * Convert a PostgreSQL query string to SQLite-compatible SQL.
 *
 * Rules applied in order:
 *  1. $1, $2 … → ?, ? …
 *  2. NOW()    → datetime('now')
 *  3. ::text, ::int, ::boolean … casts → stripped
 */
function pgToSqlite(sql) {
  return sql
    // $1, $2, … → ?
    .replace(/\$(\d+)/g, '?')
    // NOW() → datetime('now')
    .replace(/\bNOW\(\)/gi, "datetime('now')")
    // Remove PostgreSQL type casts (::text, ::int, ::boolean, etc.)
    .replace(/::[a-z_]+/gi, '');
}

// ── Schema initialisation ──────────────────────────────────────────────────────

function initSchema() {
  // users — mirrors the PostgreSQL schema used by auth.js
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      email         TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      level         INTEGER NOT NULL DEFAULT 1,
      xp            INTEGER NOT NULL DEFAULT 0,
      coins         INTEGER NOT NULL DEFAULT 100,
      plants_grown  INTEGER NOT NULL DEFAULT 0,
      last_login    DATETIME,
      created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
      preferred_language TEXT DEFAULT 'nl'
    )
  `);

  try {
    db.exec(`ALTER TABLE users ADD COLUMN preferred_language TEXT DEFAULT 'nl'`);
  } catch {
    // column already exists
  }

  try {
    db.exec(`ALTER TABLE users ADD COLUMN email_digest_enabled INTEGER NOT NULL DEFAULT 1`);
  } catch {
    /* exists */
  }

  try {
    db.exec(`ALTER TABLE users ADD COLUMN email_daily_digest_enabled INTEGER NOT NULL DEFAULT 1`);
  } catch {
    /* exists */
  }

  try {
    db.exec(`ALTER TABLE users ADD COLUMN email_weekly_digest_enabled INTEGER NOT NULL DEFAULT 1`);
  } catch {
    /* exists */
  }

  try {
    db.exec(`ALTER TABLE users ADD COLUMN last_active_at DATETIME DEFAULT (datetime('now'))`);
  } catch {
    /* exists */
  }

  // gardens — stores the full plot JSON per user
  db.exec(`
    CREATE TABLE IF NOT EXISTS gardens (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL UNIQUE,
      plots       TEXT    NOT NULL DEFAULT '[]',
      current_day INTEGER NOT NULL DEFAULT 1,
      weather     TEXT    NOT NULL DEFAULT 'sunny',
      structures  TEXT,
      inventory   TEXT,
      updated_at  DATETIME NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // password reset tokens
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token      TEXT    PRIMARY KEY,
      user_id    INTEGER NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Archived season scores (same semantics as PostgreSQL)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_season_scores (
      user_id       INTEGER NOT NULL,
      cycle         INTEGER NOT NULL,
      season_index  INTEGER NOT NULL CHECK (season_index BETWEEN 0 AND 3),
      xp            INTEGER NOT NULL,
      coins         INTEGER NOT NULL,
      plants_grown  INTEGER NOT NULL,
      recorded_at   DATETIME NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, cycle, season_index),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_season_scores_lookup
    ON user_season_scores (cycle, season_index)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS push_broadcast_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
      title         TEXT NOT NULL,
      body_preview  TEXT,
      token_count   INTEGER NOT NULL DEFAULT 0,
      sent          INTEGER NOT NULL DEFAULT 0,
      failures      INTEGER NOT NULL DEFAULT 0,
      mode          TEXT,
      source        TEXT NOT NULL DEFAULT 'admin',
      admin_user_id INTEGER
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_client_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      event      TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS server_config (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL DEFAULT '{}',
      updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS plugin_config (
      plugin_name TEXT PRIMARY KEY,
      config      TEXT NOT NULL DEFAULT '{}',
      updated_at  DATETIME NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_garden_slots (
      user_id     INTEGER PRIMARY KEY,
      slot_index  INTEGER NOT NULL CHECK (slot_index >= 0),
      updated_at  DATETIME NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_world_garden_slots_slot
    ON world_garden_slots (slot_index)
  `);

  // Direct messages between authenticated users
  db.exec(`
    CREATE TABLE IF NOT EXISTS direct_messages (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message        TEXT    NOT NULL,
      created_at     DATETIME NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_dm_from_user
    ON direct_messages (from_user_id, created_at)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_dm_to_user
    ON direct_messages (to_user_id, created_at)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS group_chats (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   DATETIME NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS group_chat_members (
      group_id     TEXT NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at    DATETIME NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (group_id, user_id)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS group_chat_messages (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id       TEXT NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
      from_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message        TEXT NOT NULL,
      created_at     DATETIME NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_group_chat_members_user
    ON group_chat_members (user_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_group_chat_messages_group
    ON group_chat_messages (group_id, created_at)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_email_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind       TEXT NOT NULL DEFAULT 'digest',
      sent_at    DATETIME NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notification_email_log_user
    ON notification_email_log (user_id, sent_at)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS player_proposals (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id  INTEGER NOT NULL,
      to_user_id    INTEGER NOT NULL,
      kind          TEXT NOT NULL,
      payload       TEXT NOT NULL DEFAULT '{}',
      message       TEXT,
      status        TEXT NOT NULL DEFAULT 'pending',
      created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
      responded_at  DATETIME
    )
  `);
}

// ── Public API (mirrors db.js) ─────────────────────────────────────────────────

/**
 * Execute a parameterised query.
 * Returns a pg-compatible result object: { rows: [...], rowCount: N }
 */
async function query(text, params = []) {
  if (!db) return null;

  const sql = pgToSqlite(text);

  try {
    const stmt = db.prepare(sql);
    const verb  = sql.trim().slice(0, 6).toUpperCase();

    if (verb === 'SELECT') {
      const rows = stmt.all(...params);
      return { rows, rowCount: rows.length };
    }

    // INSERT / UPDATE / DELETE (may include RETURNING)
    const hasReturning = /RETURNING\b/i.test(sql);

    if (hasReturning) {
      // better-sqlite3 supports RETURNING directly
      const rows = stmt.all(...params);
      return { rows, rowCount: rows.length };
    }

    const info = stmt.run(...params);
    return { rows: [], rowCount: info.changes };
  } catch (err) {
    // Surface the error with the translated SQL for easier debugging
    const e = new Error(`SQLite query failed: ${err.message}\nSQL: ${sql}`);
    e.original = err;
    throw e;
  }
}

/**
 * Borrow a "client" for transactions.
 * Returns a thin wrapper that mirrors pg's client interface.
 */
async function getClient() {
  if (!db) throw new Error('SQLite not initialised');

  let inTx = false;

  return {
    query: async (text, params = []) => {
      return query(text, params);
    },
    /** BEGIN TRANSACTION */
    async query_begin() { db.exec('BEGIN'); inTx = true; },
    /** COMMIT */
    async query_commit() { db.exec('COMMIT'); inTx = false; },
    /** ROLLBACK */
    async query_rollback() { db.exec('ROLLBACK'); inTx = false; },
    /** Release — no-op for SQLite (no connection pool) */
    release() {
      if (inTx) {
        try {
          db.exec('ROLLBACK');
        } catch {
          void 0;
        }
      }
    },
  };
}

/** Whether a SQLite database is open */
function isConnected() {
  return db !== null && db.open;
}

// ── Initialise ─────────────────────────────────────────────────────────────────

/**
 * Open (or create) the SQLite database at the given path.
 * Called from db.js when SQLITE_PATH is configured.
 *
 * @param {string} dbPath  Absolute path to the .db file.
 */
function init(dbPath) {
  try {
    const Database = require('better-sqlite3');
    const fs       = require('fs');

    // Ensure parent directory exists
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    db = new Database(dbPath);

    // Enable WAL mode: much faster concurrent reads, safe on unexpected exit
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    initSchema();
    console.log(`🗄️  SQLite database opened at ${dbPath}`);
  } catch (err) {
    console.warn('[sqlite] Failed to open database:', err.message);
    db = null;
  }
}

/**
 * Close the database cleanly (called on process exit).
 */
function close() {
  try {
    db?.close();
  } catch {
    void 0;
  }
  db = null;
}

module.exports = { query, getClient, isConnected, init, close };
