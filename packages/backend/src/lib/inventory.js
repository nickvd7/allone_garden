/**
 * Server-side crop inventory (trade + marketplace).
 */
const db = require('../db');

const VALID_CROPS = new Set([
  'tomato', 'carrot', 'lettuce', 'radish', 'corn',
  'potato', 'pumpkin', 'sunflower', 'blueberry',
]);

const SUPPLY_TYPES = new Set(['fertilizer', 'spray', 'egg', 'milk']);

const VALID_INVENTORY_ITEMS = new Set([...VALID_CROPS, ...SUPPLY_TYPES]);

function normalizeInventory(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  Object.entries(raw).forEach(([crop, qty]) => {
    if (!VALID_INVENTORY_ITEMS.has(crop)) return;
    const n = Math.max(0, Math.floor(Number(qty) || 0));
    if (n > 0) out[crop] = n;
  });
  return out;
}

async function loadInventory(userId) {
  if (!db.isConnected()) return {};
  const result = await db.query(
    'SELECT plant_type, quantity FROM inventory WHERE user_id = $1 AND quantity > 0',
    [userId],
  );
  const out = {};
  result.rows.forEach((row) => {
    if (VALID_INVENTORY_ITEMS.has(row.plant_type) && row.quantity > 0) {
      out[row.plant_type] = row.quantity;
    }
  });
  return out;
}

async function addCrop(userId, cropId, quantity = 1) {
  if (!VALID_CROPS.has(cropId) || quantity <= 0) return null;
  if (!db.isConnected()) return { [cropId]: quantity };
  await db.query(
    `INSERT INTO inventory (user_id, plant_type, quantity) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, plant_type) DO UPDATE
       SET quantity = inventory.quantity + EXCLUDED.quantity`,
    [userId, cropId, quantity],
  );
  return loadInventory(userId);
}

async function deductCrop(userId, cropId, quantity = 1) {
  if (!VALID_CROPS.has(cropId) || quantity <= 0) return false;
  if (!db.isConnected()) return true;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const inv = await client.query(
      'SELECT quantity FROM inventory WHERE user_id = $1 AND plant_type = $2 FOR UPDATE',
      [userId, cropId],
    );
    if (!inv.rows[0] || inv.rows[0].quantity < quantity) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query(
      'UPDATE inventory SET quantity = quantity - $1 WHERE user_id = $2 AND plant_type = $3',
      [quantity, userId, cropId],
    );
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function syncInventory(userId, inventoryObj) {
  const normalized = normalizeInventory(inventoryObj);
  if (!db.isConnected()) return normalized;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT plant_type, quantity FROM inventory WHERE user_id = $1',
      [userId],
    );
    const prev = {};
    existing.rows.forEach((row) => { prev[row.plant_type] = row.quantity; });
    const allCrops = new Set([...Object.keys(prev), ...Object.keys(normalized)]);
    for (const crop of allCrops) {
      const nextQty = normalized[crop] || 0;
      const prevQty = prev[crop] || 0;
      if (nextQty === prevQty) continue;
      if (nextQty <= 0) {
        await client.query(
          'DELETE FROM inventory WHERE user_id = $1 AND plant_type = $2',
          [userId, crop],
        );
      } else {
        await client.query(
          `INSERT INTO inventory (user_id, plant_type, quantity) VALUES ($1, $2, $3)
           ON CONFLICT (user_id, plant_type) DO UPDATE SET quantity = EXCLUDED.quantity`,
          [userId, crop, nextQty],
        );
      }
    }
    await client.query('COMMIT');
    return loadInventory(userId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  VALID_CROPS,
  SUPPLY_TYPES,
  VALID_INVENTORY_ITEMS,
  normalizeInventory,
  loadInventory,
  addCrop,
  deductCrop,
  syncInventory,
};
