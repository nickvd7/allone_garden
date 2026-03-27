/**
 * Leaderboard routes.
 *
 * GET /api/leaderboard         — top players by XP (default)
 * GET /api/leaderboard?by=coins  — sort by coins
 * GET /api/leaderboard?by=plants — sort by plants grown
 *
 * Public endpoint — no auth required.
 * Results are limited to top 50 and rounded to avoid info leakage.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db');

// In-memory fallback store (populated by auth routes on register/login)
const memLeaderboard = {};

/**
 * Call this from auth.js when a user's stats change (register, login).
 * Keeps the in-memory leaderboard up-to-date without a DB.
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

const VALID_SORT = new Set(['xp', 'coins', 'plants']);

router.get('/', async (req, res) => {
  const by = VALID_SORT.has(req.query.by) ? req.query.by : 'xp';

  if (db.isConnected()) {
    const colMap = { xp: 'xp', coins: 'coins', plants: 'plants_grown' };
    const col    = colMap[by];

    const result = await db.query(
      `SELECT id, username, level, xp, coins, plants_grown AS "plantsGrown"
       FROM users
       ORDER BY ${col} DESC
       LIMIT 50`
    );
    return res.json(result.rows);
  }

  // In-memory fallback
  const sortKey = by === 'plants' ? 'plantsGrown' : by;
  const rows = Object.values(memLeaderboard)
    .sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0))
    .slice(0, 50);

  res.json(rows);
});

module.exports = { router, updateMemEntry };
