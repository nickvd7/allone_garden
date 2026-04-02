/**
 * @allone-garden/core — Companion planting
 *
 * Calculates the coin modifier and indicator icon for a plot based on
 * what its neighbours are growing.
 *
 * MIT License
 */

'use strict';

const { getPlant } = require('./plants');

/**
 * Compute the companion planting effect for a single plot.
 *
 * @param {Object[]} plots     — full plot array
 * @param {number}   index     — index of the target plot
 * @param {number}   [cols=6]  — grid width (default 4-row × 6-col = 24 plots)
 * @param {Object}   [customCompanions] — overrides from admin content system
 * @returns {{ modifier: number, icon: string|null }}
 */
function getCompanionEffect(plots, index, cols = 6, customCompanions = {}) {
  const plot = plots[index];
  if (!plot?.planted || !plot.plantType) return { modifier: 1, icon: null };

  const plantDef     = getPlant(plot.plantType);
  const companionRow = customCompanions[plot.plantType] || plantDef?.companions || {};

  const neighbours = getNeighbourIndices(index, plots.length, cols);

  let modifier = 1;
  let bestIcon = null;

  for (const ni of neighbours) {
    const nb = plots[ni];
    if (!nb?.planted || !nb.plantType) continue;
    const effect = companionRow[nb.plantType];
    if (effect === 'boost')   { modifier = Math.max(modifier, 1.25); bestIcon = '✨'; }
    if (effect === 'penalty') { modifier = Math.min(modifier, 0.80); bestIcon = bestIcon || '⚠️'; }
  }

  return { modifier, icon: bestIcon };
}

/**
 * Return the orthogonal + diagonal neighbour indices for a grid position.
 * @param {number} idx
 * @param {number} total
 * @param {number} cols
 * @returns {number[]}
 */
function getNeighbourIndices(idx, total, cols) {
  const row  = Math.floor(idx / cols);
  const col  = idx % cols;
  const result = [];

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nc < 0 || nc >= cols) continue;
      const ni = nr * cols + nc;
      if (ni >= 0 && ni < total) result.push(ni);
    }
  }
  return result;
}

module.exports = { getCompanionEffect, getNeighbourIndices };
