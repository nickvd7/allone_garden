/**
 * Fallback POI-config — sync met backend/src/data/worldPois.js
 * Kasteeldorp: één gebouw per tegel langs de steeg.
 */
export const FALLBACK_WORLD_POIS = [
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

export function poiAt(pois, x, y) {
  return (pois || []).find((p) => p.x === x && p.y === y) || null;
}

export function poiNear(pois, x, y, radius = 0) {
  return (pois || []).find((p) => {
    const r = p.interactRadius ?? radius;
    return Math.abs(p.x - x) <= r && Math.abs(p.y - y) <= r;
  }) || null;
}

export function localizedField(field, lang = 'nl') {
  if (!field) return '';
  if (typeof field === 'string') return field;
  return field[lang] || field.nl || field.en || '';
}

export function poiWithInterior(poi) {
  return poi?.interiorId && poi.enterOnInteract;
}

/** Tegels binnen het kasteeldorp (voor styling op de wereldkaart). */
export function isVillageTile(x, y) {
  return x >= 10 && x <= 22 && y >= 1 && y <= 4;
}
