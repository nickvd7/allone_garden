/**
 * Community plugin: achievements
 *
 * Tracks player milestones and unlocks badge achievements.
 * Achievements are stored in a plugin-namespaced DB table and
 * broadcast to the player's socket when first unlocked.
 *
 * License: MIT
 * Author: AllOne Garden Community
 */

// All achievements in the game
const ACHIEVEMENTS = [
  // Planting milestones
  { id: 'first_plant',    emoji: '🌱', title: 'First Sprout',      desc: 'Plant your first seed',                        condition: (s) => s.plantsPlanted >= 1   },
  { id: 'green_thumb',    emoji: '🌿', title: 'Green Thumb',       desc: 'Plant 10 seeds',                               condition: (s) => s.plantsPlanted >= 10  },
  { id: 'botanist',       emoji: '🌳', title: 'Botanist',          desc: 'Plant 50 seeds',                               condition: (s) => s.plantsPlanted >= 50  },

  // Harvest milestones
  { id: 'first_harvest',  emoji: '🧺', title: 'First Harvest',     desc: 'Harvest your first crop',                      condition: (s) => s.plantsHarvested >= 1  },
  { id: 'bumper_crop',    emoji: '🌽', title: 'Bumper Crop',       desc: 'Harvest 25 crops',                             condition: (s) => s.plantsHarvested >= 25 },
  { id: 'master_farmer',  emoji: '🏆', title: 'Master Farmer',     desc: 'Harvest 100 crops',                            condition: (s) => s.plantsHarvested >= 100},

  // Watering
  { id: 'hydrated',       emoji: '💧', title: 'Hydrated',          desc: 'Water a plot 10 times',                        condition: (s) => s.timesWatered >= 10   },
  { id: 'rain_maker',     emoji: '🌊', title: 'Rain Maker',        desc: 'Water plots 100 times',                        condition: (s) => s.timesWatered >= 100  },

  // Fertilizing
  { id: 'enriched',       emoji: '✨', title: 'Enriched Soil',     desc: 'Fertilize a plot for the first time',           condition: (s) => s.timesFertilized >= 1 },

  // Trading
  { id: 'merchant',       emoji: '🔄', title: 'Merchant',          desc: 'Complete your first trade',                    condition: (s) => s.tradesCompleted >= 1 },
  { id: 'market_master',  emoji: '💰', title: 'Market Master',     desc: 'Complete 10 trades',                           condition: (s) => s.tradesCompleted >= 10},

  // Social
  { id: 'good_neighbour', emoji: '🤝', title: 'Good Neighbour',    desc: 'Help another player',                          condition: (s) => s.playersHelped >= 1   },
  { id: 'explorer',       emoji: '🗺️', title: 'Explorer',          desc: 'Visit another player\'s garden',               condition: (s) => s.gardensVisited >= 1  },

  // Survival
  { id: 'week_1',         emoji: '📅', title: 'One Week',          desc: 'Reach day 7',                                  condition: (s) => s.currentDay >= 7      },
  { id: 'month_1',        emoji: '🌙', title: 'One Month',         desc: 'Reach day 30',                                 condition: (s) => s.currentDay >= 30     },
  { id: 'season_1',       emoji: '🍂', title: 'First Season',      desc: 'Reach day 90',                                 condition: (s) => s.currentDay >= 90     },

  // Coins
  { id: 'piggy_bank',     emoji: '🐷', title: 'Piggy Bank',        desc: 'Accumulate 500 coins',                         condition: (s) => s.coinsEarned >= 500   },
  { id: 'wealthy',        emoji: '💎', title: 'Wealthy Gardener',  desc: 'Accumulate 5 000 coins',                       condition: (s) => s.coinsEarned >= 5000  },

  // Variety
  { id: 'variety',        emoji: '🌈', title: 'Variety is Life',   desc: 'Grow all 6 different plant types',             condition: (s) => s.uniquePlantsGrown >= 6},
];

