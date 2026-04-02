import React from 'react';
import { useTranslation } from 'react-i18next';
import { SEEDS } from './ToolsPanel';
import { useGameContent } from '../context/GameContentContext';
import { useAnalytics } from '../hooks/useAnalytics';
import { useSteamAchievements } from '../hooks/useSteamAchievements';

const GRID_W = 6;

/**
 * Returns { modifier, icon } for a plot based on its planted neighbors.
 * modifier > 1 = beneficial companions nearby
 * modifier < 1 = harmful companions nearby
 * @param {object[]} plots
 * @param {number}   index
 * @param {object}   companions  — slug → { neighborSlug: modifier } map from context
 */
function getCompanionEffect(plots, index, companions = {}) {
  const plot = plots[index];
  if (!plot.planted || !plot.plantType) return { modifier: 1, icon: null };

  const companionRow = companions[plot.plantType] || {};
  const neighbors = [
    index - GRID_W,                                           // above
    index + GRID_W,                                           // below
    index % GRID_W !== 0           ? index - 1 : -1,         // left (no wrap)
    index % GRID_W !== GRID_W - 1  ? index + 1 : -1,         // right (no wrap)
  ].filter((n) => n >= 0 && n < plots.length);

  let delta = 0;
  for (const ni of neighbors) {
    const nb = plots[ni];
    if (!nb.planted || !nb.plantType) continue;
    const effect = companionRow[nb.plantType];
    if (effect) delta += effect;
  }

  const modifier = Math.max(0.5, 1 + delta);
  const icon =
    delta >  0.04 ? '💚' :
    delta < -0.04 ? '⚠️' :
    null;

  return { modifier, icon };
}

/**
 * Determine growth stage index based on days planted.
 * @param {string}   plantType
 * @param {number}   daysPlanted
 * @param {object}   growthStages — slug → [0,1,…,growthDays] from context
 */
function getGrowthStage(plantType, daysPlanted, growthStages = {}) {
  const stages    = growthStages[plantType] || [0];
  const totalDays = stages[stages.length - 1];
  let stage = 0;
  for (let i = 0; i < stages.length; i++) {
    if (daysPlanted >= stages[i]) stage = i;
  }
  return { stage, totalDays, isReady: daysPlanted >= totalDays };
}

/** Progress (0–100) toward next stage */
function getGrowthProgress(plantType, daysPlanted, growthStages = {}) {
  const stages    = growthStages[plantType] || [0];
  const totalDays = stages[stages.length - 1];
  return totalDays > 0 ? Math.min((daysPlanted / totalDays) * 100, 100) : 100;
}

// Weather labels and emoji
const WEATHER_ICONS = {
  sunny:   '☀️',
  cloudy:  '☁️',
  rainy:   '🌧️',
  windy:   '💨',
  storm:   '⛈️',
  drought: '🏜️',
};

// ── Season system ─────────────────────────────────────────────────────────────
const SEASON_LENGTH = 30; // in-game days per season

const SEASONS = [
  { id: 'spring', emoji: '🌸', label: 'Spring' },
  { id: 'summer', emoji: '☀️', label: 'Summer' },
  { id: 'autumn', emoji: '🍂', label: 'Autumn' },
  { id: 'winter', emoji: '❄️', label: 'Winter' },
];

/**
 * Derive current season from the in-game day number.
 * Day 1–30 = spring, 31–60 = summer, 61–90 = autumn, 91–120 = winter, then repeat.
 */
function getSeasonFromDay(day) {
  const index = Math.floor(((day - 1) % (SEASON_LENGTH * 4)) / SEASON_LENGTH);
  return SEASONS[index] ?? SEASONS[0];
}

/**
 * Per-season weather probability table.
 * Returns a roll → weather function.
 */
