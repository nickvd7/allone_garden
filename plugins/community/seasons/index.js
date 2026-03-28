/**
 * Community plugin: seasons
 *
 * Divides the in-game year into four seasons (each 28 days).
 * Each season boosts a different set of crops and adjusts weather probabilities.
 *
 * Season calendar (cycles every 112 days):
 *   Days  1–28  → 🌸 Spring  (bonus: carrot, lettuce, radish)
 *   Days 29–56  → ☀️ Summer  (bonus: tomato, corn)
 *   Days 57–84  → 🍂 Autumn  (bonus: potato, corn, pumpkin)
 *   Days 85–112 → ❄️ Winter  (penalty on all, greenhouse bonus)
 *
 * Broadcast events:
 *   plugin:seasons:update   { season, day, daysLeft, bonusCrops, penaltyCrops }
 *
 * Socket request:
 *   plugin:seasons:request {}  → plugin:seasons:data  { season, ... }
 *
 * License: MIT
 * Author: AllOne Garden Community
 */

const SEASON_LENGTH = 28;  // in-game days per season

const SEASONS = [
  {
    name:         'Spring',
    emoji:        '🌸',
    bonusCrops:   ['carrot', 'lettuce', 'radish', 'sunflower'],
    penaltyCrops: [],
    yieldMult:    1.25,
    description:  'Mild weather — root vegetables, greens, and sunflowers thrive.',
  },
  {
    name:         'Summer',
    emoji:        '☀️',
    bonusCrops:   ['tomato', 'corn', 'blueberry'],
    penaltyCrops: ['lettuce'],  // lettuce bolts in heat
    yieldMult:    1.35,
    description:  'Hot and sunny — perfect for tomatoes, corn, and blueberries.',
  },
  {
    name:         'Autumn',
    emoji:        '🍂',
    bonusCrops:   ['potato', 'corn', 'pumpkin'],
    penaltyCrops: ['blueberry'],
    yieldMult:    1.20,
    description:  'Harvest season — starchy crops and pumpkins reach peak yield.',
  },
  {
    name:         'Winter',
    emoji:        '❄️',
    bonusCrops:   [],
    penaltyCrops: ['tomato', 'corn', 'lettuce', 'radish', 'sunflower', 'blueberry'],
    yieldMult:    0.75,
    description:  'Frost reduces most yields. Potatoes and pumpkins survive best.',
  },
];

function getSeasonForDay(day) {
  const cycleDay   = ((day - 1) % (SEASON_LENGTH * SEASONS.length)) + 1;
  const index      = Math.floor((cycleDay - 1) / SEASON_LENGTH);
  const dayInSeason = ((cycleDay - 1) % SEASON_LENGTH) + 1;
  const daysLeft   = SEASON_LENGTH - dayInSeason + 1;
  return { ...SEASONS[index], index, dayInSeason, daysLeft };
}

module.exports = {
  name:    'seasons',
  version: '1.0.0',

  init(api) {
    api.log('Seasons plugin initialised');

    let currentSeason = null;

    function buildPayload(day) {
      const s = getSeasonForDay(day);
      return {
        season:       s.name,
        emoji:        s.emoji,
        description:  s.description,
        day,
        dayInSeason:  s.dayInSeason,
        daysLeft:     s.daysLeft,
        bonusCrops:   s.bonusCrops,
        penaltyCrops: s.penaltyCrops,
        yieldMult:    s.yieldMult,
      };
    }

    // ── Day change: check for season transition ───────────────────────────────

    api.on('onDayChange', ({ currentDay }) => {
      const payload    = buildPayload(currentDay);
      const newSeason  = payload.season;
      const changed    = newSeason !== currentSeason;

      currentSeason = newSeason;

      // Always broadcast current season info each day
      api.broadcast('seasons:update', { ...payload, seasonChanged: changed });

      if (changed) {
        api.log(`Season changed → ${payload.emoji} ${newSeason} (day ${currentDay})`);
      }
    });

    // ── Serve current season on demand ────────────────────────────────────────

    api.on('plugin:seasons:request', ({ socket, currentDay }) => {
      const day = currentDay || 1;
      api.sendTo(socket.id, 'seasons:data', buildPayload(day));
    });

    // ── Modify yield on harvest ───────────────────────────────────────────────
    // Emits a suggestion; the core engine may or may not act on it.

    api.on('onHarvest', ({ socket, userId, cropType, baseYield, currentDay }) => {
      if (!userId || !cropType || !currentDay) return;
      const s = getSeasonForDay(currentDay);

      let mult = 1.0;
      if (s.bonusCrops.includes(cropType))   mult = s.yieldMult;
      if (s.penaltyCrops.includes(cropType)) mult = Math.min(mult, 0.75);

      if (mult !== 1.0 && socket) {
        api.sendTo(socket.id, 'seasons:yield-hint', {
          cropType,
          season:    s.name,
          yieldMult: mult,
          message:   mult > 1
            ? `${s.emoji} ${cropType} thrives in ${s.name}! +${Math.round((mult - 1) * 100)}% yield`
            : `${s.emoji} ${cropType} struggles in ${s.name}. ${Math.round((1 - mult) * 100)}% yield penalty`,
        });
      }
    });

    api.log(`Season at day 1: ${getSeasonForDay(1).emoji} ${getSeasonForDay(1).name}`);
  },
};
