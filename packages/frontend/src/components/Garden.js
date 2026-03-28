import React from 'react';
import { useTranslation } from 'react-i18next';
import { SEEDS } from './ToolsPanel';

// Growth stages per plant type (days to reach each stage)
const GROWTH_STAGES = {
  tomato:    [0, 1, 2, 3],
  carrot:    [0, 1, 2],
  lettuce:   [0, 1, 2],
  radish:    [0, 1],
  corn:      [0, 1, 2, 3, 4],
  potato:    [0, 1, 2, 3],
  pumpkin:   [0, 1, 2, 3, 4, 5],
  sunflower: [0, 1, 2],
  blueberry: [0, 1, 2, 3, 4],
};

// Harvest coin value per crop
const CROP_COINS = {
  tomato: 15, carrot: 10, lettuce: 8, radish: 6, corn: 18, potato: 12,
  pumpkin: 28, sunflower: 12, blueberry: 22,
};

// Emoji to show for each growth stage
const PLANT_EMOJIS = {
  tomato:    ['🌱', '🌿', '🍅', '🍅'],
  carrot:    ['🌱', '🌿', '🥕'],
  lettuce:   ['🌱', '🌿', '🥬'],
  radish:    ['🌱', '🌸'],
  corn:      ['🌱', '🌿', '🌾', '🌽', '🌽'],
  potato:    ['🌱', '🌿', '🌿', '🥔'],
  pumpkin:   ['🌱', '🌿', '🌿', '🟠', '🎃', '🎃'],
  sunflower: ['🌱', '🌿', '🌻'],
  blueberry: ['🌱', '🌿', '🌿', '🫐', '🫐'],
};

// ─── Companion Planting ───────────────────────────────────────────────────────
// Positive modifier = these neighbors boost this plant's yield
// Negative modifier = these neighbors reduce this plant's yield
const COMPANIONS = {
  tomato:    { carrot: +0.20, lettuce: +0.10, pumpkin: -0.10 },
  carrot:    { tomato: +0.20, lettuce: +0.15, radish: +0.10 },
  lettuce:   { carrot: +0.15, radish: +0.10, corn: -0.15 },
  radish:    { lettuce: +0.10, carrot: +0.10 },
  corn:      { potato: +0.20, lettuce: -0.15, pumpkin: -0.20 },
  potato:    { corn: +0.20, pumpkin: -0.10 },
  pumpkin:   { sunflower: +0.15, corn: -0.20, potato: -0.10 },
  sunflower: { pumpkin: +0.15, blueberry: +0.10 },
  blueberry: { sunflower: +0.10, carrot: +0.05 },
};

const GRID_W = 6;

/**
 * Returns { modifier, icon } for a plot based on its planted neighbors.
 * modifier > 1 = beneficial companions nearby
 * modifier < 1 = harmful companions nearby
 */
function getCompanionEffect(plots, index) {
  const plot = plots[index];
  if (!plot.planted || !plot.plantType) return { modifier: 1, icon: null };

  const companions = COMPANIONS[plot.plantType] || {};
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
    const effect = companions[nb.plantType];
    if (effect) delta += effect;
  }

  const modifier = Math.max(0.5, 1 + delta);
  const icon =
    delta >  0.04 ? '💚' :
    delta < -0.04 ? '⚠️' :
    null;

  return { modifier, icon };
}

// Determine growth stage index based on days planted
function getGrowthStage(plantType, daysPlanted) {
  const stages   = GROWTH_STAGES[plantType] || [0];
  const totalDays = stages[stages.length - 1];
  let stage = 0;
  for (let i = 0; i < stages.length; i++) {
    if (daysPlanted >= stages[i]) stage = i;
  }
  return { stage, totalDays, isReady: daysPlanted >= totalDays };
}

