/**
 * Garden routes — load and save player garden state.
 * Uses PostgreSQL when available, falls back to in-memory store.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { requireAuth }                             = require('../middleware/auth');
const { validateGardenAction, validateGardenSave } = require('../middleware/validate');

// In-memory fallback
const memGardens = {};

function defaultGarden() {
  return {
    plots: Array(24).fill(null).map(() => ({
      tilled: false,
      planted: false,
      plantType: null,
      waterLevel: 0,
      fertilized: false,
      daysPlanted: 0,
    })),
    currentDay: 1,
    weather: 'sunny',
  };
}

// ── GET /api/garden  — load the authenticated player's garden ─────────────────

router.get('/', requireAuth, async (req, res) => {
  const { userId } = req.user;

  if (db.isConnected()) {
    const result = await db.query(
      'SELECT plots, current_day, weather FROM gardens WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      const def = defaultGarden();
      await db.query(
        `INSERT INTO gardens (user_id, plots, current_day, weather)
         VALUES ($1, $2, $3, $4)`,
        [userId, JSON.stringify(def.plots), def.currentDay, def.weather]
      );
      return res.json(def);
    }

    const row = result.rows[0];
    return res.json({
      plots: row.plots,
      currentDay: row.current_day,
      weather: row.weather,
    });
  }

  // Fallback
  if (!memGardens[userId]) memGardens[userId] = defaultGarden();
  res.json(memGardens[userId]);
});

// ── POST /api/garden  — save full garden state ────────────────────────────────

router.post('/', requireAuth, validateGardenSave, async (req, res) => {
  const { userId } = req.user;
  const { plots, currentDay, weather } = req.body;

  if (!plots || !Array.isArray(plots)) {
    return res.status(400).json({ error: 'plots array required' });
  }

  if (db.isConnected()) {
    await db.query(
      `INSERT INTO gardens (user_id, plots, current_day, weather, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET plots = EXCLUDED.plots,
             current_day = EXCLUDED.current_day,
             weather = EXCLUDED.weather,
             updated_at = NOW()`,
      [userId, JSON.stringify(plots), currentDay || 1, weather || 'sunny']
    );
    return res.json({ success: true });
  }

  memGardens[userId] = { plots, currentDay: currentDay || 1, weather: weather || 'sunny' };
  res.json({ success: true });
});

// ── POST /api/garden/action  — apply a single plot action ────────────────────

router.post('/action', requireAuth, validateGardenAction, async (req, res) => {
  const { userId } = req.user;
  const { type, plotIndex, payload } = req.body;

  // Load current state
  let garden;
  if (db.isConnected()) {
    const result = await db.query(
      'SELECT plots FROM gardens WHERE user_id = $1',
      [userId]
    );
    garden = result.rows.length > 0
      ? { plots: result.rows[0].plots }
      : { plots: defaultGarden().plots };
  } else {
    if (!memGardens[userId]) memGardens[userId] = defaultGarden();
    garden = memGardens[userId];
  }

  if (plotIndex < 0 || plotIndex >= garden.plots.length) {
    return res.status(400).json({ error: 'Invalid plot index' });
  }

  const plot = { ...garden.plots[plotIndex] };

  switch (type) {
    case 'till':      plot.tilled = true; break;
    case 'water':     plot.waterLevel = Math.min((plot.waterLevel || 0) + 1, 3); break;
    case 'fertilize': plot.fertilized = true; break;
    case 'plant':
      if (plot.tilled && !plot.planted) {
        plot.planted = true;
        plot.plantType = payload?.plantType;
        plot.daysPlanted = 0;
      }
      break;
    case 'harvest':
      Object.assign(plot, {
        planted: false, plantType: null,
        waterLevel: 0, fertilized: false, daysPlanted: 0,
      });
      break;
    default:
      return res.status(400).json({ error: `Unknown action: ${type}` });
  }

  garden.plots[plotIndex] = plot;

  if (db.isConnected()) {
    await db.query(
      'UPDATE gardens SET plots = $1, updated_at = NOW() WHERE user_id = $2',
      [JSON.stringify(garden.plots), userId]
    );
  }

  res.json({ success: true, plot });
});

// ── POST /api/garden/nextday  — advance time by one day ──────────────────────

router.post('/nextday', requireAuth, async (req, res) => {
  const { userId } = req.user;

  let garden;
  if (db.isConnected()) {
    const result = await db.query(
      'SELECT plots, current_day FROM gardens WHERE user_id = $1',
      [userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Garden not found' });
    garden = { plots: result.rows[0].plots, currentDay: result.rows[0].current_day };
  } else {
    if (!memGardens[userId]) return res.status(404).json({ error: 'Garden not found' });
    garden = memGardens[userId];
  }

  // 10% storm, 10% drought, 80% normal
  const roll = Math.random();
  const weatherPool =
    roll < 0.10 ? ['storm']   :
    roll < 0.20 ? ['drought'] :
    ['sunny', 'cloudy', 'rainy', 'windy'];
  const nextWeather = weatherPool[Math.floor(Math.random() * weatherPool.length)];
  const pestChance = nextWeather === 'drought' ? 0.15 : 0.05;

  // Crop growth-stage map (must match frontend)
  const GROWTH_STAGES = {
    tomato: 3, carrot: 2, lettuce: 2, radish: 1, corn: 4, potato: 3,
    pumpkin: 5, sunflower: 2, blueberry: 4,
  };

  garden.plots = garden.plots.map((plot) => {
    if (!plot.planted) return plot;

    const hasPest = plot.pest || Math.random() < pestChance;
    const totalDays = GROWTH_STAGES[plot.plantType] || 3;
    let days = plot.daysPlanted || 0;

    // Storm partially rolls back mature crops
    if (nextWeather === 'storm' && days >= totalDays) {
      days = Math.max(0, days - 1);
    }

    const waterBonus = (plot.waterLevel > 0 || nextWeather === 'rainy' || nextWeather === 'storm') ? 1 : 0;
    const fertBonus  = plot.fertilized ? 1 : 0;
    const growthDays = hasPest ? days : days + waterBonus + fertBonus;

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

  garden.currentDay = (garden.currentDay || 1) + 1;
  garden.weather = nextWeather;

  if (db.isConnected()) {
    await db.query(
      `UPDATE gardens
       SET plots = $1, current_day = $2, weather = $3, updated_at = NOW()
       WHERE user_id = $4`,
      [JSON.stringify(garden.plots), garden.currentDay, nextWeather, userId]
    );
  }

  res.json({ currentDay: garden.currentDay, weather: garden.weather, plots: garden.plots });
});

// ── GET /api/garden/visit/:userId  — view another player's garden (read-only) ─

router.get('/visit/:targetId', requireAuth, async (req, res) => {
  const { targetId } = req.params;

  if (db.isConnected()) {
    const result = await db.query(
      `SELECT g.plots, g.current_day, g.weather, u.username, u.level
       FROM gardens g
       JOIN users u ON g.user_id = u.id
       WHERE g.user_id = $1`,
      [targetId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Garden not found' });
    const row = result.rows[0];
    return res.json({
      username: row.username,
      level: row.level,
      plots: row.plots,
      currentDay: row.current_day,
      weather: row.weather,
    });
  }

  const garden = memGardens[targetId];
  if (!garden) return res.status(404).json({ error: 'Garden not found' });
  res.json(garden);
});

module.exports = router;
