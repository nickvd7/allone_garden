/**
 * defaultContent.js — canonical default game data (frontend copy).
 *
 * Keep in sync with packages/backend/src/state/defaultContent.js
 *
 * Used as the fallback when the /api/content request is loading or fails,
 * and as the source-of-truth for the GameContentContext initial state.
 */

// ── Plants ────────────────────────────────────────────────────────────────────
export const PLANTS = [
  {
    slug: 'tomato',
    name: 'Tomato',
    harvestEmoji: '🍅',
    growthEmojis: ['🌱', '🌿', '🍅'],
    growthDays: 3,
    baseCoins: 15,
    companionGood: [{ slug: 'carrot',   bonus: 3 }],
    companionBad:  [{ slug: 'corn',     penalty: 2 }],
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
    companionGood: [{ slug: 'corn',    bonus: 5 }],
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
export const STRUCTURES = [
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
export const TOOLS = [
  { id: 'till',      name: 'Till',      emoji: '⛏️',  description: 'Prepares soil for planting.' },
  { id: 'plant',     name: 'Plant',     emoji: '🌱',  description: 'Plants a seed in a tilled plot.' },
  { id: 'water',     name: 'Water',     emoji: '💧',  description: 'Waters a planted crop to boost daily growth.' },
  { id: 'fertilize', name: 'Fertilize', emoji: '🧪',  description: 'Fertilizes a crop for an extra growth boost.' },
  { id: 'spray',     name: 'Spray',     emoji: '🚿',  description: 'Removes pests from an infected plot.' },
  { id: 'harvest',   name: 'Harvest',   emoji: '🧺',  description: 'Harvests a mature crop and earns coins.' },
];

// ── Weather ───────────────────────────────────────────────────────────────────
export const WEATHER = [
  { id: 'sunny',   name: 'Sunny',   emoji: '☀️',  waterBonus: 0, pestChance: 0.05, stormRollback: false },
  { id: 'cloudy',  name: 'Cloudy',  emoji: '☁️',  waterBonus: 0, pestChance: 0.05, stormRollback: false },
  { id: 'rainy',   name: 'Rainy',   emoji: '🌧️',  waterBonus: 1, pestChance: 0.05, stormRollback: false },
  { id: 'windy',   name: 'Windy',   emoji: '💨',  waterBonus: 0, pestChance: 0.05, stormRollback: false },
  { id: 'storm',   name: 'Storm',   emoji: '⛈️',  waterBonus: 1, pestChance: 0.10, stormRollback: true  },
  { id: 'drought', name: 'Drought', emoji: '🏜️',  waterBonus: 0, pestChance: 0.15, stormRollback: false },
];

// ── Convenience helpers ────────────────────────────────────────────────────────
/**
 * Build a slug→stageThresholds lookup from a plants array.
 * stageThresholds is an array [0, 1, 2, … growthDays], matching
 * Garden.js's GROWTH_STAGES format where the last entry = days to full maturity.
 * Example: growthDays=3 → [0, 1, 2, 3]
 */
export function buildGrowthStages(plants) {
  return Object.fromEntries(
    plants.map((p) => [
      p.slug,
      Array.from({ length: p.growthDays + 1 }, (_, i) => i),
    ])
  );
}

/** Build a slug→baseCoins lookup from a plants array */
export function buildCropCoins(plants) {
  return Object.fromEntries(plants.map((p) => [p.slug, p.baseCoins]));
}

/**
 * Build a slug→growthEmojis array lookup from a plants array.
 * The returned array has one extra slot at position 0 so that
 * stage index === daysPlanted matches existing Garden.js convention.
 */
export function buildPlantEmojis(plants) {
  return Object.fromEntries(
    plants.map((p) => [p.slug, ['🌱', ...p.growthEmojis]])
  );
}

/**
 * Build COMPANIONS map: { slug: { neighborSlug: modifier, ... } }
 * modifier > 0 = bonus percentage; < 0 = penalty percentage.
 */
export function buildCompanions(plants) {
  const companions = {};
  for (const plant of plants) {
    const row = {};
    for (const { slug, bonus } of (plant.companionGood || [])) {
      row[slug] = (row[slug] || 0) + bonus / 100;
    }
    for (const { slug, penalty } of (plant.companionBad || [])) {
      row[slug] = (row[slug] || 0) - penalty / 100;
    }
    companions[plant.slug] = row;
  }
  return companions;
}
