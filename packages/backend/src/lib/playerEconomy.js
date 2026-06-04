/**
 * Server-side coins, supplies & atomic player trades.
 */
const db = require('../db');
const { loadInventory, addCrop, deductCrop, VALID_CROPS } = require('./inventory');
const { normalizeTradePayload } = require('./proposalPayload');

const SUPPLY_TYPES = new Set(['fertilizer', 'spray', 'egg', 'milk']);
const VALID_ITEMS = new Set([...VALID_CROPS, ...SUPPLY_TYPES]);

function isValidItem(id) {
  return VALID_ITEMS.has(id);
}

async function getCoins(userId) {
  if (db.isConnected()) {
    const r = await db.query('SELECT coins FROM users WHERE id = $1', [userId]);
    return r.rows[0]?.coins ?? 0;
  }
  const user = getMemUser(userId);
  return user?.coins ?? 0;
}

async function addSupply(userId, itemId, qty) {
  if (!isValidItem(itemId) || qty <= 0) return null;
  if (VALID_CROPS.has(itemId)) {
    return addCrop(userId, itemId, qty);
  }
  if (!db.isConnected()) {
    const inv = getMemInventory(userId);
    inv[itemId] = (inv[itemId] || 0) + qty;
    return { ...inv };
  }
  await db.query(
    `INSERT INTO inventory (user_id, plant_type, quantity) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, plant_type) DO UPDATE
       SET quantity = inventory.quantity + EXCLUDED.quantity`,
    [userId, itemId, qty],
  );
  return loadInventory(userId);
}

