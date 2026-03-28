/**
 * Community plugin: leaderboard
 *
 * Tracks player stats and serves a live top-10 leaderboard.
 * Stats are collected from game events and persisted in a plugin table.
 *
 * Rankings available (via socket event):
 *   coins    — richest players
 *   level    — highest-level players
 *   harvest  — most crops harvested
 *
 * Socket events:
 *   plugin:leaderboard:request { category }  — client requests leaderboard
 *   plugin:leaderboard:data    { category, entries: [{rank, username, value}] }
 *
 * Broadcasted on change:
 *   plugin:leaderboard:update  { category, entries }
 *
 * License: MIT
 * Author: AllOne Garden Community
 */

const TOP_N = 10;

// Categories we track
const CATEGORIES = ['coins', 'level', 'harvest'];

module.exports = {
  name:    'leaderboard',
  version: '1.0.0',

  async init(api) {
    api.log('Leaderboard plugin initialised');

    // Store per-player stats in a plugin-namespaced table
    await api.dbCreateTable('stats',
      `user_id   INTEGER PRIMARY KEY,
       username  VARCHAR(50)  NOT NULL DEFAULT '',
       coins     INTEGER      NOT NULL DEFAULT 0,
       level     INTEGER      NOT NULL DEFAULT 1,
       harvest   INTEGER      NOT NULL DEFAULT 0,
       updated_at TIMESTAMP   DEFAULT NOW()`
    );

    // ── Helper: upsert a player's snapshot ───────────────────────────────────

    async function upsertStats(userId, username, patch) {
      if (!userId) return;
      const sets = Object.entries(patch)
        .map(([col, val], i) => `${col} = GREATEST(COALESCE(${col}, 0), $${i + 3})`)
        .join(', ');
      const vals = Object.values(patch);
      await api.dbQuery('stats',
        `INSERT INTO {{table}} (user_id, username, ${Object.keys(patch).join(', ')}, updated_at)
         VALUES ($1, $2, ${vals.map((_, i) => `$${i + 3}`).join(', ')}, NOW())
         ON CONFLICT (user_id) DO UPDATE
         SET username = EXCLUDED.username, ${sets}, updated_at = NOW()`,
        [userId, username || String(userId), ...vals]
      );
    }

    // ── Helper: fetch top-N for a category ───────────────────────────────────

    async function getTop(category) {
      const col = category === 'harvest' ? 'harvest' : category; // 'coins' | 'level' | 'harvest'
      const result = await api.dbQuery('stats',
        `SELECT username, ${col} AS value
         FROM {{table}}
         ORDER BY ${col} DESC
         LIMIT ${TOP_N}`,
        []
      );
      return (result?.rows || []).map((row, i) => ({
        rank:     i + 1,
        username: row.username,
        value:    row.value,
      }));
    }

    // ── Track stats from game events ──────────────────────────────────────────

    api.on('onPlayerJoin', async ({ userId, username, level, coins }) => {
      if (!userId) return;
      await upsertStats(userId, username, {
        level:  level  || 1,
        coins:  coins  || 0,
      });
    });

    api.on('onHarvest', async ({ userId, username, plantsHarvested }) => {
      if (!userId) return;
      await upsertStats(userId, username, {
        harvest: plantsHarvested || 1,
      });
    });

    api.on('onTrade', async ({ userId, username, coins }) => {
      if (!userId || coins == null) return;
      await upsertStats(userId, username, { coins });
    });

    // ── Broadcast updated leaderboard after each day ──────────────────────────

    api.on('onDayChange', async () => {
      for (const cat of CATEGORIES) {
        const entries = await getTop(cat);
        api.broadcast('leaderboard:update', { category: cat, entries });
      }
    });

    // ── Serve leaderboard on demand ───────────────────────────────────────────

    api.on('plugin:leaderboard:request', async ({ socket, category }) => {
      const cat = CATEGORIES.includes(category) ? category : 'coins';
      const entries = await getTop(cat);
      api.sendTo(socket.id, 'leaderboard:data', { category: cat, entries });
    });

    api.log('Leaderboard tracking: coins, level, harvest');
  },
};
