#!/usr/bin/env node
/**
 * Gradendex migration + seed
 *
 * Creates the gradendex_entries table and populates it with the 9 core plants
 * and 3 structures.  Safe to re-run — uses INSERT … ON CONFLICT DO NOTHING.
 *
 * Usage:
 *   node scripts/migrate-gradendex.js
 *   npm run db:gradendex
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Companion data (mirrors Garden.js COMPANIONS) ─────────────────────────────
const C = {
  tomato:    { good: [{ slug: 'carrot', bonus: 20 }, { slug: 'lettuce', bonus: 10 }],             bad: [{ slug: 'pumpkin', penalty: 10 }] },
  carrot:    { good: [{ slug: 'tomato', bonus: 20 }, { slug: 'lettuce', bonus: 15 }, { slug: 'radish', bonus: 10 }], bad: [] },
  lettuce:   { good: [{ slug: 'carrot', bonus: 15 }, { slug: 'radish', bonus: 10 }],              bad: [{ slug: 'corn', penalty: 15 }] },
  radish:    { good: [{ slug: 'lettuce', bonus: 10 }, { slug: 'carrot', bonus: 10 }],             bad: [] },
  corn:      { good: [{ slug: 'potato', bonus: 20 }],                                             bad: [{ slug: 'lettuce', penalty: 15 }, { slug: 'pumpkin', penalty: 20 }] },
  potato:    { good: [{ slug: 'corn', bonus: 20 }],                                               bad: [{ slug: 'pumpkin', penalty: 10 }] },
  pumpkin:   { good: [{ slug: 'sunflower', bonus: 15 }],                                          bad: [{ slug: 'corn', penalty: 20 }, { slug: 'potato', penalty: 10 }] },
  sunflower: { good: [{ slug: 'pumpkin', bonus: 15 }, { slug: 'blueberry', bonus: 10 }],          bad: [] },
  blueberry: { good: [{ slug: 'sunflower', bonus: 10 }, { slug: 'carrot', bonus: 5 }],            bad: [] },
};

// ── Seed data ─────────────────────────────────────────────────────────────────
const ENTRIES = [
  // ── Plants ──────────────────────────────────────────────────────────────────
  {
    slug: 'radish', name: 'Radish', emoji: '🌸', category: 'plant',
    short_desc: 'Fastest-growing crop. Perfect for beginners.',
    long_desc: 'The radish is the speedster of AllOne Garden — ready to harvest after just **1 day**. Its modest coin value (🪙6) is offset by how quickly you can cycle harvests, stacking XP and inventory fast.\n\nRadishes grow well next to lettuce and carrot, making them a great filler crop in a companion-planned garden.',
    growth_days: 1, base_coins: 6,
    companion_good: C.radish.good, companion_bad: C.radish.bad,
    tips: [
      'Plant radishes in empty plots while slower crops mature.',
      'Pairs well with lettuce and carrot for small companion bonuses.',
      'Great for levelling up quickly early in the game.',
    ],
  },
  {
    slug: 'carrot', name: 'Carrot', emoji: '🥕', category: 'plant',
    short_desc: 'Reliable 2-day crop with great companion synergy.',
    long_desc: 'Carrots are among the most versatile crops in AllOne Garden. They ripen in **2 days** and play nicely with nearly every other plant — benefiting from tomatoes, lettuce, and radishes nearby.\n\nAt 🪙10 per harvest they are a solid mid-game earner.',
    growth_days: 2, base_coins: 10,
    companion_good: C.carrot.good, companion_bad: C.carrot.bad,
    tips: [
      'Surround carrots with tomatoes (+20%) and lettuce (+15%) for the biggest bonus.',
      'Keep away from corn — no synergy there.',
      'Good choice for the Compost Heap strategy due to reliable 2-day cycles.',
    ],
  },
  {
    slug: 'lettuce', name: 'Lettuce', emoji: '🥬', category: 'plant',
    short_desc: 'Cheap filler crop. Good companion to most plants.',
    long_desc: 'Lettuce matures in **2 days** for a modest 🪙8. Its real value is as a companion: it benefits neighbours such as carrots and radishes while itself being boosted by carrot proximity.\n\nAvoid planting next to corn — they antagonise each other (−15% for lettuce).',
    growth_days: 2, base_coins: 8,
    companion_good: C.lettuce.good, companion_bad: C.lettuce.bad,
    tips: [
      'Lettuce is cheap insurance: fill gaps between high-value crops.',
      'Carrot/Lettuce/Radish trio gives everyone bonuses.',
      'Never plant next to corn if you care about yield.',
    ],
  },
  {
    slug: 'sunflower', name: 'Sunflower', emoji: '🌻', category: 'plant',
    short_desc: 'Bright 2-day crop. The best friend of pumpkins.',
    long_desc: 'Sunflowers are the companion kings of the garden. They ripen in **2 days** for 🪙12 and provide a +15% bonus to adjacent pumpkins — making them essential in any late-game pumpkin setup.\n\nThey also benefit from blueberry neighbours (+10%).',
    growth_days: 2, base_coins: 12,
    companion_good: C.sunflower.good, companion_bad: C.sunflower.bad,
    tips: [
      'Always surround pumpkin plots with sunflowers.',
      'Sunflower + Blueberry + Pumpkin is a powerful late-game trio.',
      'Short growth cycle means you can harvest 2–3 times per pumpkin cycle.',
    ],
  },
  {
    slug: 'tomato', name: 'Tomato', emoji: '🍅', category: 'plant',
    short_desc: 'Classic 3-day crop. Great earnings with the right neighbours.',
    long_desc: 'Tomatoes take **3 days** but pay 🪙15 at harvest. Combined with a 20% carrot companion bonus the effective value rises to 🪙18 — among the best mid-game returns.\n\nKeep them away from pumpkins, which reduce tomato yield by 10%.',
    growth_days: 3, base_coins: 15,
    companion_good: C.tomato.good, companion_bad: C.tomato.bad,
    tips: [
      'Tomato + Carrot is one of the strongest early-game duos (+20%).',
      'Add a lettuce border for a small extra boost.',
      'Water every day — tomatoes punish neglected plots.',
    ],
  },
  {
    slug: 'potato', name: 'Potato', emoji: '🥔', category: 'plant',
    short_desc: 'Hearty 3-day crop. Loves corn, hates pumpkins.',
    long_desc: 'Potatoes take **3 days** and earn 🪙12. Their standout feature is a strong synergy with corn: potatoes next to corn earn a +20% bonus (and corn next to potatoes does too), making the Corn/Potato pair one of the most efficient arrangements in the game.',
    growth_days: 3, base_coins: 12,
    companion_good: C.potato.good, companion_bad: C.potato.bad,
    tips: [
      'Alternate rows of corn and potato for a mutual +20% bonus.',
      'Never plant next to pumpkins.',
      'The Greenhouse protects high-value corn/potato plots from storm damage.',
    ],
  },
  {
    slug: 'blueberry', name: 'Blueberry', emoji: '🫐', category: 'plant',
    short_desc: 'High-value 4-day crop. Pairs beautifully with sunflowers.',
    long_desc: 'Blueberries take **4 days** to mature but reward patience with 🪙22 at harvest. They benefit from sunflower and carrot neighbours, fitting neatly into a mixed garden.\n\nBecause of the longer cycle, fertilize every blueberry plot to accelerate growth.',
    growth_days: 4, base_coins: 22,
    companion_good: C.blueberry.good, companion_bad: C.blueberry.bad,
    tips: [
      'Always fertilize blueberries — shaving off even 0.5 days matters over many harvests.',
      'Sunflower neighbour gives +10%.',
      'Use the Well early in a blueberry cycle to water everything in one go.',
    ],
  },
  {
    slug: 'corn', name: 'Corn', emoji: '🌽', category: 'plant',
    short_desc: 'Tall 4-day crop. Best friend of potato, worst enemy of pumpkin.',
    long_desc: 'Corn ripens in **4 days** for 🪙18. The mutual Corn/Potato bond (+20% each) makes this pair the backbone of a productivity-focused garden.\n\nCorn actively harms lettuce (−15%) and pumpkins (−20%), so careful plot planning is essential.',
    growth_days: 4, base_coins: 18,
    companion_good: C.corn.good, companion_bad: C.corn.bad,
    tips: [
      'Alternate corn and potato columns for maximum mutual bonus.',
      'Keep corn far from lettuce and pumpkin plots.',
      'Fertilize corn to bring the 4-day cycle down effectively.',
    ],
  },
  {
    slug: 'pumpkin', name: 'Pumpkin', emoji: '🎃', category: 'plant',
    short_desc: 'The most valuable crop. Slow but worth the wait.',
    long_desc: 'Pumpkins take a full **5 days** to ripen but pay out 🪙28 — the highest base value in the game. Add a sunflower companion bonus (+15%) and the effective yield climbs to 🪙32.\n\nPumpkins are fragile: corn, potato, and tomato neighbours all reduce yield. Plan the pumpkin block of your garden carefully.',
    growth_days: 5, base_coins: 28,
    companion_good: C.pumpkin.good, companion_bad: C.pumpkin.bad,
    tips: [
      'Surround every pumpkin with sunflowers — a +15% bonus on 🪙28 adds up fast.',
      'Build the Greenhouse before planting pumpkins: storms can knock ripe crops back a day.',
      'Fertilize + water every cycle. Never skip a day on pumpkins.',
      'Keep pumpkins in a dedicated corner, away from corn and potato.',
    ],
  },
  // ── Structures ────────────────────────────────────────────────────────────────
  {
    slug: 'well', name: 'Water Well', emoji: '🪣', category: 'structure',
    short_desc: 'Waters all tilled plots in one click. 3 charges per day.',
    long_desc: 'The Water Well costs **50 🪙** to build and gives you 3 charges every day (replenished at each Next Day tick). Each use raises the water level of every tilled plot by +2.\n\nIndispensable once your garden exceeds 10–12 active plots — the time saved clicking individual plots is enormous.',
    growth_days: null, base_coins: null,
    companion_good: [], companion_bad: [],
    tips: [
      'Build the Well as your second structure (after Compost Heap).',
      'Charges reset every Next Day — never save them; use all 3 each day.',
      'Combine with fertilizer for maximum daily growth per plot.',
    ],
  },
  {
    slug: 'compost_heap', name: 'Compost Heap', emoji: '🌿', category: 'structure',
    short_desc: 'Auto-generates fertilizer charges every 3 harvests.',
    long_desc: 'The Compost Heap costs **30 🪙** and pays for itself within a few harvests. After every 3 harvests it generates 1 fertilizer charge. Clicking "Fertilize All" applies that charge to every planted, unfertilized plot instantly.\n\nThe cheapest structure and the first one you should build.',
    growth_days: null, base_coins: null,
    companion_good: [], companion_bad: [],
    tips: [
      'Build this first — 30 🪙 is achievable within your first 5–10 harvests.',
      'Save the charge for when you have many planted plots.',
      'Fertilizer + water on the same day = fastest possible growth.',
    ],
  },
  {
    slug: 'greenhouse', name: 'Greenhouse', emoji: '🏡', category: 'structure',
    short_desc: 'Passive shield against storm and drought damage.',
    long_desc: 'The Greenhouse costs **80 🪙** and works passively — no charges, no clicks. It converts storm ⛈️ and drought 🏜️ weather events into safe Cloudy conditions, preventing all crop damage and reducing drought-pest chance from 15% back to 5%.\n\nEssential before committing to a full 24-plot pumpkin or blueberry garden.',
    growth_days: null, base_coins: null,
    companion_good: [], companion_bad: [],
    tips: [
      'Build the Greenhouse before planting your first pumpkins.',
      'Storms can knock a ripe pumpkin back by a whole day — the Greenhouse prevents this.',
      'Once built, you never need to worry about weather again.',
    ],
  },
];

// ── Migration ─────────────────────────────────────────────────────────────────
async function migrate() {
  const client = await pool.connect();
  try {
    console.log('📖 Creating gradendex_entries table…');
    await client.query(`
      CREATE TABLE IF NOT EXISTS gradendex_entries (
        id             SERIAL PRIMARY KEY,
        slug           VARCHAR(50) UNIQUE NOT NULL,
        name           VARCHAR(100) NOT NULL,
        emoji          VARCHAR(10)  DEFAULT '',
        category       VARCHAR(50)  DEFAULT 'plant',
        short_desc     TEXT         DEFAULT '',
        long_desc      TEXT         DEFAULT '',
        growth_days    INTEGER      DEFAULT NULL,
        base_coins     INTEGER      DEFAULT NULL,
        companion_good JSONB        DEFAULT '[]',
        companion_bad  JSONB        DEFAULT '[]',
        tips           JSONB        DEFAULT '[]',
        updated_at     TIMESTAMPTZ  DEFAULT NOW(),
        updated_by     VARCHAR(100) DEFAULT NULL
      )
    `);

    console.log(`🌱 Seeding ${ENTRIES.length} entries (skip if already exist)…`);
    for (const e of ENTRIES) {
      await client.query(`
        INSERT INTO gradendex_entries
          (slug, name, emoji, category, short_desc, long_desc,
           growth_days, base_coins, companion_good, companion_bad, tips)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (slug) DO NOTHING
      `, [
        e.slug, e.name, e.emoji, e.category,
        e.short_desc, e.long_desc,
        e.growth_days, e.base_coins,
        JSON.stringify(e.companion_good),
        JSON.stringify(e.companion_bad),
        JSON.stringify(e.tips),
      ]);
    }

    console.log('✅ Gradendex migration complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => { console.error('❌ Migration failed:', err); process.exit(1); });
