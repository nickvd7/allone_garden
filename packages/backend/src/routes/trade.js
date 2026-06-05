/**
 * Trade / marketplace routes.
 * Uses PostgreSQL when available, falls back to in-memory store.
 */
const router = require('express').Router();
const db     = require('../db');
const { requireAuth }                         = require('../middleware/auth');
const { tradeLimiter }                        = require('../middleware/security');
const { validateCreateListing, validateBuy }  = require('../middleware/validate');
const { loadInventory, deductCrop } = require('../lib/inventory');

const CROP_BASE_PRICES = {
  tomato: 20, carrot: 15, lettuce: 16, radish: 12, corn: 24,
  potato: 18, pumpkin: 30, sunflower: 22, blueberry: 26,
};

// In-memory fallback
const memListings = {};
let memNextId = 1;

// ── GET /api/trade/listings ───────────────────────────────────────────────────

router.get('/listings', async (req, res) => {
  if (db.isConnected()) {
    const result = await db.query(
      `SELECT tl.id, tl.crop_id, tl.quantity, tl.price_per_unit, tl.created_at,
              u.username AS seller_name, u.id AS seller_id
       FROM trade_listings tl
       JOIN users u ON tl.seller_id = u.id
       ORDER BY tl.created_at DESC
       LIMIT 100`
    );
    return res.json(result.rows);
  }

  res.json(Object.values(memListings));
});

// ── POST /api/trade/listings — create a listing ───────────────────────────────

router.post('/listings', requireAuth, tradeLimiter, validateCreateListing, async (req, res) => {
  const { userId } = req.user;
  const { cropId, quantity, pricePerUnit } = req.body;

  if (!cropId || !quantity || !pricePerUnit) {
    return res.status(400).json({ error: 'cropId, quantity and pricePerUnit required' });
  }
  if (quantity <= 0 || pricePerUnit <= 0) {
    return res.status(400).json({ error: 'quantity and pricePerUnit must be positive' });
  }

  if (db.isConnected()) {
    // Wrap in a transaction so the inventory check + deduction + listing insert
    // are atomic — prevents a double-spend race condition.
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Lock the inventory row for this crop while we check and deduct
      const inv = await client.query(
        'SELECT quantity FROM inventory WHERE user_id = $1 AND plant_type = $2 FOR UPDATE',
        [userId, cropId]
      );
      if (!inv.rows[0] || inv.rows[0].quantity < quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Not enough crops in inventory' });
      }

      // Deduct from inventory
      await client.query(
        'UPDATE inventory SET quantity = quantity - $1 WHERE user_id = $2 AND plant_type = $3',
        [quantity, userId, cropId]
      );

      const result = await client.query(
        `INSERT INTO trade_listings (seller_id, crop_id, quantity, price_per_unit)
         VALUES ($1, $2, $3, $4)
         RETURNING id, seller_id, crop_id, quantity, price_per_unit, created_at`,
        [userId, cropId, quantity, pricePerUnit]
      );

      await client.query('COMMIT');
      return res.status(201).json(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[trade] listing creation error:', err.message);
      return res.status(500).json({ error: 'Failed to create listing' });
    } finally {
      client.release();
    }
  }

  const listing = {
    id: memNextId++,
    sellerId: userId,
    sellerName: req.user.username,
    cropId,
    quantity,
    pricePerUnit,
    createdAt: new Date(),
  };
  memListings[listing.id] = listing;
  res.status(201).json(listing);
});

// ── POST /api/trade/buy/:listingId ────────────────────────────────────────────

