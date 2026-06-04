/**
 * Kasteeldorp — één winkel per tegel langs de dorpssteeg.
 */
const WORLD_POIS = [
  {
    id: 'village-tools',
    type: 'shop',
    shopKind: 'tools',
    x: 12,
    y: 2,
    emoji: '🔧',
    label: { nl: 'Gereedschapswinkel', en: 'Tool shop' },
    interactRadius: 1,
    interiorId: 'tools-shop',
    enterOnInteract: true,
    villageBuilding: 'workshop',
  },
  {
    id: 'village-fertilizer',
    type: 'shop',
    shopKind: 'fertilizer',
    x: 14,
    y: 2,
    emoji: '🧪',
    label: { nl: 'Mest & zaad', en: 'Fertilizer & seed' },
    interactRadius: 1,
    interiorId: 'fertilizer-shop',
    enterOnInteract: true,
    villageBuilding: 'apothecary',
  },
  {
    id: 'village-market',
    type: 'market',
    x: 16,
    y: 2,
    emoji: '🏪',
    label: { nl: 'Markt', en: 'Market' },
    interactRadius: 1,
    interiorId: 'market-stall',
    enterOnInteract: true,
    villageBuilding: 'market',
  },
  {
    id: 'village-museum',
    type: 'museum',
    x: 18,
    y: 1,
    emoji: '🏛️',
    label: { nl: 'Museum', en: 'Museum' },
    interactRadius: 1,
    interiorId: 'museum',
    enterOnInteract: true,
    villageBuilding: 'castle-hall',
  },
  {
    id: 'village-cinema',
    type: 'cinema',
    x: 20,
    y: 1,
    emoji: '📺',
    label: { nl: 'Tuintips bioscoop', en: 'Garden tips cinema' },
    interactRadius: 1,
    interiorId: 'tips-cinema',
    enterOnInteract: true,
    villageBuilding: 'theater',
  },
];

function getWorldPois() {
  return WORLD_POIS;
}

function getWorldPoiById(id) {
  return WORLD_POIS.find((p) => p.id === id) || null;
}

module.exports = { WORLD_POIS, getWorldPois, getWorldPoiById };