function rollWeather(season, roll) {
  switch (season.id) {
    case 'spring': // mild: lots of rain, low drought
      return roll < 0.05 ? 'storm'   :
             roll < 0.08 ? 'drought' :
             ['sunny', 'cloudy', 'rainy', 'rainy', 'windy'][Math.floor(Math.random() * 5)];
    case 'summer': // hot: more drought + sunny, rare storm
      return roll < 0.06 ? 'storm'   :
             roll < 0.25 ? 'drought' :
             ['sunny', 'sunny', 'cloudy', 'windy'][Math.floor(Math.random() * 4)];
    case 'autumn': // mixed: balanced
      return roll < 0.10 ? 'storm'   :
             roll < 0.15 ? 'drought' :
             ['sunny', 'cloudy', 'rainy', 'windy'][Math.floor(Math.random() * 4)];
    case 'winter': // harsh: more storms, less drought
      return roll < 0.20 ? 'storm'   :
             roll < 0.22 ? 'drought' :
             ['cloudy', 'cloudy', 'rainy', 'windy'][Math.floor(Math.random() * 4)];
    default:
      return ['sunny', 'cloudy', 'rainy', 'windy'][Math.floor(Math.random() * 4)];
  }
}

/**
 * Per-season growth bonus for a given plant type.
 * Tomatoes + corn love summer; root vegetables love autumn; all slow in winter.
 */
function getSeasonalGrowthBonus(plantType, seasonId) {
  const SUMMER_CROPS  = new Set(['tomato', 'corn', 'sunflower', 'blueberry']);
  const AUTUMN_CROPS  = new Set(['potato', 'carrot', 'pumpkin', 'radish']);
  const SPRING_CROPS  = new Set(['lettuce', 'radish', 'carrot']);

  if (seasonId === 'summer' && SUMMER_CROPS.has(plantType))  return 1;  // +1 day/turn
  if (seasonId === 'autumn' && AUTUMN_CROPS.has(plantType))  return 1;
  if (seasonId === 'spring' && SPRING_CROPS.has(plantType))  return 1;
  if (seasonId === 'winter')                                  return -1; // –1 day/turn (slow)
  return 0;
}

