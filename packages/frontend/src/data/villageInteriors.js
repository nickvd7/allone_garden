/**
 * Beloopbare interieurs voor het dorp — sync conceptueel met backend worldPois interiorId.
 */
import { localizedField } from '../utils/worldPois';

export const INTERIOR_TILE = {
  '.': 'floor',
  W: 'wall',
  F: 'floor',
  E: 'exhibit',
  D: 'door',
  S: 'screen',
  C: 'counter',
  A: 'seat',
};

/** Map a cinema screen column to a film (cycles if fewer films than screens). */
export function screenFilmAt(interior, x) {
  const films = interior?.films || [];
  if (!films.length) return null;
  return films[Math.max(0, x - 1) % films.length];
}

function grid(rows) {
  return rows.map((row) => row.split(''));
}

export const VILLAGE_INTERIORS = {
  museum: {
    id: 'museum',
    emoji: '🏛️',
    theme: 'castle-hall',
    title: { nl: 'Museum van de Moestuin', en: 'Vegetable Garden Museum' },
    subtitle: {
      nl: 'Loop door de zalen en bekijk de tentoonstelling.',
      en: 'Walk through the halls and view the exhibition.',
    },
    width: 14,
    height: 9,
    spawn: { x: 7, y: 7 },
    exit: { x: 7, y: 8 },
    grid: grid([
      'WWWWWWWWWWWWWW',
      'WEE......EEW',
      'W..EE....EE.W',
      'W..........W',
      'W..EE....EE.W',
      'W..........W',
      'WEE......EEW',
      'W.....D....W',
      'WWWWWWWWWWWW',
    ]),
    exhibits: [
      {
        id: 'seeds-through-time',
        x: 1,
        y: 1,
        heading: { nl: 'Zaden door de tijd', en: 'Seeds through time' },
        body: {
          nl: 'Van wilde kruiden tot moderne F1-hybriden: elke generatie tuiniers bewaarde het beste zaad voor volgend jaar.',
          en: 'From wild herbs to modern hybrids — every generation saved the best seed for next year.',
        },
        imageEmoji: '📜',
      },
      {
        id: 'seed-to-harvest',
        x: 2,
        y: 1,
        heading: { nl: 'Van zaad tot oogst', en: 'From seed to harvest' },
        body: {
          nl: 'Omspitten, zaaien, water, bemesten, oogsten — de cyclus die elke moestuin verbindt.',
          en: 'Till, sow, water, fertilize, harvest — the cycle every garden shares.',
        },
        imageEmoji: '🌱',
      },
      {
        id: 'portrait-vos',
        x: 11,
        y: 1,
        heading: { nl: 'Portret: Mevrouw Vos', en: 'Portrait: Mrs. Vos' },
        body: {
          nl: 'Legendarische tuinier uit 1924. Haar dagboek inspireerde het companion-planting paviljoen.',
          en: 'Legendary gardener from 1924. Her diary inspired the companion planting wing.',
        },
        imageEmoji: '🖼️',
      },
      {
        id: 'companion-wing',
        x: 12,
        y: 1,
        heading: { nl: 'Companion planting', en: 'Companion planting' },
        body: {
          nl: 'Tomaten naast basilicum, wortels naast uien — buren die elkaar helpen in de rij.',
          en: 'Tomatoes beside basil, carrots beside onions — neighbours helping in the row.',
        },
        imageEmoji: '🤝',
      },
      {
        id: 'tools-exhibit',
        x: 3,
        y: 2,
        heading: { nl: 'Gereedschap van vroeger', en: 'Tools of the past' },
        body: {
          nl: 'Houten schoffels en koperen gieters — vandaag doe je hetzelfde met emoji\'s op je telefoon.',
          en: 'Wooden spades and copper watering cans — today you do the same with emojis on your phone.',
        },
        imageEmoji: '⛏️',
      },
      {
        id: 'harvest-festival',
        x: 8,
        y: 2,
        heading: { nl: 'Oogstfeest 1890', en: 'Harvest festival 1890' },
        body: {
          nl: 'Dummy-expositie: een schilderij van de jaarlijkse oogstmarkt op het dorpsplein.',
          en: 'Dummy exhibition: a painting of the annual harvest market on the village square.',
        },
        imageEmoji: '🎃',
      },
      {
        id: 'soil-science',
        x: 3,
        y: 4,
        heading: { nl: 'Bodem & compost', en: 'Soil & compost' },
        body: {
          nl: 'Levende bodem is de basis. Compost, wormen en mulch houden je percelen vruchtbaar.',
          en: 'Living soil is the foundation. Compost, worms and mulch keep beds fertile.',
        },
        imageEmoji: '🪱',
      },
      {
        id: 'water-art',
        x: 8,
        y: 4,
        heading: { nl: 'Water in de kunst', en: 'Water in art' },
        body: {
          nl: 'Impressionistische tuinen tonen hoe licht en druppels samen groei vormgeven.',
          en: 'Impressionist gardens show how light and droplets shape growth together.',
        },
        imageEmoji: '💧',
      },
      {
        id: 'future-garden',
        x: 1,
        y: 6,
        heading: { nl: 'Tuin van morgen', en: 'Garden of tomorrow' },
        body: {
          nl: 'Sensoren, regenwater en gedeelde moestuinen — jij loopt al in die toekomst.',
          en: 'Sensors, rainwater and shared gardens — you are already walking in that future.',
        },
        imageEmoji: '🔮',
      },
      {
        id: 'community-plots',
        x: 11,
        y: 6,
        heading: { nl: 'Gedeelde percelen', en: 'Shared plots' },
        body: {
          nl: 'Twaalf tuinplekken, oneindig veel buren. Ruil, chat en oogst samen op het plein.',
          en: 'Twelve garden spots, endless neighbours. Trade, chat and harvest together on the square.',
        },
        imageEmoji: '🏘️',
      },
    ],
  },

  'tips-cinema': {
    id: 'tips-cinema',
    emoji: '📺',
    theme: 'theater',
    title: { nl: 'Tuintips bioscoop', en: 'Garden tips cinema' },
    subtitle: {
      nl: 'Ga zitten voor het scherm — kies een film over tuinieren.',
      en: 'Sit in front of the screen — pick a film about gardening.',
    },
    width: 12,
    height: 8,
    spawn: { x: 6, y: 5 },
    exit: { x: 6, y: 6 },
    grid: grid([
      'WWWWWWWWWWWW',
      'WSSSSSSSSSSW',
      'W..........W',
      'W..AA..AA..W',
      'W..AA..AA..W',
      'W..........W',
      'W.....D....W',
      'WWWWWWWWWWWW',
    ]),
    screenRow: 1,
    audienceRows: [3, 4],
    films: [
      {
        id: 'compost-basics',
        title: { nl: 'Compost maken', en: 'Making compost' },
        body: {
          nl: 'Basis compost voor een gezonde moestuin.',
          en: 'Compost basics for a healthy vegetable garden.',
        },
        youtubeId: 'AP9fL9B_-F8',
      },
      {
        id: 'water-rhythm',
        title: { nl: 'Water geven', en: 'Watering' },
        body: {
          nl: 'Diep water geven in plaats van elke dag een beetje.',
          en: 'Deep watering instead of a little every day.',
        },
        youtubeId: 'ysz5S6PUM-U',
      },
      {
        id: 'companion-planting',
        title: { nl: 'Companion planting', en: 'Companion planting' },
        body: {
          nl: 'Welke planten elkaar versterken in de rij.',
          en: 'Which plants strengthen each other in the row.',
        },
        youtubeId: '3JZ_D3ELwOQ',
      },
      {
        id: 'beginner-veg',
        title: { nl: 'Moestuin voor beginners', en: 'Veg garden for beginners' },
        body: {
          nl: 'Eerste stappen: bedden, zaaien en onderhoud.',
          en: 'First steps: beds, sowing and maintenance.',
        },
        youtubeId: 'LURM8g1_Noc',
      },
      {
        id: 'raised-beds',
        title: { nl: 'Verhoogde bedden', en: 'Raised beds' },
        body: {
          nl: 'Bouwen en beplanten van verhoogde moestuinbedden.',
          en: 'Building and planting raised vegetable beds.',
        },
        youtubeId: 'bLDElvA9Cmc',
      },
    ],
  },

  'tools-shop': {
    id: 'tools-shop',
    emoji: '🔧',
    theme: 'workshop',
    title: { nl: 'Gereedschapswinkel', en: 'Tool shop' },
    subtitle: { nl: 'Spuitbus, zaad & handgereedschap.', en: 'Spray, seeds & hand tools.' },
    width: 10,
    height: 7,
    spawn: { x: 5, y: 5 },
    exit: { x: 5, y: 6 },
    grid: grid([
      'WWWWWWWWWW',
      'W........W',
      'W..CCCC..W',
      'W..CCCC..W',
      'W........W',
      'W....D...W',
      'WWWWWWWWWW',
    ]),
    shopKind: 'tools',
    products: [
      { id: 'spray-pack', emoji: '🧴', name: { nl: 'Spuitbus (5×)', en: 'Spray bottle (5×)' }, cost: 12, grant: { spray: 5 } },
      { id: 'seed-tomato', emoji: '🍅', name: { nl: 'Tomatenzaad', en: 'Tomato seeds' }, cost: 8, grant: { seed: 'tomato' } },
      { id: 'seed-carrot', emoji: '🥕', name: { nl: 'Wortelzaad', en: 'Carrot seeds' }, cost: 6, grant: { seed: 'carrot' } },
      { id: 'seed-lettuce', emoji: '🥬', name: { nl: 'Sla zaad', en: 'Lettuce seeds' }, cost: 6, grant: { seed: 'lettuce' } },
    ],
  },

  'fertilizer-shop': {
    id: 'fertilizer-shop',
    emoji: '🧪',
    theme: 'apothecary',
    title: { nl: 'Mest & zaad', en: 'Fertilizer & seed' },
    subtitle: { nl: 'Bemesting en biologische meststoffen.', en: 'Fertilizer and organic nutrients.' },
    width: 10,
    height: 7,
    spawn: { x: 5, y: 5 },
    exit: { x: 5, y: 6 },
    grid: grid([
      'WWWWWWWWWW',
      'W........W',
      'W..CCCC..W',
      'W..CCCC..W',
      'W........W',
      'W....D...W',
      'WWWWWWWWWW',
    ]),
    shopKind: 'fertilizer',
    products: [
      { id: 'fert-bag', emoji: '🧪', name: { nl: 'Bemesting (3×)', en: 'Fertilizer (3×)' }, cost: 15, grant: { fertilizer: 3 } },
      { id: 'fert-premium', emoji: '⭐', name: { nl: 'Premium mest (5×)', en: 'Premium feed (5×)' }, cost: 22, grant: { fertilizer: 5 } },
      { id: 'compost-bale', emoji: '🌿', name: { nl: 'Compostbaal', en: 'Compost bale' }, cost: 18, grant: { fertilizer: 4, spray: 1 } },
      { id: 'seed-corn', emoji: '🌽', name: { nl: 'Maïszaad', en: 'Corn seeds' }, cost: 10, grant: { seed: 'corn' } },
    ],
  },

  'market-stall': {
    id: 'market-stall',
    emoji: '🏪',
    theme: 'market',
    title: { nl: 'Marktstallen', en: 'Market stalls' },
    subtitle: { nl: 'Verkoop oogst en ruil met andere spelers.', en: 'Sell harvest and trade with other players.' },
    width: 12,
    height: 7,
    spawn: { x: 6, y: 5 },
    exit: { x: 6, y: 6 },
    grid: grid([
      'WWWWWWWWWWWW',
      'W....CC....W',
      'W....CC....W',
      'W..........W',
      'W..........W',
      'W.....D....W',
      'WWWWWWWWWWWW',
    ]),
    shopKind: 'market',
  },
};

export function getInteriorById(id) {
  return VILLAGE_INTERIORS[id] || null;
}

export function tileAtInterior(interior, x, y) {
  if (!interior?.grid || x < 0 || y < 0 || x >= interior.width || y >= interior.height) {
    return INTERIOR_TILE.W;
  }
  const row = interior.grid[y];
  if (!row || x >= row.length) return INTERIOR_TILE.W;
  const ch = row[x];
  return INTERIOR_TILE[ch] || INTERIOR_TILE['.'];
}

export function isInteriorPassable(interior, x, y) {
  const t = tileAtInterior(interior, x, y);
  return t !== INTERIOR_TILE.W && t !== INTERIOR_TILE.S;
}

export function exhibitAt(interior, x, y) {
  return (interior.exhibits || []).find((e) => e.x === x && e.y === y) || null;
}

export function localizedInteriorField(field, lang) {
  return localizedField(field, lang);
}
