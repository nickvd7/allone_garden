/**
 * @allone-garden/core — Growth calculations
 *
 * Pure functions for crop growth, stage lookup, and harvest readiness.
 * No side effects, no framework dependencies.
 *
 * MIT License
 */

'use strict';

const { getPlant } = require('./plants');

/**
 * Return the current growth stage index and whether the crop is ready to harvest.
 *
 * @param {string} plantSlug
 * @param {number} daysPlanted
 * @param {Object} [customGrowthStages] — overrides from admin content system
 * @returns {{ stage: number, isReady: boolean, progress: number }}
 */
function getGrowthStage(plantSlug, daysPlanted, customGrowthStages = {}) {
  const stages = customGrowthStages[plantSlug]
    || getPlant(plantSlug)?.growthDays
    || [3];

  const maxStage = stages.length - 1;

  for (let i = 0; i < stages.length; i++) {
    if (daysPlanted < stages[i]) {
      return {
        stage:    i,
        isReady:  false,
        progress: i === 0 ? daysPlanted / stages[0] : (daysPlanted - stages[i - 1]) / (stages[i] - stages[i - 1]),
      };
    }
  }

  return { stage: maxStage, isReady: true, progress: 1 };
}

/**
 * Compute the growth increment for one day given plot and weather conditions.
 *
 * @param {Object} plot    — { daysPlanted, waterLevel, fertilized, pest }
 * @param {string} weather — 'sunny' | 'rainy' | 'cloudy' | 'windy' | 'storm' | 'drought'
 * @returns {number} delta daysPlanted (0 if pest present)
 */
function dailyGrowthDelta(plot, weather) {
  if (plot.pest) return 0;
  const waterBonus = (plot.waterLevel > 0 || weather === 'rainy' || weather === 'storm') ? 1 : 0;
  const fertBonus  = plot.fertilized ? 1 : 0;
  return waterBonus + fertBonus;
}

/**
 * Compute new water level after one day for a given weather.
 *
 * @param {number} current
 * @param {string} weather
 * @returns {number}
 */
function dailyWaterLevel(current, weather) {
  if (weather === 'rainy' || weather === 'storm') return 3;
  if (weather === 'drought') return Math.max(0, current - 2);
  return Math.max(0, current - 1);
}

/**
 * Determine pest outbreak chance based on weather.
 * @param {string} weather
 * @returns {number} probability 0–1
 */
function pestChance(weather) {
  return weather === 'drought' ? 0.15 : 0.05;
}

module.exports = { getGrowthStage, dailyGrowthDelta, dailyWaterLevel, pestChance };