// Progress (0–100) toward next stage
function getGrowthProgress(plantType, daysPlanted) {
  const stages    = GROWTH_STAGES[plantType] || [0];
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

// ─── Plot component ───────────────────────────────────────────────────────────
function Plot({ plot, index, companionIcon, onPlotClick }) {
  const { tilled, planted, plantType, waterLevel, fertilized, daysPlanted, pest } = plot;
  const { stage, isReady } = planted
    ? getGrowthStage(plantType, daysPlanted)
    : { stage: 0, isReady: false };
  const progress    = planted ? getGrowthProgress(plantType, daysPlanted) : 0;
  const plantEmoji  = planted ? (PLANT_EMOJIS[plantType]?.[stage] || '🌱') : null;

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
function Garden({ plots, selectedTool, selectedSeed, currentDay, weather, structures, onUpdateGame }) {
  const { t } = useTranslation();

  // Pre-compute companion icons for all plots
  const companionIcons = plots.map((_, i) => getCompanionEffect(plots, i).icon);

  const handlePlotClick = (index) => {
    if (!selectedTool) return;

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
            const { isReady } = getGrowthStage(plot.plantType, plot.daysPlanted || 0);
            if (isReady) {
              // Apply companion planting modifier to coins
              const companionResult = getCompanionEffect(updatedPlots, index);
              const crop   = plot.plantType;
              const base   = CROP_COINS[crop] || 15;
              coinsGained  = Math.round(base * companionResult.modifier);

              inventory = { ...inventory, [crop]: (inventory[crop] || 0) + 1 };
              stats     = { ...stats, plantsGrown: stats.plantsGrown + 1 };

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

    const roll = Math.random();
    const weatherPool =
      roll < 0.10 ? ['storm']   :
      roll < 0.20 ? ['drought'] :
      ['sunny', 'cloudy', 'rainy', 'windy'];
    const nextWeather = weatherPool[Math.floor(Math.random() * weatherPool.length)];

    // Greenhouse nullifies storm / drought effects on crops
    const effectiveWeather = hasGreenhouse && (nextWeather === 'storm' || nextWeather === 'drought')
      ? 'cloudy'
      : nextWeather;

    const pestChance = nextWeather === 'drought' ? 0.15 : 0.05;

    onUpdateGame((prev) => {
      const updatedPlots = prev.plots.map((plot) => {
        if (!plot.planted) return plot;

        const hasPest = plot.pest || Math.random() < pestChance;

        let days = plot.daysPlanted || 0;
        // Storm damage only if no greenhouse
        if (effectiveWeather === 'storm') {
          const { isReady } = getGrowthStage(plot.plantType, days);
          if (isReady) days = Math.max(0, days - 1);
        }

        const extra      = plot.fertilized ? 1 : 0;
        const waterBonus = (plot.waterLevel > 0 || effectiveWeather === 'rainy' || effectiveWeather === 'storm') ? 1 : 0;
        const growthDays = hasPest ? days : days + waterBonus + extra;

        let newWaterLevel = plot.waterLevel || 0;
        if (effectiveWeather === 'rainy' || effectiveWeather === 'storm') {
          newWaterLevel = 3;
        } else if (effectiveWeather === 'drought') {
          newWaterLevel = Math.max(0, newWaterLevel - 2);
        } else {
          newWaterLevel = Math.max(0, newWaterLevel - 1);
        }

        return { ...plot, daysPlanted: growthDays, waterLevel: newWaterLevel, pest: hasPest };
      });

      // Refresh well charges daily
      let updatedStructures = prev.structures;
      if (prev.structures?.well?.built) {
        updatedStructures = {
          ...prev.structures,
          well: { ...prev.structures.well, charges: 3 },
        };
      }

      return {
        ...prev,
        currentDay:  prev.currentDay + 1,
        weather:     nextWeather,            // show actual weather in UI
        plots:       updatedPlots,
        structures:  updatedStructures,
      };
    });
  };

  const weatherIcon = WEATHER_ICONS[weather] || '🌤️';
  const seedInfo    = SEEDS.find((s) => s.id === selectedSeed);
  const hasGreenhouse = structures?.greenhouse?.built;

  return (
    <div className="garden-section">
      <div className="garden-header">
        <div className="garden-meta">
          <div className="day-display">📅 {t('day')} {currentDay}</div>
          <div className="weather-display">
            {weatherIcon} {t(`weather_${weather}`) || weather}
            {hasGreenhouse && (weather === 'storm' || weather === 'drought') && (
              <span className="greenhouse-shield" title="Greenhouse is protecting your crops!"> 🏡🛡️</span>
            )}
          </div>
          {selectedTool && (
            <div className="weather-display" style={{ color: '#888', fontWeight: 400 }}>
              Tool: {selectedTool}{selectedTool === 'plant' && seedInfo ? ` · ${seedInfo.emoji}` : ''}
            </div>
          )}
        </div>

        <button className="btn btn-primary" onClick={handleNextDay}>
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