async function purchaseShopItem(userId, shopId, productId) {
  const { getShopProduct } = require('../data/villageShop');
  const product = getShopProduct(shopId, productId);
  if (!product) return { error: 'Unknown product', status: 400 };

  if (!db.isConnected()) {
    const user = getMemUser(userId);
    if (!user) return { error: 'User not found', status: 404 };
    if ((user.coins || 0) < product.cost) return { error: 'Not enough coins', status: 400 };
    user.coins -= product.cost;
    const inventory = getMemInventory(userId);
    if (product.grant?.fertilizer) inventory.fertilizer = (inventory.fertilizer || 0) + product.grant.fertilizer;
    if (product.grant?.spray) inventory.spray = (inventory.spray || 0) + product.grant.spray;
    if (product.grant?.seed && VALID_CROPS.has(product.grant.seed)) {
      inventory[product.grant.seed] = (inventory[product.grant.seed] || 0) + 1;
    }
    return {
      success: true,
      coins: user.coins,
      inventory: { ...inventory },
      selectedSeed: product.grant?.seed || null,
      selectedTool: product.grant?.seed ? 'plant' : null,
    };
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const coinRow = await client.query(
      'SELECT coins FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );
    if (!coinRow.rows[0]) {
      await client.query('ROLLBACK');
      return { error: 'User not found', status: 404 };
    }
    if (coinRow.rows[0].coins < product.cost) {
      await client.query('ROLLBACK');
      return { error: 'Not enough coins', status: 400 };
    }
    await client.query(
      'UPDATE users SET coins = coins - $1 WHERE id = $2',
      [product.cost, userId],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  if (product.grant?.fertilizer) await addSupply(userId, 'fertilizer', product.grant.fertilizer);
  if (product.grant?.spray) await addSupply(userId, 'spray', product.grant.spray);
  if (product.grant?.seed && VALID_CROPS.has(product.grant.seed)) {
    await addCrop(userId, product.grant.seed, 1);
  }

  const inventory = await loadInventory(userId);
  const coins = await getCoins(userId);
  return {
    success: true,
    coins,
    inventory,
    selectedSeed: product.grant?.seed || null,
    selectedTool: product.grant?.seed ? 'plant' : null,
  };
}

async function executePlayerTrade(accepterId, proposerId, rawPayload) {
  const trade = normalizeTradePayload(rawPayload);
  if (!trade || !trade.offerCrop || !trade.wantCrop || trade.offerQty < 1 || trade.wantQty < 1) {
    return { error: 'Invalid trade payload', status: 400 };
  }
  if (!VALID_CROPS.has(trade.offerCrop) || !VALID_CROPS.has(trade.wantCrop)) {
    return { error: 'Invalid crop in trade', status: 400 };
  }

  // Proposer offers offerCrop; accepter offers wantCrop
  const fromId = Number(proposerId);
  const toId = Number(accepterId);

  if (!db.isConnected()) {
    const proposerInv = getMemInventory(fromId);
    const accepterInv = getMemInventory(toId);
    if ((proposerInv[trade.offerCrop] || 0) < trade.offerQty) {
      return { error: 'Proposer has insufficient offer', status: 400 };
    }
    if ((accepterInv[trade.wantCrop] || 0) < trade.wantQty) {
      return { error: 'You do not have enough to trade', status: 400 };
    }
    proposerInv[trade.offerCrop] -= trade.offerQty;
    if (proposerInv[trade.offerCrop] <= 0) delete proposerInv[trade.offerCrop];
    proposerInv[trade.wantCrop] = (proposerInv[trade.wantCrop] || 0) + trade.wantQty;

    accepterInv[trade.wantCrop] -= trade.wantQty;
    if (accepterInv[trade.wantCrop] <= 0) delete accepterInv[trade.wantCrop];
    accepterInv[trade.offerCrop] = (accepterInv[trade.offerCrop] || 0) + trade.offerQty;

    return {
      success: true,
      proposerInventory: { ...proposerInv },
      accepterInventory: { ...accepterInv },
    };
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const proposerOffer = await client.query(
      'SELECT quantity FROM inventory WHERE user_id = $1 AND plant_type = $2 FOR UPDATE',
      [fromId, trade.offerCrop],
    );
    if (!proposerOffer.rows[0] || proposerOffer.rows[0].quantity < trade.offerQty) {
      await client.query('ROLLBACK');
      return { error: 'Proposer has insufficient offer', status: 400 };
    }

    const accepterOffer = await client.query(
      'SELECT quantity FROM inventory WHERE user_id = $1 AND plant_type = $2 FOR UPDATE',
      [toId, trade.wantCrop],
    );
    if (!accepterOffer.rows[0] || accepterOffer.rows[0].quantity < trade.wantQty) {
      await client.query('ROLLBACK');
      return { error: 'You do not have enough to trade', status: 400 };
    }

    await client.query(
      'UPDATE inventory SET quantity = quantity - $1 WHERE user_id = $2 AND plant_type = $3',
      [trade.offerQty, fromId, trade.offerCrop],
    );
    await client.query(
      'UPDATE inventory SET quantity = quantity - $1 WHERE user_id = $2 AND plant_type = $3',
      [trade.wantQty, toId, trade.wantCrop],
    );

    await client.query(
      `INSERT INTO inventory (user_id, plant_type, quantity) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, plant_type) DO UPDATE
         SET quantity = inventory.quantity + EXCLUDED.quantity`,
      [toId, trade.offerCrop, trade.offerQty],
    );
    await client.query(
      `INSERT INTO inventory (user_id, plant_type, quantity) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, plant_type) DO UPDATE
         SET quantity = inventory.quantity + EXCLUDED.quantity`,
      [fromId, trade.wantCrop, trade.wantQty],
    );

    await client.query('COMMIT');

    return {
      success: true,
      proposerInventory: await loadInventory(fromId),
      accepterInventory: await loadInventory(toId),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function getMemUser(userId) {
  try {
    const auth = require('../routes/auth');
    return auth.getMemUserById?.(userId) || null;
  } catch {
    return null;
  }
}

function getMemInventory(userId) {
  try {
    const garden = require('../routes/garden');
    return garden.getMemInventory?.(userId) || {};
  } catch {
    return {};
  }
}

module.exports = {
  VALID_ITEMS,
  isValidItem,
  getCoins,
  addSupply,
  purchaseShopItem,
  executePlayerTrade,
};
