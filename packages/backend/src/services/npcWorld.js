/**
 * Server-side NPC gardens, patrol positions, and trade/collaboration offers.
 */
const db = require('../db');
const CROP_TYPES = ['tomato', 'carrot', 'lettuce', 'corn', 'potato', 'pumpkin'];

const { NPC_HOMES } = require('../utils/gardenSlotRules');

const NPC_DEFS = [
  { id: 'npc:mila', username: 'Mila', role: 'merchant', home: { x: NPC_HOMES[0].x, y: NPC_HOMES[0].y } },
  { id: 'npc:bo', username: 'Bo', role: 'helper', home: { x: NPC_HOMES[1].x, y: NPC_HOMES[1].y } },
  { id: 'npc:ivy', username: 'Ivy', role: 'trader', home: { x: NPC_HOMES[2].x, y: NPC_HOMES[2].y } },
];

const PLANT_EMOJI = {
  tomato: '🍅', carrot: '🥕', lettuce: '🥬', corn: '🌽', potato: '🥔', pumpkin: '🎃',
};

function defaultPlots(seedCrop) {
  return Array.from({ length: 9 }, (_, i) => ({
    tilled: true,
    planted: i % 3 !== 2,
    plantType: seedCrop,
    waterLevel: 1 + (i % 3),
    fertilized: i % 4 === 0,
    daysPlanted: 1 + (i % 3),
    pest: i === 4 && Math.random() < 0.15,
  }));
}

function patrolPath(home) {
  const pts = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) pts.push({ x: home.x + dx, y: home.y + dy });
  }
  return pts;
}

const state = {
  tick: 0,
  npcs: {},
  proposals: [],
  nextProposalId: 1,
};

function initNpcs() {
  NPC_DEFS.forEach((def, idx) => {
    const crop = CROP_TYPES[idx % CROP_TYPES.length];
    state.npcs[def.id] = {
      ...def,
      x: def.home.x,
      y: def.home.y,
      patrol: patrolPath(def.home),
      patrolIndex: 0,
      plots: defaultPlots(crop),
      inventory: { [crop]: 2 + idx, lettuce: 1 },
      mood: 'friendly',
      lastAction: 'Tuin verzorgd',
    };
  });
}

initNpcs();

function gardenPreview(plots) {
  const planted = plots.filter((p) => p.planted).length;
  const ready = plots.filter((p) => p.planted && (p.daysPlanted || 0) >= 2).length;
  const tiles = plots.slice(0, 9).map((p) => {
    if (!p.planted) return 0;
    if ((p.daysPlanted || 0) >= 2) return 2;
    return 1;
  });
  return { planted, ready, tiles };
}

function tickNpcs(onlineUserIds = []) {
  state.tick += 1;
  Object.values(state.npcs).forEach((npc, idx) => {
    // NPC's blijven op hun thuislocatie — geen patrol over de kaart.
    npc.x = npc.home.x;
    npc.y = npc.home.y;

    npc.plots = npc.plots.map((p, pi) => {
      if (!p.planted) return p;
      const next = { ...p, daysPlanted: (p.daysPlanted || 0) + (state.tick % 3 === 0 ? 1 : 0) };
      if (Math.random() < 0.04) next.pest = true;
      if (next.pest && Math.random() < 0.25) next.pest = false;
      if ((next.daysPlanted || 0) >= 3 && Math.random() < 0.12) {
        const crop = next.plantType || CROP_TYPES[pi % CROP_TYPES.length];
        npc.inventory[crop] = (npc.inventory[crop] || 0) + 1;
        return {
          tilled: true, planted: false, plantType: null, waterLevel: 0, daysPlanted: 0, pest: false,
        };
      }
      return next;
    });

    const actions = [
      'Wil graag oogst ruilen',
      'Zoekt hulp bij plagen',
      'Wil samen een vak bemesten',
      'Heeft extra zaad over',
    ];
    npc.lastAction = actions[state.tick % actions.length];
    npc.mood = npc.plots.some((p) => p.pest) ? 'needs_help' : 'friendly';

    if (onlineUserIds.length && state.tick % 5 === idx) {
      const target = onlineUserIds[state.tick % onlineUserIds.length];
      if (target && !String(target).startsWith('npc:')) {
        const crop = CROP_TYPES[(state.tick + idx) % CROP_TYPES.length];
        const want = CROP_TYPES[(state.tick + idx + 2) % CROP_TYPES.length];
        state.proposals.unshift({
          id: `npc-prop-${state.nextProposalId++}`,
          fromUserId: npc.id,
          fromUsername: npc.username,
          toUserId: String(target),
          kind: state.tick % 2 === 0 ? 'trade' : 'collaborate',
          status: 'pending',
          message: npc.lastAction,
          payload: state.tick % 2 === 0
            ? { offer: { [crop]: 1 }, request: { [want]: 1 } }
            : { task: 'shared_water', gardenHint: 'Bemest samen het middenvak' },
          createdAt: Date.now(),
          virtual: true,
        });
        state.proposals = state.proposals.slice(0, 40);
      }
    }
  });
}

