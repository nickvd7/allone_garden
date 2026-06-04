/**
 * Built-in Gradendex entries (used when DB is empty or unavailable).
 * Keep in sync with scripts/migrate-gradendex.js ENTRIES.
 */
module.exports = [
  { slug: 'radish', name: 'Radish', emoji: '🌸', category: 'plant', short_desc: 'Fastest-growing crop. Perfect for beginners.', growth_days: 1, base_coins: 6, companion_good: [], companion_bad: [], tips: [] },
  { slug: 'carrot', name: 'Carrot', emoji: '🥕', category: 'plant', short_desc: 'Reliable 2-day crop with great companion synergy.', growth_days: 2, base_coins: 10, companion_good: [], companion_bad: [], tips: [] },
  { slug: 'lettuce', name: 'Lettuce', emoji: '🥬', category: 'plant', short_desc: 'Cheap filler crop. Good companion to most plants.', growth_days: 2, base_coins: 8, companion_good: [], companion_bad: [], tips: [] },
  { slug: 'sunflower', name: 'Sunflower', emoji: '🌻', category: 'plant', short_desc: 'Bright 2-day crop. The best friend of pumpkins.', growth_days: 2, base_coins: 12, companion_good: [], companion_bad: [], tips: [] },
  { slug: 'tomato', name: 'Tomato', emoji: '🍅', category: 'plant', short_desc: 'Classic 3-day crop. Great earnings with the right neighbours.', growth_days: 3, base_coins: 15, companion_good: [], companion_bad: [], tips: [] },
  { slug: 'potato', name: 'Potato', emoji: '🥔', category: 'plant', short_desc: 'Hearty 3-day crop. Loves corn, hates pumpkins.', growth_days: 3, base_coins: 12, companion_good: [], companion_bad: [], tips: [] },
  { slug: 'blueberry', name: 'Blueberry', emoji: '🫐', category: 'plant', short_desc: 'High-value 4-day crop. Pairs beautifully with sunflowers.', growth_days: 4, base_coins: 22, companion_good: [], companion_bad: [], tips: [] },
  { slug: 'corn', name: 'Corn', emoji: '🌽', category: 'plant', short_desc: 'Tall 4-day crop. Best friend of potato.', growth_days: 4, base_coins: 18, companion_good: [], companion_bad: [], tips: [] },
  { slug: 'pumpkin', name: 'Pumpkin', emoji: '🎃', category: 'plant', short_desc: 'The most valuable crop. Slow but worth the wait.', growth_days: 5, base_coins: 28, companion_good: [], companion_bad: [], tips: [] },
  { slug: 'well', name: 'Water Well', emoji: '🪣', category: 'structure', short_desc: 'Waters all tilled plots in one click. 3 charges per day.', growth_days: null, base_coins: null, companion_good: [], companion_bad: [], tips: [] },
  { slug: 'compost_heap', name: 'Compost Heap', emoji: '🌿', category: 'structure', short_desc: 'Auto-generates fertilizer charges every 3 harvests.', growth_days: null, base_coins: null, companion_good: [], companion_bad: [], tips: [] },
  { slug: 'greenhouse', name: 'Greenhouse', emoji: '🏡', category: 'structure', short_desc: 'Passive shield against storm and drought damage.', growth_days: null, base_coins: null, companion_good: [], companion_bad: [], tips: [] },
];