router.post('/buy/:listingId', requireAuth, tradeLimiter, validateBuy, async (req, res) => {
  const { userId } = req.user;
  const listingId = parseInt(req.params.listingId, 10);
  const qty = parseInt(req.body.quantity || 1, 10);

  if (db.isConnected()) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const lResult = await client.query(
        'SELECT * FROM trade_listings WHERE id = $1 FOR UPDATE',
        [listingId]
      );
      const listing = lResult.rows[0];
      if (!listing) throw Object.assign(new Error('Listing not found'), { status: 404 });
      if (listing.seller_id === userId) throw Object.assign(new Error('Cannot buy your own listing'), { status: 400 });
      if (qty > listing.quantity) throw Object.assign(new Error(`Only ${listing.quantity} available`), { status: 400 });

      const totalCost = qty * listing.price_per_unit;

      // Check buyer coins
      const buyerResult = await client.query('SELECT coins FROM users WHERE id = $1', [userId]);
      const buyer = buyerResult.rows[0];
      if (buyer.coins < totalCost) throw Object.assign(new Error('Not enough coins'), { status: 400 });

      // Transfer coins
      await client.query('UPDATE users SET coins = coins - $1 WHERE id = $2', [totalCost, userId]);
      await client.query('UPDATE users SET coins = coins + $1 WHERE id = $2', [totalCost, listing.seller_id]);

      // Give crops to buyer
      await client.query(
        `INSERT INTO inventory (user_id, plant_type, quantity) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, plant_type) DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity`,
        [userId, listing.crop_id, qty]
      );

      // Reduce / remove listing
      if (qty === listing.quantity) {
        await client.query('DELETE FROM trade_listings WHERE id = $1', [listingId]);
      } else {
        await client.query('UPDATE trade_listings SET quantity = quantity - $1 WHERE id = $2', [qty, listingId]);
      }

      // Record trade history
      await client.query(
        `INSERT INTO trade_history (listing_id, seller_id, buyer_id, crop_id, quantity, total_coins)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [listingId, listing.seller_id, userId, listing.crop_id, qty, totalCost]
      );

      await client.query('COMMIT');
      return res.json({ success: true, cropId: listing.crop_id, quantity: qty, totalCost });
    } catch (err) {
      await client.query('ROLLBACK');
      return res.status(err.status || 500).json({ error: err.message });
    } finally {
      client.release();
    }
  }

  // In-memory fallback
  const listing = memListings[listingId];
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.sellerId === userId) return res.status(400).json({ error: 'Cannot buy your own listing' });
  if (qty > listing.quantity) return res.status(400).json({ error: `Only ${listing.quantity} available` });

  listing.quantity -= qty;
  if (listing.quantity === 0) delete memListings[listingId];

  res.json({ success: true, cropId: listing.cropId, quantity: qty, totalCost: qty * listing.pricePerUnit });
});

// ── DELETE /api/trade/listings/:listingId — cancel your own listing ───────────

router.delete('/listings/:listingId', requireAuth, async (req, res) => {
  const { userId } = req.user;
  const listingId = parseInt(req.params.listingId, 10);

  if (db.isConnected()) {
    const result = await db.query(
      'DELETE FROM trade_listings WHERE id = $1 AND seller_id = $2 RETURNING crop_id, quantity',
      [listingId, userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Listing not found or not yours' });

    // Return items to inventory
    const { crop_id, quantity } = result.rows[0];
    await db.query(
      `INSERT INTO inventory (user_id, plant_type, quantity) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, plant_type) DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity`,
      [userId, crop_id, quantity]
    );

    return res.json({ success: true });
  }

  const listing = memListings[listingId];
  if (!listing || listing.sellerId !== userId) {
    return res.status(404).json({ error: 'Listing not found or not yours' });
  }
  delete memListings[listingId];
  res.json({ success: true });
});

// ── POST /api/trade/quick-sell — direct NPC-style sale at marketplace ─────────

router.post('/quick-sell', requireAuth, tradeLimiter, async (req, res) => {
  const { userId } = req.user;
  const cropId = String(req.body.cropId || '');
  const quantity = Math.max(1, parseInt(req.body.quantity, 10) || 1);
  const pricePerUnit = Math.max(
    1,
    parseInt(req.body.pricePerUnit, 10) || CROP_BASE_PRICES[cropId] || 10,
  );
  const siloBonus = Number(req.body.siloBonus) > 1 ? Number(req.body.siloBonus) : 1;
  const earned = Math.round(quantity * pricePerUnit * siloBonus);

  if (!CROP_BASE_PRICES[cropId]) {
    return res.status(400).json({ error: 'Invalid crop' });
  }

  if (db.isConnected()) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const inv = await client.query(
        'SELECT quantity FROM inventory WHERE user_id = $1 AND plant_type = $2 FOR UPDATE',
        [userId, cropId],
      );
      if (!inv.rows[0] || inv.rows[0].quantity < quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Not enough crops in inventory' });
      }
      await client.query(
        'UPDATE inventory SET quantity = quantity - $1 WHERE user_id = $2 AND plant_type = $3',
        [quantity, userId, cropId],
      );
      await client.query('UPDATE users SET coins = coins + $1 WHERE id = $2', [earned, userId]);
      const coinsResult = await client.query('SELECT coins FROM users WHERE id = $1', [userId]);
      await client.query('COMMIT');
      const inventory = await loadInventory(userId);
      const { refreshMemEntryFromDb } = require('../lib/playerStats');
      await refreshMemEntryFromDb(userId);
      return res.json({
        success: true,
        earned,
        coins: coinsResult.rows[0]?.coins || 0,
        inventory,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[trade] quick-sell error:', err.message);
      return res.status(500).json({ error: 'Quick sell failed' });
    } finally {
      client.release();
    }
  }

  res.json({ success: true, earned, inventory: {} });
});

// ── GET /api/trade/inventory ──────────────────────────────────────────────────

router.get('/inventory', requireAuth, async (req, res) => {
  const inventory = db.isConnected()
    ? await loadInventory(req.user.userId)
    : {};
  res.json({ inventory });
});

module.exports = router;