function getNpcWorld() {
  return {
    tick: state.tick,
    npcs: Object.values(state.npcs).map((n) => ({
      id: n.id,
      username: n.username,
      role: n.role,
      x: n.x,
      y: n.y,
      home: n.home,
      plots: n.plots,
      inventory: n.inventory,
      mood: n.mood,
      lastAction: n.lastAction,
      preview: gardenPreview(n.plots),
      emoji: PLANT_EMOJI[n.plots.find((p) => p.planted)?.plantType] || '🌱',
    })),
    proposals: state.proposals.filter((p) => p.status === 'pending'),
  };
}

function getNpcProposal(id) {
  return state.proposals.find((p) => p.id === id) || null;
}

function respondNpcProposal(id, status) {
  const p = getNpcProposal(id);
  if (!p) return null;
  p.status = status;
  p.respondedAt = Date.now();
  return p;
}

async function applyNpcTrade(npcId, trade, playerUserId) {
  const npc = state.npcs[npcId];
  if (!npc || !trade) return { error: 'NPC not found', status: 404 };
  if ((npc.inventory[trade.offerCrop] || 0) < trade.offerQty) {
    return { error: 'NPC cannot complete trade right now', status: 400 };
  }

  const { deductCrop, addCrop, loadInventory } = require('../lib/inventory');

  if (!db.isConnected()) {
    const garden = require('../routes/garden');
    const inv = garden.getMemInventory(playerUserId);
    if ((inv[trade.wantCrop] || 0) < trade.wantQty) {
      return { error: 'You do not have enough to trade', status: 400 };
    }
    inv[trade.wantCrop] -= trade.wantQty;
    if (inv[trade.wantCrop] <= 0) delete inv[trade.wantCrop];
    inv[trade.offerCrop] = (inv[trade.offerCrop] || 0) + trade.offerQty;

    npc.inventory[trade.offerCrop] -= trade.offerQty;
    if (npc.inventory[trade.offerCrop] <= 0) delete npc.inventory[trade.offerCrop];
    npc.inventory[trade.wantCrop] = (npc.inventory[trade.wantCrop] || 0) + trade.wantQty;

    return { success: true, inventory: { ...inv }, npcInventory: { ...npc.inventory } };
  }

  const ok = await deductCrop(playerUserId, trade.wantCrop, trade.wantQty);
  if (!ok) return { error: 'You do not have enough to trade', status: 400 };
  await addCrop(playerUserId, trade.offerCrop, trade.offerQty);
  npc.inventory[trade.offerCrop] -= trade.offerQty;
  if (npc.inventory[trade.offerCrop] <= 0) delete npc.inventory[trade.offerCrop];
  npc.inventory[trade.wantCrop] = (npc.inventory[trade.wantCrop] || 0) + trade.wantQty;
  const inventory = await loadInventory(playerUserId);
  return { success: true, inventory, npcInventory: { ...npc.inventory } };
}

module.exports = {
  tickNpcs,
  getNpcWorld,
  getNpcProposal,
  respondNpcProposal,
  applyNpcTrade,
  NPC_DEFS,
};
