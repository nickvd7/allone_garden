/**
 * Community plugin: crop-prices
 *
 * Generates dynamic market prices for each crop type that fluctuate
 * every in-game day.  Prices follow a random-walk model with mean
 * reversion so they stay within a sensible range.
 *
 * Broadcasts updated prices to all clients on each day change.
 * Clients can also request the current price list on demand.
 *
 * License: MIT
 * Author: AllOne Garden Community
 */

// Base price and allowed range per crop type
const CROPS = {
  tomato:  { base: 12, min: 6,  max: 28 },
  carrot:  { base: 8,  min: 4,  max: 20 },
  lettuce: { base: 6,  min: 3,  max: 16 },
  radish:  { base: 5,  min: 2,  max: 14 },
  corn:    { base: 15, min: 8,  max: 35 },
  potato:  { base: 10, min: 5,  max: 25 },
};

// Maximum daily change as fraction of base price
const VOLATILITY = 0.20;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Apply a random-walk step with mean reversion.
 * @param {number} current   Current price
 * @param {number} base      Long-run equilibrium
 * @param {number} min
 * @param {number} max
 * @returns {number} New price
 */
function step(current, base, min, max) {
  // Mean reversion pull (0–15 % of distance to base)
  const pull = (base - current) * (0.05 + Math.random() * 0.10);
  // Random shock (±VOLATILITY of base)
  const shock = (Math.random() * 2 - 1) * VOLATILITY * base;
  const next = Math.round(current + pull + shock);
  return clamp(next, min, max);
}

module.exports = {
  name:    'crop-prices',
  version: '1.0.0',

  init(api) {
    api.log('Crop-prices plugin initialised');

    // Initialise prices at base values
    let prices = {};
    for (const [crop, spec] of Object.entries(CROPS)) {
      prices[crop] = spec.base;
    }

    // ── Update prices each new day ────────────────────────────────────────────
    api.on('onDayChange', ({ currentDay }) => {
      for (const [crop, spec] of Object.entries(CROPS)) {
        prices[crop] = step(prices[crop], spec.base, spec.min, spec.max);
      }

      // Identify the most expensive and cheapest crop today
      const entries   = Object.entries(prices);
      const hotCrop   = entries.reduce((a, b) => (a[1] > b[1] ? a : b));
      const cheapCrop = entries.reduce((a, b) => (a[1] < b[1] ? a : b));

      api.broadcast('crop-prices:update', {
        day:    currentDay,
        prices: { ...prices },
        hot:    hotCrop[0],
        cheap:  cheapCrop[0],
      });

      api.log(`Day ${currentDay} prices: ${JSON.stringify(prices)}`);
    });

    // ── Serve current prices on request ──────────────────────────────────────
    api.on('plugin:crop-prices:request', ({ socket }) => {
      api.sendTo(socket.id, 'crop-prices:data', { prices: { ...prices } });
    });

    // ── Also expose a daily price history endpoint ────────────────────────────
    // (persisted only in memory; resets on server restart)
    const history = [];   // [{ day, prices }]

    api.on('onDayChange', ({ currentDay }) => {
      history.push({ day: currentDay, prices: { ...prices } });
      if (history.length > 90) history.shift(); // keep max 90 days
    });

    api.on('plugin:crop-prices:history', ({ socket }) => {
      api.sendTo(socket.id, 'crop-prices:history', { history: [...history] });
    });
  },
};