module.exports = {
  name: 'achievements',
  version: '1.0.0',

  async init(api) {
    api.log('Achievements plugin initialised');

    // Create storage table for player stats and unlocked achievements
    await api.dbCreateTable('stats',
      `user_id       INTEGER PRIMARY KEY,
       plants_planted  INTEGER DEFAULT 0,
       plants_harvested INTEGER DEFAULT 0,
       times_watered   INTEGER DEFAULT 0,
       times_fertilized INTEGER DEFAULT 0,
       trades_completed INTEGER DEFAULT 0,
       players_helped  INTEGER DEFAULT 0,
       gardens_visited INTEGER DEFAULT 0,
       current_day     INTEGER DEFAULT 1,
       coins_earned    INTEGER DEFAULT 0,
       unique_plants   JSONB   DEFAULT '[]'`
    );

    await api.dbCreateTable('unlocked',
      `id          SERIAL PRIMARY KEY,
       user_id     INTEGER NOT NULL,
       achievement_id VARCHAR(50) NOT NULL,
       unlocked_at TIMESTAMP DEFAULT NOW(),
       UNIQUE(user_id, achievement_id)`
    );

    // ── Event listeners ────────────────────────────────────────────────────────

    api.on('onPlant', async ({ userId, plantType }) => {
      if (!userId) return;
      await incrementStat(api, userId, 'plants_planted');
      await addUniquePlant(api, userId, plantType);
      await checkAndUnlock(api, userId);
    });

    api.on('onHarvest', async ({ userId }) => {
      if (!userId) return;
      await incrementStat(api, userId, 'plants_harvested');
      await checkAndUnlock(api, userId);
    });

    api.on('onWater', async ({ userId }) => {
      if (!userId) return;
      await incrementStat(api, userId, 'times_watered');
      await checkAndUnlock(api, userId);
    });

    api.on('onFertilize', async ({ userId }) => {
      if (!userId) return;
      await incrementStat(api, userId, 'times_fertilized');
      await checkAndUnlock(api, userId);
    });

    api.on('onTrade', async ({ userId }) => {
      if (!userId) return;
      await incrementStat(api, userId, 'trades_completed');
      await checkAndUnlock(api, userId);
    });

    api.on('onHelp', async ({ userId }) => {
      if (!userId) return;
      await incrementStat(api, userId, 'players_helped');
      await checkAndUnlock(api, userId);
    });

    api.on('onVisit', async ({ userId }) => {
      if (!userId) return;
      await incrementStat(api, userId, 'gardens_visited');
      await checkAndUnlock(api, userId);
    });

    api.on('onDayChange', async ({ userId, currentDay }) => {
      if (!userId) return;
      await setStat(api, userId, 'current_day', currentDay);
      await checkAndUnlock(api, userId);
    });

    api.on('onCoinsEarned', async ({ userId, amount }) => {
      if (!userId) return;
      await incrementStat(api, userId, 'coins_earned', amount);
      await checkAndUnlock(api, userId);
    });

    // Allow clients to request their achievement list
    api.on('plugin:achievements:request', async ({ socket, userId }) => {
      if (!userId) return;
      const list = await getUnlocked(api, userId);
      api.sendTo(socket.id, 'achievements:data', { achievements: list });
    });

    api.log(`Loaded ${ACHIEVEMENTS.length} achievement definitions`);
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ensureStats(api, userId) {
  await api.dbQuery('stats',
    `INSERT INTO {{table}} (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [userId]
  );
}

async function incrementStat(api, userId, column, amount = 1) {
  await ensureStats(api, userId);
  await api.dbQuery('stats',
    `UPDATE {{table}} SET ${column} = ${column} + $1 WHERE user_id = $2`,
    [amount, userId]
  );
}

async function setStat(api, userId, column, value) {
  await ensureStats(api, userId);
  await api.dbQuery('stats',
    `UPDATE {{table}} SET ${column} = $1 WHERE user_id = $2`,
    [value, userId]
  );
}

async function addUniquePlant(api, userId, plantType) {
  if (!plantType) return;
  await ensureStats(api, userId);
  const result = await api.dbQuery('stats',
    `SELECT unique_plants FROM {{table}} WHERE user_id = $1`,
    [userId]
  );
  if (!result?.rows[0]) return;
  const plants = result.rows[0].unique_plants || [];
  if (!plants.includes(plantType)) {
    plants.push(plantType);
    await api.dbQuery('stats',
      `UPDATE {{table}} SET unique_plants = $1::jsonb WHERE user_id = $2`,
      [JSON.stringify(plants), userId]
    );
  }
}

async function getStats(api, userId) {
  const result = await api.dbQuery('stats',
    `SELECT * FROM {{table}} WHERE user_id = $1`,
    [userId]
  );
  if (!result?.rows[0]) return null;
  const r = result.rows[0];
  return {
    plantsPlanted:    r.plants_planted,
    plantsHarvested:  r.plants_harvested,
    timesWatered:     r.times_watered,
    timesFertilized:  r.times_fertilized,
    tradesCompleted:  r.trades_completed,
    playersHelped:    r.players_helped,
    gardensVisited:   r.gardens_visited,
    currentDay:       r.current_day,
    coinsEarned:      r.coins_earned,
    uniquePlantsGrown: (r.unique_plants || []).length,
  };
}

async function getUnlocked(api, userId) {
  const result = await api.dbQuery('unlocked',
    `SELECT achievement_id, unlocked_at FROM {{table}} WHERE user_id = $1`,
    [userId]
  );
  return result?.rows || [];
}

async function checkAndUnlock(api, userId) {
  const stats = await getStats(api, userId);
  if (!stats) return;

  const alreadyUnlocked = new Set(
    (await getUnlocked(api, userId)).map((r) => r.achievement_id)
  );

  for (const ach of ACHIEVEMENTS) {
    if (alreadyUnlocked.has(ach.id)) continue;
    if (!ach.condition(stats)) continue;

    // Unlock it
    await api.dbQuery('unlocked',
      `INSERT INTO {{table}} (user_id, achievement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, ach.id]
    );

    // Notify the player in real-time
    api.broadcast('achievements:unlocked', {
      userId,
      achievement: { id: ach.id, emoji: ach.emoji, title: ach.title, desc: ach.desc },
    });

    api.log(`🏆 User ${userId} unlocked: "${ach.title}"`);
  }
}
