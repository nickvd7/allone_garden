/**
 * Database setup script.
 * Run once: npm run db:setup
 * Creates all tables if they do not already exist.
 */
const { Pool } = require('pg');
require('dotenv').config();

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
        last_login    TIMESTAMP
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
