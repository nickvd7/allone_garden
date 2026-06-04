/**
 * Dorpswinkel catalogus — sync met frontend villageInteriors products.
 */
const SHOP_PRODUCTS = {
  'tools-shop': [
    { id: 'spray-pack', cost: 12, grant: { spray: 5 } },
    { id: 'seed-tomato', cost: 8, grant: { seed: 'tomato' } },
    { id: 'seed-carrot', cost: 6, grant: { seed: 'carrot' } },
    { id: 'seed-lettuce', cost: 6, grant: { seed: 'lettuce' } },
  ],
  'fertilizer-shop': [
    { id: 'fert-bag', cost: 15, grant: { fertilizer: 3 } },
    { id: 'fert-premium', cost: 22, grant: { fertilizer: 5 } },
    { id: 'compost-bale', cost: 18, grant: { fertilizer: 4, spray: 1 } },
    { id: 'seed-corn', cost: 10, grant: { seed: 'corn' } },
  ],
};

function getShopProduct(shopId, productId) {
  const list = SHOP_PRODUCTS[shopId];
  if (!list) return null;
  return list.find((p) => p.id === productId) || null;
}

function listShopProducts(shopId) {
  return SHOP_PRODUCTS[shopId] || [];
}

module.exports = { SHOP_PRODUCTS, getShopProduct, listShopProducts };
