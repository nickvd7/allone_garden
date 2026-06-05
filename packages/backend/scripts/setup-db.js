/**
 * Database setup script.
 * Run once: npm run db:setup
 * Creates all tables if they do not already exist.
 */
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL. Add it to packages/backend/.env (or run from packages/backend with .env present).');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function setupDatabase() {
  console.log('🗄️  Setting up AllOne Garden database...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Users ───────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        username      VARCHAR(50)  UNIQUE NOT NULL,
        email         VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        level         INTEGER  DEFAULT 1,
        xp            INTEGER  DEFAULT 0,
        coins         INTEGER  DEFAULT 100,
        plants_grown  INTEGER  DEFAULT 0,
        server_id     VARCHAR(100),           -- which Pi node they belong to
        created_at    TIMESTAMP DEFAULT NOW(),
        last_login    TIMESTAMP,
        preferred_language VARCHAR(10) DEFAULT 'nl'
      )
    `);

    // ── Gardens ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS gardens (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        name        VARCHAR(100) DEFAULT 'My Garden',
        plots       JSONB    NOT NULL DEFAULT '[]',
        current_day INTEGER  DEFAULT 1,
        weather     VARCHAR(20) DEFAULT 'sunny',
        updated_at  TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── Inventory ───────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
        plant_type VARCHAR(50) NOT NULL,
        quantity   INTEGER DEFAULT 0,
        UNIQUE(user_id, plant_type)
      )
    `);

    // ── Trade listings (marketplace) ────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS trade_listings (
        id              SERIAL PRIMARY KEY,
        seller_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
        crop_id         VARCHAR(50) NOT NULL,
        quantity        INTEGER NOT NULL CHECK (quantity > 0),
        price_per_unit  INTEGER NOT NULL CHECK (price_per_unit > 0),
        created_at      TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── Trade history ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS trade_history (
        id          SERIAL PRIMARY KEY,
        listing_id  INTEGER,                           -- may be NULL if listing deleted
        seller_id   INTEGER REFERENCES users(id),
        buyer_id    INTEGER REFERENCES users(id),
        crop_id     VARCHAR(50) NOT NULL,
        quantity    INTEGER NOT NULL,
        total_coins INTEGER NOT NULL,
        completed_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── Chat messages ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER REFERENCES users(id),
        server_id  VARCHAR(100),
        message    TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── Plugins (installed per server) ──────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS plugins (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(100) UNIQUE NOT NULL,
        version     VARCHAR(20)  NOT NULL,
        author      VARCHAR(100),
        description TEXT,
        code_hash   VARCHAR(64),    -- SHA-256 of plugin source for integrity check
        enabled     BOOLEAN DEFAULT true,
        installed_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── Password reset tokens ────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        token      VARCHAR(64) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── P2P known peers ─────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS known_peers (
        id           SERIAL PRIMARY KEY,
        peer_id      VARCHAR(64) UNIQUE NOT NULL,   -- Hyperswarm public key (hex)
        server_name  VARCHAR(100),
        last_seen    TIMESTAMP DEFAULT NOW(),
        player_count INTEGER DEFAULT 0
      )
    `);

    // Archived leaderboard rows when a player crosses an in-game season boundary (112-day cycles)
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

    await client.query(`
      CREATE TABLE IF NOT EXISTS push_broadcast_log (
        id            SERIAL PRIMARY KEY,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        title         VARCHAR(200) NOT NULL,
        body_preview  TEXT,
        token_count   INTEGER NOT NULL DEFAULT 0,
        sent          INTEGER NOT NULL DEFAULT 0,
        failures      INTEGER NOT NULL DEFAULT 0,
        mode          VARCHAR(32),
        source        VARCHAR(16) NOT NULL DEFAULT 'admin',
        admin_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS push_client_events (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        event      VARCHAR(64) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_push_client_events_user ON push_client_events (user_id, created_at DESC)
    `);

    // ── Server config / world config ────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS server_config (
        key        VARCHAR(100) PRIMARY KEY,
        value      JSONB        NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS plugin_config (
        plugin_name VARCHAR(100) PRIMARY KEY,
        config      JSONB        NOT NULL DEFAULT '{}',
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS world_garden_slots (
        user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        slot_index  INTEGER NOT NULL CHECK (slot_index >= 0),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_world_garden_slots_slot
      ON world_garden_slots (slot_index)
    `);

    // ── Server registry (community server browser) ──────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS server_registry (
        id           SERIAL PRIMARY KEY,
        name         VARCHAR(100) NOT NULL,
        url          TEXT UNIQUE NOT NULL,
        description  TEXT,
        owner        VARCHAR(100),
        player_count INTEGER DEFAULT 0,
        version      VARCHAR(20),
        token        VARCHAR(96) NOT NULL,
        verified     BOOLEAN DEFAULT FALSE,
        last_seen    TIMESTAMPTZ DEFAULT NOW(),
        created_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_server_registry_last_seen
      ON server_registry (verified, last_seen DESC)
    `);

    await client.query('COMMIT');
    console.log('✅ Database setup complete!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Database setup failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

setupDatabase();
