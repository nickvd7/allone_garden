/**
 * Garden routes — load and save player garden state.
 * Uses PostgreSQL when available, falls back to in-memory store.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { requireAuth }                             = require('../middleware/auth');
const { validateGardenAction, validateGardenSave } = require('../middleware/validate');
const contentStore = require('../state/contentStore');
const { updateMemGardenDay } = require('./leaderboard');
const { recordSeasonScoresOnGardenSave } = require('./leaderboardSeasonHistory');
const { syncPlayerStats } = require('../lib/playerStats');
const { touchLastActive } = require('../services/digestService');
const worldRoutes = require('./world');
const { loadInventory, addCrop, syncInventory } = require('../lib/inventory');

// In-memory fallback
const memGardens = {};

function emitGardenPreviewUpdated(req, userId) {
  try {
    worldRoutes.invalidateWorldProjectionCache?.();
    const io = req.app?.get('io');
    if (!io) return;
    io.emit('garden:preview-updated', { userId: Number(userId), ts: Date.now() });
  } catch {
    // Non-fatal; world map can still refresh on open/poll.
  }
}

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
  touchLastActive(userId).catch(() => {});

  if (db.isConnected()) {
    const result = await db.query(
      'SELECT plots, current_day, weather, structures, updated_at FROM gardens WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      const def = defaultGarden();
      await db.query(
        `INSERT INTO gardens (user_id, plots, current_day, weather)
         VALUES ($1, $2, $3, $4)`,
        [userId, JSON.stringify(def.plots), def.currentDay, def.weather]
      );
      return res.json({ ...def, inventory: {}, structures: {}, serverUpdatedAt: null });
    }

    const row = result.rows[0];
    const inventory = await loadInventory(userId);
    const serverUpdatedAt = row.updated_at
      ? new Date(row.updated_at).toISOString()
      : null;

    // Auto-advance day if the garden hasn't been updated for 24+ hours
    const now = new Date();
    const lastUpdate = row.updated_at ? new Date(row.updated_at) : now;
    const daysSince = Math.floor((now - lastUpdate) / (1000 * 60 * 60 * 24));
    if (daysSince >= 1) {
      const daysToAdvance = Math.min(daysSince, 7); // max 7 days at once
      const newDay = (row.current_day || 1) + daysToAdvance;
      const weathers = ['sunny', 'cloudy', 'rainy', 'windy', 'storm', 'drought'];
      const newWeather = weathers[Math.floor(Math.random() * weathers.length)];
      await db.query(
        'UPDATE gardens SET current_day = $1, weather = $2 WHERE user_id = $3',
        [newDay, newWeather, userId]
      );
      return res.json({
        plots: row.plots,
        currentDay: newDay,
        weather: newWeather,
        inventory,
        structures: row.structures || {},
        serverUpdatedAt: new Date().toISOString(),
        autoAdvanced: daysToAdvance,
      });
    }

    return res.json({
      plots: row.plots,
      currentDay: row.current_day,
      weather: row.weather,
      inventory,
      structures: row.structures || {},
      serverUpdatedAt,
    });
  }

  // Fallback
  if (!memGardens[userId]) memGardens[userId] = defaultGarden();
  const g = memGardens[userId];
  updateMemGardenDay(userId, g.currentDay);
  res.json({ ...g, inventory: g.inventory || {} });
});

// ── POST /api/garden  — save full garden state ────────────────────────────────

router.post('/', requireAuth, validateGardenSave, async (req, res) => {
  const { userId } = req.user;
  const { plots, currentDay, weather, ifUnmodifiedSince, inventory, playerStats, structures } = req.body;

  if (!plots || !Array.isArray(plots)) {
    return res.status(400).json({ error: 'plots array required' });
  }

  if (db.isConnected()) {
    const newDay = currentDay || 1;
    const prev = await db.query(
      'SELECT current_day, updated_at, plots, weather, structures FROM gardens WHERE user_id = $1',
      [userId]
    );
    let oldDay = 1;
    if (prev.rows.length) {
      oldDay = prev.rows[0].current_day || 1;
    }

    if (ifUnmodifiedSince && prev.rows.length && prev.rows[0].updated_at) {
      const serverT = new Date(prev.rows[0].updated_at).getTime();
      const clientT = new Date(ifUnmodifiedSince).getTime();
      if (!Number.isNaN(clientT) && serverT > clientT) {
        const row = prev.rows[0];
        return res.status(409).json({
          error:           'conflict',
          message:         'Garden was updated elsewhere — reload before saving',
          serverUpdatedAt: new Date(row.updated_at).toISOString(),
          garden:          {
            plots:      row.plots,
            currentDay: row.current_day,
            weather:    row.weather,
            structures: row.structures || {},
          },
        });
      }
    }

    const structuresJson = structures && typeof structures === 'object' && !Array.isArray(structures)
      ? structures
      : (prev.rows[0]?.structures || {});

    await db.query(
      `INSERT INTO gardens (user_id, plots, current_day, weather, structures, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET plots = EXCLUDED.plots,
             current_day = EXCLUDED.current_day,
             weather = EXCLUDED.weather,
             structures = EXCLUDED.structures,
             updated_at = NOW()`,
      [userId, JSON.stringify(plots), newDay, weather || 'sunny', JSON.stringify(structuresJson)]
    );

    await recordSeasonScoresOnGardenSave(userId, oldDay, newDay);

    if (playerStats) {
      await syncPlayerStats(userId, playerStats, req.user.username);
    }
    await touchLastActive(userId);

    let syncedInventory = null;
    if (inventory && typeof inventory === 'object') {
      syncedInventory = await syncInventory(userId, inventory);
    }

    const after = await db.query(
      'SELECT updated_at FROM gardens WHERE user_id = $1',
      [userId]
    );
    const serverUpdatedAt = after.rows[0]?.updated_at
      ? new Date(after.rows[0].updated_at).toISOString()
      : null;
    emitGardenPreviewUpdated(req, userId);
    return res.json({ success: true, serverUpdatedAt, inventory: syncedInventory });
  }

  memGardens[userId] = {
    plots,
    currentDay: currentDay || 1,
    weather: weather || 'sunny',
    inventory: inventory || memGardens[userId]?.inventory || {},
    structures: structures || memGardens[userId]?.structures || {},
  };
  updateMemGardenDay(userId, currentDay || 1);
  if (playerStats) {
    await syncPlayerStats(userId, playerStats, req.user.username);
  }
  emitGardenPreviewUpdated(req, userId);
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
    case 'spray':
      // Removes pest from the plot (requires a planted plot)
      if (plot.planted) plot.pest = false;
      break;
    case 'harvest': {
      // Server-side ripeness check — uses dynamic plant registry (supports custom plants)
      const plants = contentStore.getPlants();
      const plantDef = plants.find((p) => p.slug === plot.plantType);
      const required = plantDef ? plantDef.growthDays : 3;
      if (!plot.planted || (plot.daysPlanted || 0) < required) {
        return res.status(400).json({ error: 'Crop is not ready to harvest yet' });
      }
      const harvestedCrop = plot.plantType;
      Object.assign(plot, {
        planted: false, plantType: null,
        waterLevel: 0, fertilized: false, daysPlanted: 0, pest: false,
      });
      garden.plots[plotIndex] = plot;

      if (db.isConnected()) {
        await db.query(
          'UPDATE gardens SET plots = $1, updated_at = NOW() WHERE user_id = $2',
          [JSON.stringify(garden.plots), userId],
        );
        const inventory = await addCrop(userId, harvestedCrop, 1);
        emitGardenPreviewUpdated(req, userId);
        return res.json({ success: true, plot, harvestedCrop, inventory });
      }

      if (!memGardens[userId]) memGardens[userId] = defaultGarden();
      memGardens[userId].plots = garden.plots;
      const inv = memGardens[userId].inventory || {};
      inv[harvestedCrop] = (inv[harvestedCrop] || 0) + 1;
      memGardens[userId].inventory = inv;
      emitGardenPreviewUpdated(req, userId);
      return res.json({ success: true, plot, harvestedCrop, inventory: inv });
    }
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

  emitGardenPreviewUpdated(req, userId);
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

  // Crop growth-stage map — dynamic lookup (supports custom plants)
  const allPlants = contentStore.getPlants();
  const growthDaysMap = Object.fromEntries(allPlants.map((p) => [p.slug, p.growthDays]));

  garden.plots = garden.plots.map((plot) => {
    if (!plot.planted) return plot;

    const hasPest = plot.pest || Math.random() < pestChance;
    const totalDays = growthDaysMap[plot.plantType] || 3;
    let days = plot.daysPlanted || 0;

    // Storm partially rolls back mature crops
    if (nextWeather === 'storm' && days >= totalDays) {
      days = Math.max(0, days - 1);
    }

    const waterBonus = (plot.waterLevel > 0 || nextWeather === 'rainy' || nextWeather === 'storm') ? 1 : 0;
    const fertBonus  = plot.fertilized ? 1 : 0;
    // Always progress at least 1 day when healthy; water/fertilizer accelerate.
    const growthDays = hasPest ? days : days + 1 + waterBonus + fertBonus;

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

  const oldDay = garden.currentDay || 1;
  garden.currentDay = oldDay + 1;
  garden.weather = nextWeather;

  if (db.isConnected()) {
    await db.query(
      `UPDATE gardens
       SET plots = $1, current_day = $2, weather = $3, updated_at = NOW()
       WHERE user_id = $4`,
      [JSON.stringify(garden.plots), garden.currentDay, nextWeather, userId]
    );
    await recordSeasonScoresOnGardenSave(userId, oldDay, garden.currentDay);
    await touchLastActive(userId);
  } else {
    updateMemGardenDay(userId, garden.currentDay);
  }

  let serverUpdatedAt = null;
  if (db.isConnected()) {
    const after = await db.query(
      'SELECT updated_at FROM gardens WHERE user_id = $1',
      [userId]
    );
    if (after.rows[0]?.updated_at) {
      serverUpdatedAt = new Date(after.rows[0].updated_at).toISOString();
    }
  }

  emitGardenPreviewUpdated(req, userId);
  res.json({
    currentDay: garden.currentDay,
    weather: garden.weather,
    plots: garden.plots,
    serverUpdatedAt,
  });
});

// ── GET /api/garden/visit/:userId  — view another player's garden (read-only) ─

router.get('/visit/:targetId', requireAuth, async (req, res) => {
  // Validate targetId is a positive integer to prevent SQL injection / type confusion
  const targetId = req.params.targetId;
  if (!/^\d+$/.test(targetId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

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
module.exports.getMemInventory = (userId) => {
  if (!memGardens[userId]) memGardens[userId] = defaultGarden();
  if (!memGardens[userId].inventory) memGardens[userId].inventory = {};
  return memGardens[userId].inventory;
};
