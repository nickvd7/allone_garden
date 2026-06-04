/**
 * Village shop — server-validated purchases.
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { tradeLimiter } = require('../middleware/security');
const { listShopProducts } = require('../data/villageShop');
const { purchaseShopItem } = require('../lib/playerEconomy');

router.get('/:shopId/products', requireAuth, (req, res) => {
  const products = listShopProducts(req.params.shopId);
  if (!products.length) return res.status(404).json({ error: 'Unknown shop' });
  res.json({ shopId: req.params.shopId, products });
});

router.post('/buy', requireAuth, tradeLimiter, async (req, res) => {
  const { shopId, productId } = req.body || {};
  if (!shopId || !productId) {
    return res.status(400).json({ error: 'shopId and productId required' });
  }
  try {
    const result = await purchaseShopItem(req.user.userId, String(shopId), String(productId));
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    console.error('[village/shop] buy error:', err.message);
    return res.status(500).json({ error: 'Purchase failed' });
  }
});

module.exports = router;