// ─── Plot component ───────────────────────────────────────────────────────────
function Plot({ plot, index, companionIcon, onPlotClick, growthStages, plantEmojis }) {
  const { tilled, planted, plantType, waterLevel, fertilized, daysPlanted, pest } = plot;
  const { stage, isReady } = planted
    ? getGrowthStage(plantType, daysPlanted, growthStages)
    : { stage: 0, isReady: false };
  const progress    = planted ? getGrowthProgress(plantType, daysPlanted, growthStages) : 0;
  const plantEmoji  = planted ? (plantEmojis[plantType]?.[stage] || '🌱') : null;

  const stageClass  = !planted
    ? ''
    : isReady  ? 'ready'
    : stage === 0 ? 'seedling'
    : stage === 1 ? 'growing'
    : 'mature';

  let plotClass = 'plot';
  if (tilled) plotClass += ' tilled';
  if (waterLevel > 0) plotClass += ' watered';
  if (fertilized) plotClass += ' fertilized';

  const companionLabel = companionIcon === '💚'
    ? 'Beneficial companions nearby — bonus yield!'
    : companionIcon === '⚠️'
      ? 'Hostile companions nearby — reduced yield'
      : '';

  return (
    <div
      className={plotClass}
      onClick={() => onPlotClick(index)}
      title={
        planted
          ? `${plantType} · day ${daysPlanted}${companionLabel ? '\n' + companionLabel : ''}`
          : tilled ? 'Tilled' : 'Untilled'
      }
      role="button"
      aria-label={`Plot ${index + 1}`}
    >
      {plantEmoji && (
        <span className={`plant-emoji ${stageClass}`}>{plantEmoji}</span>
      )}

      {/* Companion indicator */}
      {companionIcon && (
        <div className="companion-indicator" title={companionLabel}>
          {companionIcon}
        </div>
      )}

      {pest && (
        <div className="pest-indicator" title="Pests! Use 🧴 Spray to remove">🐛</div>
      )}

      {waterLevel > 0 && (
        <div className="water-indicator">
          {'💧'.repeat(Math.min(waterLevel, 3))}
        </div>
      )}

      {planted && (
        <div className="growth-bar">
          <div
            className="growth-bar-fill"
            style={{ width: `${progress}%`, background: pest ? '#e57373' : undefined }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Garden component ─────────────────────────────────────────────────────────
function Garden({ plots, selectedTool, selectedSeed, currentDay, weather, currentSeason, structures, onUpdateGame }) {
  const { t } = useTranslation();
  // Dynamic game content (plants, structures, tools) — updates when admin saves custom content
  const { plants: contentPlants, growthStages, cropCoins, plantEmojis, companions } = useGameContent();
  const { track }  = useAnalytics();
  const { unlock } = useSteamAchievements();

  // Pre-compute companion icons for all plots
  const companionIcons = plots.map((_, i) => getCompanionEffect(plots, i, companions).icon);

  const handlePlotClick = (index) => {
    if (!selectedTool) return;

    // Track intent before state update (optimistic — check preconditions on current plots)
    const clickedPlot = plots[index];
    if (selectedTool === 'plant' && clickedPlot?.tilled && !clickedPlot?.planted && selectedSeed) {
      track('crop_planted', { cropType: selectedSeed, season: weather });
    } else if (selectedTool === 'harvest' && clickedPlot?.planted) {
      const { isReady } = getGrowthStage(clickedPlot.plantType, clickedPlot.daysPlanted || 0, growthStages);
      if (isReady) {
        track('crop_harvested', { cropType: clickedPlot.plantType });
        // Steam: first-ever harvest
        unlock('FIRST_HARVEST');
      }
    }

    onUpdateGame((prev) => {
      const updatedPlots = [...prev.plots];
      const plot         = { ...updatedPlots[index] };
      let stats          = { ...prev.playerStats };
      let inventory      = { ...prev.inventory };
      let updatedStructures = prev.structures ? { ...prev.structures } : undefined;
      let xpGained     = 0;
      let coinsGained  = 0;

      switch (selectedTool) {
        case 'till':
          if (!plot.tilled) {
            plot.tilled = true;
            xpGained = 5;
          }
          break;

        case 'plant':
          if (plot.tilled && !plot.planted) {
            plot.planted     = true;
            plot.plantType   = prev.selectedSeed;
            plot.dayPlanted  = prev.currentDay;
            plot.daysPlanted = 0;
            xpGained = 10;
          }
          break;

        case 'water':
          if (plot.tilled && plot.waterLevel < 3) {
            plot.waterLevel = Math.min(plot.waterLevel + 1, 3);
            xpGained = 2;
          }
          break;

        case 'fertilize':
          if (plot.tilled && !plot.fertilized) {
            plot.fertilized = true;
            xpGained    = 5;
            coinsGained = -5; // standard fertilizer costs coins
          }
          break;

        case 'spray':
          if (plot.pest) {
            plot.pest = false;
            xpGained  = 3;
          }
          break;

        case 'harvest': {
          if (plot.planted) {
            const { isReady } = getGrowthStage(plot.plantType, plot.daysPlanted || 0, growthStages);
            if (isReady) {
              // Apply companion planting modifier to coins
              const companionResult = getCompanionEffect(updatedPlots, index, companions);
              const crop   = plot.plantType;
              const base   = cropCoins[crop] || 15;
              coinsGained  = Math.round(base * companionResult.modifier);

              inventory = { ...inventory, [crop]: (inventory[crop] || 0) + 1 };
              stats     = { ...stats, plantsGrown: stats.plantsGrown + 1 };

              // Steam milestone achievements (idempotent — Steam ignores re-unlocks)
              const newTotal = stats.plantsGrown; // already incremented above
              if (newTotal >= 10)  unlock('GREEN_THUMB');
              if (newTotal >= 50)  unlock('SEASONED_FARMER');
              if (newTotal >= 100) unlock('MASTER_GARDENER');

              // Track compost progress
              if (updatedStructures?.compost?.built) {
                const comp      = updatedStructures.compost;
                const remaining = (comp.harvestsUntilNext ?? 3) - 1;
                const newCharge = remaining <= 0 ? 1 : 0;
                updatedStructures = {
                  ...updatedStructures,
                  compost: {
                    ...comp,
                    harvestsUntilNext: remaining <= 0 ? 3 : remaining,
                    charges: (comp.charges || 0) + newCharge,
                  },
                };
              }

              // Reset plot
              plot.planted     = false;
              plot.plantType   = null;
              plot.waterLevel  = 0;
              plot.fertilized  = false;
              plot.daysPlanted = 0;
              plot.pest        = false;
              xpGained         = 25;
            }
          }
          break;
        }

        default:
          break;
      }

      updatedPlots[index] = plot;

      const newXp    = stats.xp + xpGained;
      const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;

      // Steam level achievements
      if (newLevel >= 5  && stats.level < 5)  unlock('LEVEL_5');
      if (newLevel >= 10 && stats.level < 10) unlock('LEVEL_10');

      return {
        ...prev,
        plots: updatedPlots,
        inventory,
        structures: updatedStructures,
        playerStats: {
          ...stats,
          xp:     newXp,
          level:  newLevel,
          coins:  Math.max(0, stats.coins + coinsGained),
        },
      };
    });
  };

  // Advance the game by one day
  const handleNextDay = () => {
    const hasGreenhouse = structures?.greenhouse?.built;

    // Determine the next day's season (based on current day + 1)
    const nextDay    = (currentDay || 1) + 1;
    const nextSeason = getSeasonFromDay(nextDay);

    const nextWeather = rollWeather(nextSeason, Math.random());

    // Greenhouse nullifies storm / drought effects on crops
    const effectiveWeather = hasGreenhouse && (nextWeather === 'storm' || nextWeather === 'drought')
      ? 'cloudy'
      : nextWeather;

    // Drought pest chance is higher; winter also raises it slightly
    const pestChance =
      nextWeather === 'drought' ? 0.15 :
      nextSeason.id === 'winter' ? 0.08 : 0.05;

    onUpdateGame((prev) => {
      const updatedPlots = prev.plots.map((plot) => {
        if (!plot.planted) return plot;

        const hasPest = plot.pest || Math.random() < pestChance;

        let days = plot.daysPlanted || 0;
        // Storm damage only if no greenhouse
        if (effectiveWeather === 'storm') {
          const { isReady } = getGrowthStage(plot.plantType, days, growthStages);
          if (isReady) days = Math.max(0, days - 1);
        }

        const extra          = plot.fertilized ? 1 : 0;
        const waterBonus     = (plot.waterLevel > 0 || effectiveWeather === 'rainy' || effectiveWeather === 'storm') ? 1 : 0;
        const seasonalBonus  = getSeasonalGrowthBonus(plot.plantType, nextSeason.id);
        const rawGrowth      = waterBonus + extra + seasonalBonus;
        // Growth cannot go negative in a single turn (minimum 0 progress added)
        const growthDays     = hasPest ? days : Math.max(days, days + rawGrowth);

        let newWaterLevel = plot.waterLevel || 0;
        if (effectiveWeather === 'rainy' || effectiveWeather === 'storm') {
          newWaterLevel = 3;
        } else if (effectiveWeather === 'drought') {
          newWaterLevel = Math.max(0, newWaterLevel - 2);
        } else if (nextSeason.id === 'winter') {
          newWaterLevel = Math.max(0, newWaterLevel - 1); // snow keeps some moisture
        } else {
          newWaterLevel = Math.max(0, newWaterLevel - 1);
        }

        return { ...plot, daysPlanted: growthDays, waterLevel: newWaterLevel, pest: hasPest };
      });

      // Refresh well charges daily + advance farm animal timers
      const updatedStructures = { ...prev.structures };

      if (updatedStructures.well?.built) {
        updatedStructures.well = { ...updatedStructures.well, charges: 3 };
      }

      // Chicken Coop: produce an egg every 2 days
      if (updatedStructures.chickenCoop?.built) {
        const coop          = updatedStructures.chickenCoop;
        const newDays       = (coop.daysSinceEgg || 0) + 1;
        const eggNowReady   = newDays >= 2;
        updatedStructures.chickenCoop = {
          ...coop,
          daysSinceEgg: eggNowReady ? 0 : newDays,
          eggReady:     coop.eggReady || eggNowReady,
        };
      }

      // Stable: produce milk every 3 days
      if (updatedStructures.stable?.built) {
        const stable         = updatedStructures.stable;
        const newDays        = (stable.daysSinceMilk || 0) + 1;
        const milkNowReady   = newDays >= 3;
        updatedStructures.stable = {
          ...stable,
          daysSinceMilk: milkNowReady ? 0 : newDays,
          milkReady:     stable.milkReady || milkNowReady,
        };
      }

      return {
        ...prev,
        currentDay:    nextDay,
        currentSeason: nextSeason.id,
        weather:       nextWeather,
        plots:         updatedPlots,
        structures:    updatedStructures,
      };
    });
  };

  const weatherIcon = WEATHER_ICONS[weather] || '🌤️';
  // Find seed display info — static SEEDS has i18n keys; fall back to context for custom plants
  const contextSeedPlant = contentPlants.find((p) => p.slug === selectedSeed);
  const seedInfo = SEEDS.find((s) => s.id === selectedSeed)
    || (contextSeedPlant ? { emoji: contextSeedPlant.harvestEmoji } : null);
  const hasGreenhouse = structures?.greenhouse?.built;

  // Derive current season from the day counter (fall back to prop if set)
  const season     = currentSeason
    ? SEASONS.find((s) => s.id === currentSeason) ?? getSeasonFromDay(currentDay)
    : getSeasonFromDay(currentDay);
  const dayInSeason = ((currentDay - 1) % SEASON_LENGTH) + 1;

  return (
    <div className="card garden-section">
      <div className="garden-header">
        <div className="garden-meta">
          <div className="day-display">
            📅 {t('day')} {currentDay}
            <span
              className={`season-badge season-badge--${season.id}`}
              title={`${season.label} — day ${dayInSeason} of ${SEASON_LENGTH}`}
            >
              {season.emoji} {season.label}
            </span>
          </div>
          <div className="weather-display">
            {weatherIcon} {t(`weather_${weather}`) || weather}
            {hasGreenhouse && (weather === 'storm' || weather === 'drought') && (
              <span className="greenhouse-shield" title="Greenhouse is protecting your crops!"> 🏡🛡️</span>
            )}
          </div>
          {selectedTool && (
            <div className="weather-display weather-display--muted">
              Tool: {selectedTool}{selectedTool === 'plant' && seedInfo ? ` · ${seedInfo.emoji}` : ''}
            </div>
          )}
        </div>

        <button type="button" className="btn btn-primary" onClick={handleNextDay}>
          ⏭ Next Day
        </button>
      </div>

      <div className="garden-grid">
        {plots.map((plot, i) => (
          <Plot
            key={i}
            index={i}
            plot={plot}
            selectedTool={selectedTool}
            companionIcon={companionIcons[i]}
            onPlotClick={handlePlotClick}
            growthStages={growthStages}
            plantEmojis={plantEmojis}
          />
        ))}
      </div>

      {/* Companion planting legend */}
      {plots.some((p) => p.planted) && (
        <div className="companion-legend">
          <span title="Beneficial companions — bonus yield">💚 good neighbors</span>
          <span title="Harmful companions — reduced yield">⚠️ bad neighbors</span>
        </div>
      )}
    </div>
  );
}

export default Garden;
