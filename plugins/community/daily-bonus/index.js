/**
 * Community plugin: daily-bonus
 *
 * Awards every player a small bonus of coins and XP the first time they
 * connect on each in-game day.  Bonuses scale with the player's current
 * level and the in-game day number.
 *
 * License: MIT
 * Author: AllOne Garden Community
 */

// Bonus formula: base * ceil(level / 5)
const BASE_COINS = 25;
const BASE_XP    = 15;

// Streak multiplier: each consecutive day adds 10 %, capped at 3×
const MAX_STREAK_MULT = 3.0;

module.exports = {
  name:    'daily-bonus',
  version: '1.0.0',

  async init(api) {
    api.log('Daily-bonus plugin initialised');

    // Track who already claimed today's bonus
    // Stored as plugin_daily-bonus_claims(user_id, game_day, streak)
    await api.dbCreateTable('claims',
      `user_id  INTEGER NOT NULL,
       game_day INTEGER NOT NULL,
       streak   INTEGER DEFAULT 1,
       claimed_at TIMESTAMP DEFAULT NOW(),
       PRIMARY KEY (user_id, game_day)`
    );

    // ── On player join, check if they can claim a bonus ───────────────────────
    api.on('onPlayerJoin', async ({ userId, level, currentDay }) => {
      if (!userId || !currentDay) return;

      // Has this user already claimed today?
      const existing = await api.dbQuery('claims',
        `SELECT streak FROM {{table}} WHERE user_id = $1 AND game_day = $2`,
        [userId, currentDay]
      );
      if (existing?.rows?.length > 0) return; // already claimed

      // Look up yesterday's claim to calculate streak
      const yesterday = await api.dbQuery('claims',
        `SELECT streak FROM {{table}} WHERE user_id = $1 AND game_day = $2`,
        [userId, currentDay - 1]
      );
      const prevStreak = yesterday?.rows[0]?.streak || 0;
      const streak     = prevStreak + 1;

      // Persist claim
      await api.dbQuery('claims',
        `INSERT INTO {{table}} (user_id, game_day, streak) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [userId, currentDay, streak]
      );

      // Calculate reward
      const levelTier  = Math.ceil((level || 1) / 5);
      const streakMult = Math.min(1 + (streak - 1) * 0.1, MAX_STREAK_MULT);
      const coins      = Math.round(BASE_COINS * levelTier * streakMult);
      const xp         = Math.round(BASE_XP    * levelTier * streakMult);

      // Broadcast reward to the player
      api.broadcast('daily-bonus:awarded', {
        userId,
        coins,
        xp,
        streak,
        day: currentDay,
        message: streak >= 7
          ? `🔥 ${streak}-day streak! Daily bonus: +${coins} 🪙 +${xp} XP`
          : `🌅 Daily bonus: +${coins} 🪙 +${xp} XP${streak > 1 ? ` (${streak}-day streak)` : ''}`,
      });

      api.log(`User ${userId} claimed day-${currentDay} bonus: ${coins} coins, ${xp} XP (streak ${streak})`);
    });

    // ── Allow client to query bonus status ────────────────────────────────────
    api.on('plugin:daily-bonus:status', async ({ socket, userId, currentDay }) => {
      if (!userId || !currentDay) return;
      const claim = await api.dbQuery('claims',
        `SELECT streak, claimed_at FROM {{table}} WHERE user_id = $1 AND game_day = $2`,
        [userId, currentDay]
      );
      api.sendTo(socket.id, 'daily-bonus:status', {
        claimed:    !!claim?.rows?.length,
        streak:     claim?.rows[0]?.streak || 0,
        claimedAt:  claim?.rows[0]?.claimed_at || null,
      });
    });
  },
};
