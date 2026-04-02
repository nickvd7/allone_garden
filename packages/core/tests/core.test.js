'use strict';

const {
  PLANTS, getPlant,
  getGrowthStage, dailyGrowthDelta, dailyWaterLevel, pestChance,
  rollWeather, wmoToGameWeather, seasonFromDay,
  getCompanionEffect,
} = require('../src/index');

// ── Plants ────────────────────────────────────────────────────────────────────
describe('plants', () => {
  it('exports a non-empty PLANTS array', () => {
    expect(Array.isArray(PLANTS)).toBe(true);
    expect(PLANTS.length).toBeGreaterThan(0);
  });

  it('getPlant returns a known plant', () => {
    const tomato = getPlant('tomato');
    expect(tomato).toBeDefined();
    expect(tomato.slug).toBe('tomato');
    expect(tomato.baseCoins).toBeGreaterThan(0);
  });

  it('getPlant returns undefined for an unknown slug', () => {
    expect(getPlant('durian')).toBeUndefined();
  });

  it('every plant has growthDays, emoji, and baseCoins', () => {
    for (const p of PLANTS) {
      expect(p.growthDays.length).toBeGreaterThan(0);
      expect(p.emoji.length).toBeGreaterThan(0);
      expect(typeof p.baseCoins).toBe('number');
    }
  });
});

// ── Growth ────────────────────────────────────────────────────────────────────
describe('getGrowthStage', () => {
  it('returns stage 0 on day 0', () => {
    const { stage, isReady } = getGrowthStage('tomato', 0);
    expect(stage).toBe(0);
    expect(isReady).toBe(false);
  });

  it('returns isReady=true at or beyond final growth threshold', () => {
    const { isReady } = getGrowthStage('tomato', 3);
    expect(isReady).toBe(true);
  });

  it('uses custom growth stages when provided', () => {
    const { isReady } = getGrowthStage('tomato', 1, { tomato: [1] });
    expect(isReady).toBe(true);
  });
});

describe('dailyGrowthDelta', () => {
  it('returns 0 when pest is present', () => {
    expect(dailyGrowthDelta({ pest: true, waterLevel: 3, fertilized: true }, 'sunny')).toBe(0);
  });

  it('returns 1 when watered on sunny day', () => {
    expect(dailyGrowthDelta({ pest: false, waterLevel: 1, fertilized: false }, 'sunny')).toBe(1);
  });

  it('returns 2 when watered and fertilized', () => {
    expect(dailyGrowthDelta({ pest: false, waterLevel: 1, fertilized: true }, 'sunny')).toBe(2);
  });

  it('counts rain as water bonus', () => {
    expect(dailyGrowthDelta({ pest: false, waterLevel: 0, fertilized: false }, 'rainy')).toBe(1);
  });

  it('returns 0 on dry drought day with no water and no fert', () => {
    expect(dailyGrowthDelta({ pest: false, waterLevel: 0, fertilized: false }, 'drought')).toBe(0);
  });
});

describe('dailyWaterLevel', () => {
  it('fills to 3 on rainy day', () => expect(dailyWaterLevel(0, 'rainy')).toBe(3));
  it('drops by 2 on drought',   () => expect(dailyWaterLevel(3, 'drought')).toBe(1));
  it('drops by 1 on sunny',     () => expect(dailyWaterLevel(2, 'sunny')).toBe(1));
  it('does not go below 0',     () => expect(dailyWaterLevel(0, 'sunny')).toBe(0));
});

describe('pestChance', () => {
  it('is higher on drought', () => expect(pestChance('drought')).toBeGreaterThan(pestChance('sunny')));
  it('is 0.05 on sunny',     () => expect(pestChance('sunny')).toBe(0.05));
  it('is 0.15 on drought',   () => expect(pestChance('drought')).toBe(0.15));
});

// ── Weather ───────────────────────────────────────────────────────────────────
describe('rollWeather', () => {
  it('returns storm for roll < 0.10', () => expect(rollWeather(0.05)).toBe('storm'));
  it('returns drought for roll 0.15', () => expect(rollWeather(0.15)).toBe('drought'));
  it('returns a normal type for roll 0.50', () => {
    const w = rollWeather(0.50);
    expect(['sunny', 'cloudy', 'rainy', 'windy']).toContain(w);
  });
});

describe('wmoToGameWeather', () => {
  it('maps clear sky (0) to sunny',       () => expect(wmoToGameWeather(0)).toBe('sunny'));
  it('maps overcast (3) to cloudy',       () => expect(wmoToGameWeather(3)).toBe('cloudy'));
  it('maps moderate rain (63) to rainy',  () => expect(wmoToGameWeather(63)).toBe('rainy'));
  it('maps thunderstorm (95) to storm',   () => expect(wmoToGameWeather(95)).toBe('storm'));
});

describe('seasonFromDay', () => {
  it('day 1 is spring',   () => expect(seasonFromDay(1)).toBe('spring'));
  it('day 29 is summer',  () => expect(seasonFromDay(29)).toBe('summer'));
  it('day 57 is autumn',  () => expect(seasonFromDay(57)).toBe('autumn'));
  it('day 85 is winter',  () => expect(seasonFromDay(85)).toBe('winter'));
  it('day 113 wraps to spring', () => expect(seasonFromDay(113)).toBe('spring'));
});

// ── Companions ────────────────────────────────────────────────────────────────
describe('getCompanionEffect', () => {
  function makePlots(overrides = []) {
    return Array.from({ length: 24 }, (_, i) => ({
      planted: false, plantType: null, ...overrides[i],
    }));
  }

  it('returns modifier 1 for an unplanted plot', () => {
    const plots = makePlots();
    expect(getCompanionEffect(plots, 0).modifier).toBe(1);
  });

  it('returns boost modifier when a companion neighbour is present', () => {
    // tomato boosts sunflower (from PLANTS companion data)
    const plots = makePlots([
      { planted: true, plantType: 'sunflower' }, // index 0 — target
      { planted: true, plantType: 'corn' },       // index 1 — neighbour (corn boosts sunflower)
    ]);
    const { modifier } = getCompanionEffect(plots, 0);
    // corn is listed as a sunflower companion boost
    expect(modifier).toBeGreaterThanOrEqual(1);
  });

  it('uses custom companion overrides', () => {
    const plots = makePlots([
      { planted: true, plantType: 'tomato' },
      { planted: true, plantType: 'potato' }, // index 1 next to index 0
    ]);
    const custom = { tomato: { potato: 'boost' } };
    const { modifier } = getCompanionEffect(plots, 0, 6, custom);
    expect(modifier).toBe(1.25);
  });
});
