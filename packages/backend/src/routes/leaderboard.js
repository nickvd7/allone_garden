/**
 * Leaderboard routes.
 *
 * GET /api/leaderboard              — top players by XP (default)
 * GET /api/leaderboard?by=coins     — sort by coins
 * GET /api/leaderboard?by=plants    — sort by plants grown
 * GET /api/leaderboard?season=spring — only players whose saved garden day falls in that in-game season
 *                                     (28 days per season, 112-day year cycle — matches client core/weather)
 *
 * Public endpoint — no auth required.
 * Results are limited to top 50.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { leaderboardLimiter } = require('../middleware/security');
const { seasonIndexFromDay } = require('../utils/season');

// In-memory fallback store (populated by auth routes on register/login)
const memLeaderboard = {};
/** userId -> current in-game day (for season filter when no DB) */
const memGardenDay = {};

const SEASON_TO_INDEX = {
  spring:  0,
  summer:  1,
  autumn:  2,
  winter:  3,
};

/**
 * Call this from auth.js when a user's stats change (register, login).
 */
function updateMemEntry(user) {
  if (!user?.id) return;
  memLeaderboard[user.id] = {
    id:          user.id,
    username:    user.username,
    level:       user.level       || 1,
    xp:          user.xp          || 0,
    coins:       user.coins        || 100,
    plantsGrown: user.plantsGrown  || 0,
  };
}

/**
 * Track garden day for in-memory leaderboard season filtering.
 */
function updateMemGardenDay(userId, currentDay) {
  if (userId === null || userId === undefined) return;
  memGardenDay[String(userId)] = Math.max(1, Number(currentDay) || 1);
}

const VALID_SORT = new Set(['xp', 'coins', 'plants']);

/** Distinct in-game year cycles that have archived season scores */
router.get('/history/cycles', leaderboardLimiter, async (req, res) => {
  if (!db.isConnected()) return res.json({ cycles: [] });
  try {
    const r = await db.query(
      'SELECT DISTINCT cycle FROM user_season_scores ORDER BY cycle DESC LIMIT 50'
    );
    return res.json({ cycles: r.rows.map((row) => row.cycle) });
  } catch (e) {
    console.error('[leaderboard/history/cycles]', e.message);
    return res.status(500).json({ error: 'Could not load history metadata' });
  }
});

/**
 * Archived top players for a closed season + cycle (from user_season_scores).
 * Query: season=spring|summer|autumn|winter, optional cycle (defaults to latest for that season).
 */
router.get('/history', leaderboardLimiter, async (req, res) => {
  const by = VALID_SORT.has(req.query.by) ? req.query.by : 'xp';
  const s = String(req.query.season || '').toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(SEASON_TO_INDEX, s)) {
    return res.status(400).json({ error: 'season required (spring, summer, autumn, winter)' });
  }
  const seasonIdx = SEASON_TO_INDEX[s];
  if (!db.isConnected()) return res.json([]);

  let cycle =
    req.query.cycle !== undefined && req.query.cycle !== ''
      ? parseInt(req.query.cycle, 10)
      : null;
  if (cycle !== null && (Number.isNaN(cycle) || cycle < 0)) {
    return res.status(400).json({ error: 'Invalid cycle' });
  }

  try {
    if (cycle === null) {
      const maxR = await db.query(
        'SELECT MAX(cycle) AS m FROM user_season_scores WHERE season_index = $1',
        [seasonIdx]
      );
      cycle = maxR.rows[0].m;
      if (cycle === null || cycle === undefined) return res.json([]);
    }

    const result = await db.query(
      `SELECT u.id, u.username, u.level, uss.xp, uss.coins, uss.plants_grown AS "plantsGrown"
       FROM user_season_scores uss
       JOIN users u ON u.id = uss.user_id
       WHERE uss.cycle = $1 AND uss.season_index = $2
       ORDER BY
         CASE $3::text
           WHEN 'xp'     THEN uss.xp
           WHEN 'coins'  THEN uss.coins
           WHEN 'plants' THEN uss.plants_grown
           ELSE uss.xp
         END DESC
       LIMIT 50`,
      [cycle, seasonIdx, by]
    );
    return res.json(result.rows);
  } catch (e) {
    console.error('[leaderboard/history]', e.message);
    return res.status(500).json({ error: 'Could not load season history' });
  }
});

router.get('/', leaderboardLimiter, async (req, res) => {
  const by = VALID_SORT.has(req.query.by) ? req.query.by : 'xp';

  let seasonIdx = null;
  if (
    req.query.season !== undefined &&
    req.query.season !== '' &&
    req.query.season !== 'all'
  ) {
    const s = String(req.query.season).toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(SEASON_TO_INDEX, s)) {
      return res.status(400).json({ error: 'Invalid season — use spring, summer, autumn, or winter' });
    }
    seasonIdx = SEASON_TO_INDEX[s];
  }

  if (db.isConnected()) {
    const result = await db.query(
      `SELECT u.id, u.username, u.level, u.xp, u.coins, u.plants_grown AS "plantsGrown"
       FROM users u
       LEFT JOIN gardens g ON g.user_id = u.id
       WHERE ($2::int IS NULL) OR (
         (((COALESCE(g.current_day, 1) - 1) % 112) / 28) = $2::int
       )
       ORDER BY
         CASE $1::text
           WHEN 'xp'     THEN u.xp
           WHEN 'coins'  THEN u.coins
           WHEN 'plants' THEN u.plants_grown
           ELSE u.xp
         END DESC
       LIMIT 50`,
      [by, seasonIdx]
    );
    return res.json(result.rows);
  }

  // In-memory fallback
  const sortKey = by === 'plants' ? 'plantsGrown' : by;
  let rows = Object.values(memLeaderboard);
  if (seasonIdx !== null) {
    rows = rows.filter((r) => seasonIndexFromDay(memGardenDay[String(r.id)] || 1) === seasonIdx);
  }
  rows = rows
    .sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0))
    .slice(0, 50);

  res.json(rows);
});

module.exports = { router, updateMemEntry, updateMemGardenDay, seasonIndexFromDay };
