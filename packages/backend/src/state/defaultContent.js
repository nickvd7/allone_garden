'use strict';
/**
 * defaultContent.js — canonical default game data.
 *
 * These are the built-in plants, structures, tools, and weather conditions.
 * Custom items (stored in server_config) are merged on top of these at runtime.
 *
 * IMPORTANT: Keep in sync with packages/frontend/src/data/defaultContent.js
 */

// ── Plants ────────────────────────────────────────────────────────────────────
// growthDays: days to reach full maturity (matches frontend GROWTH_STAGES)
// baseCoins:  coins awarded on harvest
// growthEmojis: array, index = growth stage (0 = just planted … last = ready)
// companionGood: [{slug, bonus}]  — extra coins when grown adjacent
// companionBad:  [{slug, penalty}] — coins deducted when grown adjacent
const PLANTS = [
  {
    slug: 'tomato',
    name: 'Tomato',
    harvestEmoji: '🍅',
    growthEmojis: ['🌱', '🌿', '🍅'],
    growthDays: 3,
    baseCoins: 15,
    companionGood: [{ slug: 'carrot', bonus: 3 }],
    companionBad:  [{ slug: 'corn',   penalty: 2 }],
  },
  {
    slug: 'carrot',
    name: 'Carrot',
    harvestEmoji: '🥕',
    growthEmojis: ['🌱', '🥕'],
    growthDays: 2,
    baseCoins: 10,
    companionGood: [{ slug: 'lettuce', bonus: 2 }],
    companionBad:  [],
  },
  {
    slug: 'lettuce',
    name: 'Lettuce',
    harvestEmoji: '🥬',
    growthEmojis: ['🌱', '🥬'],
    growthDays: 2,
    baseCoins: 8,
    companionGood: [],
    companionBad:  [{ slug: 'pumpkin', penalty: 3 }],
  },
  {
    slug: 'radish',
    name: 'Radish',
    harvestEmoji: '🌶️',
    growthEmojis: ['🌱'],
    growthDays: 1,
    baseCoins: 5,
    companionGood: [],
    companionBad:  [],
  },
  {
    slug: 'corn',
    name: 'Corn',
    harvestEmoji: '🌽',
    growthEmojis: ['🌱', '🌿', '🌾', '🌽'],
    growthDays: 4,
    baseCoins: 20,
    companionGood: [{ slug: 'potato', bonus: 4 }],
    companionBad:  [{ slug: 'tomato', penalty: 2 }],
  },
  {
    slug: 'potato',
    name: 'Potato',
    harvestEmoji: '🥔',
    growthEmojis: ['🌱', '🌿', '🥔'],
    growthDays: 3,
    baseCoins: 12,
    companionGood: [],
    companionBad:  [],
  },
  {
    slug: 'pumpkin',
    name: 'Pumpkin',
    harvestEmoji: '🎃',
    growthEmojis: ['🌱', '🌿', '🍀', '🌿', '🎃'],
    growthDays: 5,
    baseCoins: 30,
    companionGood: [{ slug: 'corn', bonus: 5 }],
    companionBad:  [{ slug: 'lettuce', penalty: 3 }],
  },
  {
    slug: 'sunflower',
    name: 'Sunflower',
    harvestEmoji: '🌻',
    growthEmojis: ['🌱', '🌻'],
    growthDays: 2,
    baseCoins: 10,
    companionGood: [],
    companionBad:  [],
  },
  {
    slug: 'blueberry',
    name: 'Blueberry',
    harvestEmoji: '🫐',
    growthEmojis: ['🌱', '🌿', '🫐', '🫐'],
    growthDays: 4,
    baseCoins: 25,
    companionGood: [{ slug: 'sunflower', bonus: 3 }],
    companionBad:  [],
  },
];

// ── Structures ────────────────────────────────────────────────────────────────
// buildCost:     coins to build the structure
// chargesPerDay: how many times the structure can be used per day
// usageLabel:    verb shown on the use-button in-game
const STRUCTURES = [
  {
    id: 'well',
    name: 'Well',
    emoji: '🪣',
    description: 'Water multiple plots for free each day.',
    buildCost: 50,
    chargesPerDay: 3,
    usageLabel: 'Draw water',
  },
  {
    id: 'compost',
    name: 'Compost Bin',
    emoji: '🪱',
    description: 'Provides free fertilizer charges each day.',
    buildCost: 75,
    chargesPerDay: 2,
    usageLabel: 'Fertilize',
  },
  {
    id: 'greenhouse',
    name: 'Greenhouse',
    emoji: '🏡',
    description: 'Reduces pest chance and speeds up all crops inside.',
    buildCost: 200,
    chargesPerDay: 0,
    usageLabel: 'Upgrade',
  },
];

// ── Tools ─────────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    id: 'till',
    name: 'Till',
    emoji: '⛏️',
    description: 'Prepares soil for planting.',
  },
  {
    id: 'plant',
    name: 'Plant',
    emoji: '🌱',
    description: 'Plants a seed in a tilled plot.',
  },
  {
    id: 'water',
    name: 'Water',
    emoji: '💧',
    description: 'Waters a planted crop to boost daily growth.',
  },
  {
    id: 'fertilize',
    name: 'Fertilize',
    emoji: '🧪',
    description: 'Fertilizes a crop for an extra growth boost.',
  },
  {
    id: 'spray',
    name: 'Spray',
    emoji: '🚿',
    description: 'Removes pests from an infected plot.',
  },
  {
    id: 'harvest',
    name: 'Harvest',
    emoji: '🧺',
    description: 'Harvests a mature crop and earns coins.',
  },
];

// ── Weather conditions ────────────────────────────────────────────────────────
// waterBonus:    bonus to waterLevel applied when this weather occurs
// pestChance:    probability of pest spawning on any planted plot
// stormRollback: if true, mature crops lose 1 growth day
const WEATHER = [
  {
    id: 'sunny',
    name: 'Sunny',
    emoji: '☀️',
    waterBonus: 0,
    pestChance: 0.05,
    stormRollback: false,
  },
  {
    id: 'cloudy',
    name: 'Cloudy',
    emoji: '☁️',
    waterBonus: 0,
    pestChance: 0.05,
    stormRollback: false,
  },
  {
    id: 'rainy',
    name: 'Rainy',
    emoji: '🌧️',
    waterBonus: 1,
    pestChance: 0.05,
    stormRollback: false,
  },
  {
    id: 'windy',
    name: 'Windy',
    emoji: '💨',
    waterBonus: 0,
    pestChance: 0.05,
    stormRollback: false,
  },
  {
    id: 'storm',
    name: 'Storm',
    emoji: '⛈️',
    waterBonus: 1,
    pestChance: 0.10,
    stormRollback: true,
  },
  {
    id: 'drought',
    name: 'Drought',
    emoji: '🏜️',
    waterBonus: 0,
    pestChance: 0.15,
    stormRollback: false,
  },
];

module.exports = { PLANTS, STRUCTURES, TOOLS, WEATHER };
