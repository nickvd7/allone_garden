import React from 'react';
import { useTranslation } from 'react-i18next';
import { SEEDS } from './ToolsPanel';

// Growth stages per plant type (days to reach each stage)
const GROWTH_STAGES = {
  tomato:    [0, 1, 2, 3],   // seedling → growing → mature → ready
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

// Determine growth stage index based on days planted
function getGrowthStage(plantType, daysPlanted) {
  const stages = GROWTH_STAGES[plantType] || [0];
  const totalDays = stages[stages.length - 1];
  let stage = 0;
  for (let i = 0; i < stages.length; i++) {
    if (daysPlanted >= stages[i]) stage = i;
  }
  return { stage, totalDays, isReady: daysPlanted >= totalDays };
}

// Progress (0–100) toward next stage
function getGrowthProgress(plantType, daysPlanted) {
  const stages = GROWTH_STAGES[plantType] || [0];
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

function Plot({ plot, index, selectedTool, onPlotClick }) {
  const { tilled, planted, plantType, waterLevel, fertilized, daysPlanted, pest } = plot;
  const { stage, isReady } = planted
    ? getGrowthStage(plantType, daysPlanted)
    : { stage: 0, isReady: false };
  const progress = planted ? getGrowthProgress(plantType, daysPlanted) : 0;
  const plantEmoji = planted ? (PLANT_EMOJIS[plantType]?.[stage] || '🌱') : null;

  const stageClass = !planted
    ? ''
    : isReady
      ? 'ready'
      : stage === 0
        ? 'seedling'
        : stage === 1
          ? 'growing'
          : 'mature';

  let plotClass = 'plot';
  if (tilled) plotClass += ' tilled';
  if (waterLevel > 0) plotClass += ' watered';
  if (fertilized) plotClass += ' fertilized';

  return (
    <div
      className={plotClass}
      onClick={() => onPlotClick(index)}
      title={planted ? `${plantType} · day ${daysPlanted}` : tilled ? 'Tilled' : 'Untilled'}
      role="button"
      aria-label={`Plot ${index + 1}`}
    >
      {plantEmoji && (
        <span className={`plant-emoji ${stageClass}`}>{plantEmoji}</span>
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

function Garden({ plots, selectedTool, selectedSeed, currentDay, weather, onUpdateGame }) {
  const { t } = useTranslation();

  const handlePlotClick = (index) => {
    if (!selectedTool) return;

    onUpdateGame((prev) => {
      const updatedPlots = [...prev.plots];
      const plot = { ...updatedPlots[index] };
      let stats = { ...prev.playerStats };
      let inventory = { ...prev.inventory };
      let xpGained = 0;
      let coinsGained = 0;

      switch (selectedTool) {
        case 'till':
          if (!plot.tilled) {
            plot.tilled = true;
            xpGained = 5;
          }
          break;

        case 'plant':
          if (plot.tilled && !plot.planted) {
            plot.planted = true;
            plot.plantType = prev.selectedSeed;
            plot.dayPlanted = prev.currentDay;
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
            xpGained = 5;
            coinsGained = -5; // fertilizer costs coins
          }
          break;

        case 'spray':
          if (plot.pest) {
            plot.pest = false;
            xpGained = 3;
          }
          break;

        case 'harvest': {
          if (plot.planted) {
            const { isReady } = getGrowthStage(plot.plantType, plot.daysPlanted || 0);
            if (isReady) {
              const crop = plot.plantType;
              inventory = { ...inventory, [crop]: (inventory[crop] || 0) + 1 };
              stats = {
                ...stats,
                plantsGrown: stats.plantsGrown + 1,
              };
              // Reset plot
              plot.planted   = false;
              plot.plantType = null;
              plot.waterLevel = 0;
              plot.fertilized = false;
              plot.daysPlanted = 0;
              plot.pest       = false;
              xpGained    = 25;
              coinsGained = CROP_COINS[crop] || 15;
            }
          }
          break;
        }

        default:
          break;
      }

      updatedPlots[index] = plot;

      const newXp = stats.xp + xpGained;
      const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;

      return {
        ...prev,
        plots: updatedPlots,
        inventory,
        playerStats: {
          ...stats,
          xp: newXp,
          level: newLevel,
          coins: Math.max(0, stats.coins + coinsGained),
        },
      };
    });
  };

  // Advance the game by one day
  const handleNextDay = () => {
    // Drought and storm are rare (10% chance each)
    const roll = Math.random();
    const weatherPool =
      roll < 0.10 ? ['storm'] :
      roll < 0.20 ? ['drought'] :
      ['sunny', 'cloudy', 'rainy', 'windy'];
    const nextWeather = weatherPool[Math.floor(Math.random() * weatherPool.length)];

    // Pest spawn probability per planted plot (5% normally, 15% drought)
    const pestChance = nextWeather === 'drought' ? 0.15 : 0.05;

    onUpdateGame((prev) => {
      const updatedPlots = prev.plots.map((plot) => {
        if (!plot.planted) return plot;

        // Pests block growth
        const hasPest = plot.pest || Math.random() < pestChance;

        // Storm can partially damage mature plots (lose 1 growth day)
        let days = plot.daysPlanted || 0;
        if (nextWeather === 'storm') {
          const { isReady } = getGrowthStage(plot.plantType, days);
          if (isReady) days = Math.max(0, days - 1);
        }

        // Growth: pests stop progress, drought needs water to grow
        const extra      = plot.fertilized ? 1 : 0;
        const waterBonus = (plot.waterLevel > 0 || nextWeather === 'rainy' || nextWeather === 'storm') ? 1 : 0;
        const growthDays = hasPest ? days : days + waterBonus + extra;

        // Water: storm fills to 3, drought drains an extra 1, rain fills to 3
        let newWaterLevel = plot.waterLevel || 0;
        if (nextWeather === 'rainy' || nextWeather === 'storm') {
          newWaterLevel = 3;
        } else if (nextWeather === 'drought') {
          newWaterLevel = Math.max(0, newWaterLevel - 2);
        } else {
          newWaterLevel = Math.max(0, newWaterLevel - 1);
        }

        return { ...plot, daysPlanted: growthDays, waterLevel: newWaterLevel, pest: hasPest };
      });

      return {
        ...prev,
        currentDay: prev.currentDay + 1,
        weather: nextWeather,
        plots: updatedPlots,
      };
    });
  };

  const weatherIcon = WEATHER_ICONS[weather] || '🌤️';
  const seedInfo = SEEDS.find((s) => s.id === selectedSeed);

  return (
    <div className="garden-section">
      <div className="garden-header">
        <div className="garden-meta">
          <div className="day-display">📅 {t('day')} {currentDay}</div>
          <div className="weather-display">{weatherIcon} {t(`weather_${weather}`) || weather}</div>
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
            onPlotClick={handlePlotClick}
          />
        ))}
      </div>
    </div>
  );
}

export default Garden;
