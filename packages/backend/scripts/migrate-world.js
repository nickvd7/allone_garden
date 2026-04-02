#!/usr/bin/env node
/**
 * World-map + plugin-config migration
 *
 * Creates:
 *   server_config  — key/value store for server-wide settings (world map, etc.)
 *   plugin_config  — per-plugin JSON configuration
 *   world_garden_slots — stable slot assignment (user -> garden slot)
 *
 * Safe to re-run — uses CREATE TABLE IF NOT EXISTS.
 *
 * Usage:
 *   node scripts/migrate-world.js
 *   npm run db:world
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🗺️  Creating server_config table…');
    await client.query(`
      CREATE TABLE IF NOT EXISTS server_config (
        key        VARCHAR(100) PRIMARY KEY,
        value      JSONB        NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    console.log('🔌 Creating plugin_config table…');
    await client.query(`
      CREATE TABLE IF NOT EXISTS plugin_config (
        plugin_name VARCHAR(100) PRIMARY KEY,
        config      JSONB        NOT NULL DEFAULT '{}',
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    console.log('🏡 Creating world_garden_slots table…');
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

    console.log('✅ World migration complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => { console.error('❌ Migration failed:', err); process.exit(1); });
