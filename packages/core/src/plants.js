/**
 * @allone-garden/core — Plant definitions
 *
 * Static catalogue of all built-in plants.
 * Each plant has a slug, display name, growth stages (days per stage),
 * base coin value, and emoji progression.
 *
 * MIT License — safe to use in mods, plugins, and forks.
 */

'use strict';

/** @type {PlantDef[]} */
const PLANTS = [
  {
    slug:        'tomato',
    name:        'Tomato',
    emoji:       ['🌱', '🌿', '🍅'],
    growthDays:  [1, 2, 3],   // days to reach each stage (cumulative)
    baseCoins:   15,
    companions:  { basil: 'boost', carrot: 'neutral' },
  },
  {
    slug:        'carrot',
    name:        'Carrot',
    emoji:       ['🌱', '🌿', '🥕'],
    growthDays:  [1, 2, 3],
    baseCoins:   10,
    companions:  { tomato: 'neutral', lettuce: 'boost' },
  },
  {
    slug:        'lettuce',
    name:        'Lettuce',
    emoji:       ['🌱', '🥬', '🥬'],
    growthDays:  [1, 2],
    baseCoins:   8,
    companions:  { carrot: 'boost', radish: 'boost' },
  },
  {
    slug:        'radish',
    name:        'Radish',
    emoji:       ['🌱', '🌿', '🌸'],
    growthDays:  [1, 2],
    baseCoins:   8,
    companions:  { lettuce: 'boost', carrot: 'neutral' },
  },
  {
    slug:        'corn',
    name:        'Corn',
    emoji:       ['🌱', '🌿', '🌽'],
    growthDays:  [2, 4, 6],
    baseCoins:   20,
    companions:  { sunflower: 'boost' },
  },
  {
    slug:        'potato',
    name:        'Potato',
    emoji:       ['🌱', '🌿', '🥔'],
    growthDays:  [2, 3, 5],
    baseCoins:   12,
    companions:  {},
  },
  {
    slug:        'pumpkin',
    name:        'Pumpkin',
    emoji:       ['🌱', '🌿', '🎃'],
    growthDays:  [3, 5, 7],
    baseCoins:   25,
    companions:  { corn: 'boost' },
  },
  {
    slug:        'sunflower',
    name:        'Sunflower',
    emoji:       ['🌱', '🌿', '🌻'],
    growthDays:  [2, 4, 5],
    baseCoins:   18,
    companions:  { corn: 'boost', tomato: 'boost' },
  },
  {
    slug:        'blueberry',
    name:        'Blueberry',
    emoji:       ['🌱', '🌿', '🫐'],
    growthDays:  [3, 5, 7],
    baseCoins:   22,
    companions:  {},
  },
];

/** Fast lookup by slug */
const PLANTS_BY_SLUG = Object.fromEntries(PLANTS.map((p) => [p.slug, p]));

/**
 * Get a plant definition by slug.
 * @param {string} slug
 * @returns {PlantDef | undefined}
 */
function getPlant(slug) {
  return PLANTS_BY_SLUG[slug];
}

module.exports = { PLANTS, PLANTS_BY_SLUG, getPlant };

/**
 * @typedef {Object} PlantDef
 * @property {string}   slug
 * @property {string}   name
 * @property {string[]} emoji        — emoji per growth stage
 * @property {number[]} growthDays   — cumulative days to reach each stage
 * @property {number}   baseCoins    — coins earned on harvest
 * @property {Object}   companions   — slug → 'boost'|'neutral'|'penalty'
 */
