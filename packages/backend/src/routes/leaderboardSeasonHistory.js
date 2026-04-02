/**
 * Persisted leaderboard snapshots when players cross in-game season boundaries (see utils/season.js).
 */
const db = require('../db');
const { seasonBoundariesCrossed } = require('../utils/season');

async function recordSeasonScoresOnGardenSave(userId, oldDay, newDay) {
  if (!db.isConnected()) return;
  const boundaries = seasonBoundariesCrossed(oldDay, newDay);
  if (!boundaries.length) return;

  const u = await db.query(
    'SELECT xp, coins, plants_grown FROM users WHERE id = $1',
    [userId]
  );
  if (!u.rows.length) return;
  const { xp, coins, plants_grown } = u.rows[0];

  for (const { cycle, season_index } of boundaries) {
    await db.query(
      `INSERT INTO user_season_scores (user_id, cycle, season_index, xp, coins, plants_grown, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id, cycle, season_index)
       DO UPDATE SET xp = EXCLUDED.xp, coins = EXCLUDED.coins, plants_grown = EXCLUDED.plants_grown, recorded_at = NOW()`,
      [userId, cycle, season_index, xp, coins, plants_grown]
    );
  }
}

module.exports = { recordSeasonScoresOnGardenSave };
