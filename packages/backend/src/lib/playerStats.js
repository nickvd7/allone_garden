'use strict';

const db = require('../db');
const { updateMemEntry } = require('../routes/leaderboard');

function levelFromXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}

function sanitizeStats(input) {
  if (!input || typeof input !== 'object') return null;
  const xp = Math.min(10_000_000, Math.max(0, Math.floor(Number(input.xp) || 0)));
  const coins = Math.min(10_000_000, Math.max(0, Math.floor(Number(input.coins) || 0)));
  const plantsGrown = Math.min(500_000, Math.max(0, Math.floor(Number(input.plantsGrown) || 0)));
  return {
    xp,
    coins,
    plantsGrown,
    level: levelFromXp(xp),
  };
}

async function syncPlayerStats(userId, stats, username) {
  const sanitized = sanitizeStats(stats);
  if (!sanitized) return null;

  if (db.isConnected()) {
    await db.query(
      `UPDATE users
       SET xp = $1, coins = $2, plants_grown = $3, level = $4
       WHERE id = $5`,
      [sanitized.xp, sanitized.coins, sanitized.plantsGrown, sanitized.level, userId],
    );
  }

  updateMemEntry({
    id: userId,
    username,
    xp: sanitized.xp,
    coins: sanitized.coins,
    level: sanitized.level,
    plantsGrown: sanitized.plantsGrown,
  });

  return sanitized;
}

async function refreshMemEntryFromDb(userId) {
  if (!db.isConnected()) return;
  const result = await db.query(
    `SELECT id, username, level, xp, coins, plants_grown AS "plantsGrown"
     FROM users WHERE id = $1`,
    [userId],
  );
  if (result?.rows?.[0]) {
    updateMemEntry(result.rows[0]);
  }
}

module.exports = {
  levelFromXp,
  sanitizeStats,
  syncPlayerStats,
  refreshMemEntryFromDb,
};
