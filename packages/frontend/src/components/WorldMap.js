/**
 * WorldMap — top-down walking world (Mario-style)
 *
 * Arrow keys / WASD  → move character 🧑‍🌾
 * Walk to a 🏡        → press E / Enter to visit garden
 * Walk near a player  → right panel shows proximity chat + video call button
 */
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../hooks/useApi';
import { SEEDS } from './ToolsPanel';

// ─── Map constants ────────────────────────────────────────────────────────────
const TILE   = 52;
const MAP_W  = 32;
const MAP_H  = 20;
const VIEW_W = 11;
const VIEW_H = 9;
/** Wereldrand (tegels) pas in beeld als de speler dichter bij die kant komt */
const WORLD_EDGE_REVEAL = 3;
const EMBEDDED_VIEW_W = 16;
const EMBEDDED_VIEW_H = 10;
const EMBEDDED_MIN_VIEW_W = 11;
const EMBEDDED_MIN_VIEW_H = 9;

// Tile type codes
const G = 0;  // grass
const P = 1;  // dirt path
const W = 2;  // water   (impassable)
const T = 3;  // tree    (impassable)
const D = 4;  // desert  (passable)
const M = 5;  // mountain (impassable)

const BASE_MAP = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => G));
for (let y = 0; y < MAP_H; y += 1) BASE_MAP[y][Math.floor(MAP_W / 2)] = P;
for (let x = 0; x < MAP_W; x += 1) BASE_MAP[Math.floor(MAP_H / 2)][x] = P;

[
  [4, 3], [5, 3], [6, 3], [4, 4], [5, 4], [6, 4],
  [25, 3], [26, 3], [27, 3], [25, 4], [26, 4], [27, 4],
  [4, 15], [5, 15], [6, 15], [4, 16], [5, 16], [6, 16],
  [25, 15], [26, 15], [27, 15], [25, 16], [26, 16], [27, 16],
].forEach(([x, y]) => { BASE_MAP[y][x] = W; });

[
  [2, 2], [3, 2], [2, 3], [29, 2], [28, 2], [29, 3],
  [2, 17], [3, 17], [2, 16], [29, 17], [28, 17], [29, 16],
  [15, 1], [16, 1], [15, 18], [16, 18], [1, 9], [30, 10],
].forEach(([x, y]) => { BASE_MAP[y][x] = T; });

// Desert biome (north-east quadrant)
for (let y = 0; y <= 6; y += 1) {
  for (let x = 21; x < MAP_W; x += 1) {
    if (BASE_MAP[y][x] === G) BASE_MAP[y][x] = D;
  }
}

// Mountain ridge separating the east side
[
  [20, 5], [21, 5], [22, 5], [23, 6], [24, 7], [25, 8], [26, 9], [27, 10],
  [23, 11], [22, 12], [21, 13], [20, 14],
].forEach(([x, y]) => {
  if (BASE_MAP[y] && BASE_MAP[y][x] !== W) BASE_MAP[y][x] = M;
});

// Make a small plaza around the marketplace tile so it is easier to spot.
[
  [15, 1], [16, 1], [17, 1],
  [15, 2], [16, 2], [17, 2],
  [15, 3], [16, 3], [17, 3],
].forEach(([x, y]) => {
  if (BASE_MAP[y] && BASE_MAP[y][x] !== W && BASE_MAP[y][x] !== T) {
    BASE_MAP[y][x] = P;
  }
});

const GARDEN_SLOTS = [
  { x: 3,  y: 3  },
  { x: 28, y: 16 },
  { x: 3,  y: 16 },
  { x: 28, y: 3  },
  { x: 9,  y: 4  },
  { x: 23, y: 15 },
  { x: 8,  y: 14 },
  { x: 23, y: 4  },
  { x: 5,  y: 9  },
  { x: 26, y: 9  },
  { x: 14, y: 5  },
  { x: 17, y: 14 },
];

const START_X = 11;
const START_Y = 7;

const TILE_BG = { [G]: '#5fa33a', [P]: '#b8955a', [W]: '#3a8fc8', [T]: '#3a7a22', [D]: '#d2b56b', [M]: '#8a9099' };
const TILE_DECOR = { [G]: null, [P]: null, [W]: '🌊', [T]: '🌲', [D]: '🏜️', [M]: '⛰️' };

// Player avatar colors (deterministic from userId)
function avatarColor(userId) {
  const hue = ((Number(userId) || 0) * 73 + 137) % 360;
  return `hsl(${hue},60%,45%)`;
}

// ─── Growth / emoji helpers ───────────────────────────────────────────────────
const GROWTH_STAGES = {
  tomato: 3, carrot: 2, lettuce: 2, radish: 1, corn: 4,
  potato: 3, pumpkin: 5, sunflower: 2, blueberry: 4,
};
const PLANT_EMOJIS = {
  tomato:    ['🌱','🌿','🍅','🍅'], carrot:    ['🌱','🌿','🥕'],
  lettuce:   ['🌱','🌿','🥬'],     radish:    ['🌱','🌸'],
  corn:      ['🌱','🌿','🌾','🌽','🌽'],      potato: ['🌱','🌿','🌿','🥔'],
  pumpkin:   ['🌱','🌿','🌿','🟠','🎃','🎃'], sunflower: ['🌱','🌿','🌻'],
  blueberry: ['🌱','🌿','🌿','🫐','🫐'],
};
const WEATHER_ICONS = { sunny:'☀️', cloudy:'☁️', rainy:'🌧️', windy:'💨', storm:'⛈️', drought:'🏜️' };
const QUICK_TOOLS = ['till', 'plant', 'water', 'fertilize', 'spray', 'harvest'];
const TOOL_ICONS = { till: '🪓', plant: '🌱', water: '💧', fertilize: '🧪', spray: '🫧', harvest: '🧺' };
const CROP_COINS = {
  tomato: 20, carrot: 15, lettuce: 16, radish: 12, corn: 24,
  potato: 18, pumpkin: 30, sunflower: 22, blueberry: 26,
};
const VIRTUAL_NEIGHBORS = [
  { id: 'npc:mila', username: 'Mila', x: 9, y: 7, role: 'merchant' },
  { id: 'npc:bo', username: 'Bo', x: 13, y: 7, role: 'helper' },
  { id: 'npc:ivy', username: 'Ivy', x: 11, y: 5, role: 'trader' },
];
const MARKET_TILE = { x: 16, y: 2 };

const WORLD_HUB = { x: Math.floor(MAP_W / 2), y: Math.floor(MAP_H / 2) };
const roadTile = (x, y) => {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
  if (BASE_MAP[y][x] === W) return;
  BASE_MAP[y][x] = P;
};
const roadBetween = (from, to) => {
  const stepX = from.x <= to.x ? 1 : -1;
  for (let x = from.x; x !== to.x + stepX; x += stepX) roadTile(x, from.y);
  const stepY = from.y <= to.y ? 1 : -1;
  for (let y = from.y; y !== to.y + stepY; y += stepY) roadTile(to.x, y);
};
[MARKET_TILE, ...GARDEN_SLOTS].forEach((slot) => roadBetween(WORLD_HUB, slot));
const NPC_HOME_BY_ID = VIRTUAL_NEIGHBORS.reduce((acc, npc) => {
  acc[npc.id] = { x: npc.x, y: npc.y };
  return acc;
}, {});
const NPC_ROLE_META = {
  merchant: { label: 'Handelaar', buyDelta: -2, sellDelta: +2, helpXp: 5 },
  helper: { label: 'Helper', buyDelta: +1, sellDelta: 0, helpXp: 14 },
  trader: { label: 'Ruiler', buyDelta: 0, sellDelta: +1, helpXp: 8 },
};
const NPC_GARDENS = {
  'npc:mila': Array.from({ length: 9 }, (_, i) => ({ tilled: true, planted: i % 2 === 0, plantType: i % 3 === 0 ? 'tomato' : 'carrot', daysPlanted: (i % 4) + 1, waterLevel: 2, pest: i === 7 })),
  'npc:bo': Array.from({ length: 9 }, (_, i) => ({ tilled: true, planted: i % 2 !== 0, plantType: i % 3 === 0 ? 'lettuce' : 'potato', daysPlanted: (i % 5) + 1, waterLevel: 1, pest: i === 1 })),
  'npc:ivy': Array.from({ length: 9 }, (_, i) => ({ tilled: true, planted: true, plantType: i % 2 === 0 ? 'corn' : 'blueberry', daysPlanted: (i % 3) + 2, waterLevel: 2, pest: false })),
};
const NPC_SHOP = {
  'npc:mila': { tomato: 2, carrot: 3 },
  'npc:bo': { lettuce: 2, potato: 2 },
  'npc:ivy': { corn: 3, blueberry: 4 },
};
const SEASONAL_STOCK = {
  spring: ['lettuce', 'radish', 'carrot', 'tomato'],
  summer: ['tomato', 'corn', 'sunflower', 'blueberry'],
  autumn: ['potato', 'pumpkin', 'carrot', 'radish'],
  winter: ['potato', 'lettuce', 'corn', 'blueberry'],
};

function plotEmoji(plot) {
  if (!plot.planted || !plot.plantType) return null;
  const total  = GROWTH_STAGES[plot.plantType] || 3;
  const emojis = PLANT_EMOJIS[plot.plantType] || ['🌱'];
  const idx    = Math.min(Math.floor(((plot.daysPlanted||0)/total)*(emojis.length-1)), emojis.length-1);
  return emojis[idx];
}

function MiniPlot({ plot }) {
  const { t } = useTranslation();
  const emoji = plotEmoji(plot);
  const bg    = plot.tilled && plot.waterLevel > 0 ? '#7a5c4c'
              : plot.tilled ? '#8a6244' : '#3e2c1e';
  return (
    <div className="mini-plot" style={{ background: bg }}
      title={plot.planted ? t('worldMap.mini_day', { plant: plot.plantType, d: plot.daysPlanted }) : plot.tilled ? t('worldMap.mini_tilled') : t('worldMap.mini_untilled')}>
      {emoji && <span className="mini-plant-emoji">{emoji}</span>}
      {plot.pest && <span className="mini-pest">🐛</span>}
    </div>
  );
}

function previewTileColor(code) {
  if (code === 1) return '#7e5a3f'; // tilled
  if (code === 2) return '#4f8d2f'; // growing
  if (code === 3) return '#9ad94d'; // ready
  if (code === 4) return '#4d7398'; // watered
  return '#355e2f'; // empty
}

function previewTileEmoji(code) {
  const states = Array.isArray(code) ? code : [code];
  // Priority: harvest-ready > growing > watered > tilled
  if (states.includes(3)) return '🧺';
  if (states.includes(2)) return '🌱';
  if (states.includes(4)) return '💧';
  if (states.includes(1)) return '🟫';
  return '';
}

function npcGardenToPreview(plots) {
  const safePlots = Array.isArray(plots) ? plots : [];
  const tiles = safePlots.slice(0, 9).map((plot) => {
    if (!plot?.tilled) return 0;
    if ((plot.waterLevel || 0) > 0) return 4;
    if (plot.planted && (plot.daysPlanted || 0) >= (GROWTH_STAGES[plot.plantType] || 3)) return 3;
    if (plot.planted) return 2;
    return 1;
  });
  return {
    tiles,
    planted: safePlots.filter((p) => p?.planted).length,
    ready: safePlots.filter((p) => p?.planted && (p.daysPlanted || 0) >= (GROWTH_STAGES[p.plantType] || 3)).length,
  };
}

function npcPatrolPath(home) {
  if (!home) return [];
  return [
    { x: home.x, y: home.y },
    { x: home.x + 1, y: home.y },
    { x: home.x + 1, y: home.y + 1 },
    { x: home.x, y: home.y + 1 },
    { x: home.x - 1, y: home.y + 1 },
    { x: home.x - 1, y: home.y },
    { x: home.x - 1, y: home.y - 1 },
    { x: home.x, y: home.y - 1 },
    { x: home.x + 1, y: home.y - 1 },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
function WorldMap({ socket, currentUserId, currentUsername, gameState, onUpdateGame, onClose, onStartCall, onOpenMarketplace, onWorldHudChange, embedded = false }) {
  const [embeddedViewport, setEmbeddedViewport] = useState({ w: EMBEDDED_VIEW_W, h: EMBEDDED_VIEW_H });
  const mapMainRef = useRef(null);
  const viewW = embedded ? embeddedViewport.w : VIEW_W;
  const viewH = embedded ? embeddedViewport.h : VIEW_H;
  /** Altijd vaste tegelgrootte (zoals oorspronkelijk), geen “kleiner schalen”. */
  const pxTile = TILE;
  const { t } = useTranslation();
  const isCurrentPlayer = useCallback((player) => {
    if (!player) return false;
    if (currentUserId !== null && currentUserId !== undefined && String(currentUserId) !== '') {
      if (String(player.id) === String(currentUserId)) return true;
    }
    if (currentUsername && player.username === currentUsername) return true;
    return false;
  }, [currentUserId, currentUsername]);

  // Dynamic map loaded from server (falls back to BASE_MAP + GARDEN_SLOTS)
  const [serverMap,      setServerMap]      = useState(BASE_MAP);
  const [serverSlots,    setServerSlots]    = useState(GARDEN_SLOTS);
  const [worldOccupants, setWorldOccupants] = useState([]);
  const [gardenPreviews, setGardenPreviews] = useState({});
  const refreshTimerRef = useRef(null);
  const pollTimerRef = useRef(null);
  const refreshInFlightRef = useRef(false);
  const lastRefreshRef = useRef(0);

  const refreshWorldProjection = useCallback(async () => {
    refreshInFlightRef.current = true;
    try {
      const data = await api.get('/api/world/gardens');
      if (data && Array.isArray(data.map)) setServerMap(data.map);
      if (Array.isArray(data?.gardenSlots) && data.gardenSlots.length > 0) setServerSlots(data.gardenSlots);
      if (Array.isArray(data?.occupants)) {
        setWorldOccupants(
          data.occupants.map((o) => ({
            id: o.userId,
            username: o.username,
            slotId: o.slotId,
            x: o.x,
            y: o.y,
          }))
        );
      } else {
        setWorldOccupants([]);
      }
      setGardenPreviews(data?.gardenPreviewByUserId || {});
      lastRefreshRef.current = Date.now();
      refreshInFlightRef.current = false;
      return;
    } catch {
      // Fallback to legacy map endpoint
    }
    try {
      const data = await api.get('/api/world/map');
      if (data && Array.isArray(data.map)) {
        setServerMap(data.map);
        setServerSlots(Array.isArray(data.gardenSlots) ? data.gardenSlots : GARDEN_SLOTS);
      }
    } catch {
      // Keep defaults
    } finally {
      refreshInFlightRef.current = false;
    }
  }, []);

  const scheduleProjectionRefresh = useCallback((delayMs = 0) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    refreshTimerRef.current = setTimeout(() => {
      const now = Date.now();
      if (refreshInFlightRef.current) return;
      if (now - lastRefreshRef.current < 700) return;
      refreshWorldProjection();
    }, delayMs);
  }, [refreshWorldProjection]);

  // Fetch world projection on mount
  useEffect(() => {
    refreshWorldProjection();
  }, [refreshWorldProjection]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // Poll fallback: keeps world projection fresh even if socket events are missed.
  useEffect(() => {
    pollTimerRef.current = setInterval(() => {
      scheduleProjectionRefresh(0);
    }, 10000);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    };
  }, [scheduleProjectionRefresh]);

  const [players,        setPlayers]        = useState([]);
  const [playerPositions,setPlayerPositions]= useState({}); // userId → {x,y,username,level}
  const [pos,            setPos]            = useState({ x: START_X, y: START_Y });
  const [facing,         setFacing]         = useState('down');  // eslint-disable-line
  const [step,           setStep]           = useState(0);

  // Overview map
  const [showOverviewMap, setShowOverviewMap] = useState(false);

  // Garden visiting
  const [nearGarden,   setNearGarden]   = useState(null);
  const [nearMarketplace, setNearMarketplace] = useState(false);
  const [visitedData,  setVisitedData]  = useState(null);
  const [loadingVisit, setLoadingVisit] = useState(false);
  const [helpDone,     setHelpDone]     = useState(false);
  const [clickTarget, setClickTarget] = useState(null);
  const [lastOwnActionText, setLastOwnActionText] = useState('');
  const [ownGardenPanelDismissed, setOwnGardenPanelDismissed] = useState(false);

  // Proximity chat
  const [nearbyPlayer, setNearbyPlayer] = useState(null);     // closest walking player within range
  const [proximityPanelDismissed, setProximityPanelDismissed] = useState(false);
  const [dmHistory,    setDmHistory]    = useState({});        // { userId: [msg, ...] }
  const [dmInput,      setDmInput]      = useState('');
  const [npcNotice, setNpcNotice] = useState('');
  const [npcPositions, setNpcPositions] = useState(() => VIRTUAL_NEIGHBORS.map((n, idx) => ({
    ...n,
    virtual: true,
    patrolStep: idx % 9,
  })));
  const [npcShopStock, setNpcShopStock] = useState(() => ({ ...NPC_SHOP }));
  const virtualNeighbors = npcPositions;
  const lastNpcRefreshDayRef = useRef(null);
  const dmBottomRef = useRef(null);

  const viewportRef = useRef(null);
  const spawnedAtOwnGardenRef = useRef(false);
  const hasUserMovedRef = useRef(false);
  const lockedOwnHomeRef = useRef(null);
  const marketplaceAutoOpenedRef = useRef(false);

  // ── Socket: keep player list in sync ─────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const onList    = (list)   => {
      setPlayers(list.filter((p) => !isCurrentPlayer({ id: p.id, username: p.username })));
      scheduleProjectionRefresh(50);
    };
    const onJoined  = (player) => {
      setPlayers(prev => [...prev.filter(p => p.id !== player.id), player]);
      scheduleProjectionRefresh(150);
    };
    const onLeft    = ({ id }) => {
      setPlayers(prev => prev.filter(p => p.id !== id));
      setPlayerPositions(prev => { const n = {...prev}; delete n[id]; return n; });
      setWorldOccupants(prev => prev.filter(o => String(o.id) !== String(id)));
      scheduleProjectionRefresh(150);
    };
    socket.on('players:list',  onList);
    socket.on('player:joined', onJoined);
    socket.on('player:left',   onLeft);
    return () => {
      socket.off('players:list',  onList);
      socket.off('player:joined', onJoined);
      socket.off('player:left',   onLeft);
    };
  }, [socket, currentUserId, scheduleProjectionRefresh, isCurrentPlayer]);

  // ── Socket: live positions of other walking players ───────────────────────
  useEffect(() => {
    if (!socket) return;
    const onMoved   = ({ userId, username, x, y }) =>
      setPlayerPositions(prev => ({ ...prev, [userId]: { x, y, username } }));
    const onOffline = ({ userId }) =>
      setPlayerPositions(prev => { const n = {...prev}; delete n[userId]; return n; });
    socket.on('world:player-moved',   onMoved);
    socket.on('world:player-offline', onOffline);
    return () => {
      socket.off('world:player-moved',   onMoved);
      socket.off('world:player-offline', onOffline);
    };
  }, [socket]);

  // ── Socket: refresh world projection when any garden changes ───────────────
  useEffect(() => {
    if (!socket) return;
    const onPreviewUpdated = () => {
      scheduleProjectionRefresh(200);
    };
    socket.on('garden:preview-updated', onPreviewUpdated);
    return () => socket.off('garden:preview-updated', onPreviewUpdated);
  }, [socket, scheduleProjectionRefresh]);

  // ── Socket: incoming DMs ──────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const onDm = (msg) => {
      if (!msg.from && msg.from !== 0) return;
      const fromId = String(msg.from);
      if (!fromId || fromId === 'null' || fromId === 'undefined') return;
      setDmHistory(prev => ({
        ...prev,
        [fromId]: [...(prev[fromId] || []), msg],
      }));
    };
    socket.on('dm:receive', onDm);
    return () => socket.off('dm:receive', onDm);
  }, [socket]);

  // Auto-scroll DM chat
  useEffect(() => {
    dmBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dmHistory, nearbyPlayer]);

  // ── Build garden map from server-authoritative occupants ──────────────────
  const renderOccupants = worldOccupants.length > 0
    ? worldOccupants
    : players
      .slice(0, serverSlots.length)
      .map((p, idx) => ({ id: p.id, username: p.username, slotId: idx, x: serverSlots[idx]?.x, y: serverSlots[idx]?.y }));
  const fallbackOwnHome = useMemo(() => {
    if (!serverSlots.length) return null;
    const seed = `${currentUserId ?? ''}:${currentUsername ?? ''}`;
    const preferred = [4, 5, 6, 7].filter((i) => serverSlots[i]);
    const pool = preferred.length ? preferred : serverSlots.map((_, i) => i);
    if (!seed) return serverSlots[pool[0]] || null;
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    const idx = pool[Math.abs(hash) % pool.length];
    return serverSlots[idx] || serverSlots[pool[0]] || serverSlots[0] || null;
  }, [serverSlots, currentUserId, currentUsername]);

  const myOccupant = renderOccupants.find((p) => isCurrentPlayer(p)) || null;
  const ownHomeResolved = useMemo(() => (
    (myOccupant && Number.isInteger(myOccupant.x) && Number.isInteger(myOccupant.y))
      ? { x: myOccupant.x, y: myOccupant.y }
      : (fallbackOwnHome && Number.isInteger(fallbackOwnHome.x) && Number.isInteger(fallbackOwnHome.y))
        ? { x: fallbackOwnHome.x, y: fallbackOwnHome.y }
        : null
  ), [myOccupant, fallbackOwnHome]);

  if (!lockedOwnHomeRef.current && ownHomeResolved) {
    lockedOwnHomeRef.current = { x: ownHomeResolved.x, y: ownHomeResolved.y };
  }

  const renderOccupantsWithSelf = useMemo(() => {
    if (!ownHomeResolved) return renderOccupants;
    if (myOccupant) {
      const locked = lockedOwnHomeRef.current || ownHomeResolved;
      return renderOccupants.map((p) => (
        isCurrentPlayer(p)
          ? { ...p, x: locked.x, y: locked.y }
          : p
      ));
    }
    const selfId = currentUserId ?? `guest:self:${currentUsername || 'player'}`;
    return [
      ...renderOccupants,
      {
        id: selfId,
        username: currentUsername || 'Guest',
        slotId: null,
        x: ownHomeResolved.x,
        y: ownHomeResolved.y,
      },
    ];
  }, [renderOccupants, ownHomeResolved, myOccupant, currentUserId, currentUsername, isCurrentPlayer]);

  const otherPlayers = renderOccupantsWithSelf.filter((p) => !isCurrentPlayer(p));
  const staticVirtualGardenOwners = useMemo(() => (
    VIRTUAL_NEIGHBORS.map((n) => ({ ...n, virtual: true }))
  ), []);
  const virtualGardenPreviews = useMemo(() => {
    const previews = {};
    virtualNeighbors.forEach((n) => {
      previews[String(n.id)] = npcGardenToPreview(NPC_GARDENS[n.id] || []);
    });
    return previews;
  }, [virtualNeighbors]);
  const displayGardenOwners = useMemo(() => {
    const map = {};
    [...renderOccupantsWithSelf, ...staticVirtualGardenOwners].forEach((player) => {
      if (!Number.isInteger(player?.x) || !Number.isInteger(player?.y)) return;
      map[String(player.id)] = player;
    });
    return Object.values(map);
  }, [renderOccupantsWithSelf, staticVirtualGardenOwners]);
  const displayGardenOwnersById = useMemo(() => {
    const map = {};
    displayGardenOwners.forEach((player) => {
      map[String(player.id)] = player;
    });
    return map;
  }, [displayGardenOwners]);
  const gardenMap = useMemo(() => {
    const map = {};
    displayGardenOwners.forEach((player) => {
      if (Number.isInteger(player.x) && Number.isInteger(player.y)) {
        map[`${player.x},${player.y}`] = player;
      }
    });
    return map;
  }, [displayGardenOwners]);
  const ownHome = useMemo(() => (
    lockedOwnHomeRef.current || (myOccupant && Number.isInteger(myOccupant.x) && Number.isInteger(myOccupant.y)
      ? { x: myOccupant.x, y: myOccupant.y }
      : ownHomeResolved
        ? { x: ownHomeResolved.x, y: ownHomeResolved.y }
      : null)
  ), [myOccupant, ownHomeResolved]);
  const ownPatchCoordToIndex = {};
  if (ownHome && gameState?.plots?.length) {
    for (let i = 0; i < 9; i += 1) {
      const px = ownHome.x - 1 + (i % 3);
      const py = ownHome.y + 1 + Math.floor(i / 3);
      ownPatchCoordToIndex[`${px},${py}`] = i;
    }
  }
  const currentOwnPlotIndex = Number.isInteger(ownPatchCoordToIndex[`${pos.x},${pos.y}`])
    ? ownPatchCoordToIndex[`${pos.x},${pos.y}`]
    : null;


  const neighborPatchCoordMap = useMemo(() => {
    const map = {};
    displayGardenOwners
      .filter((player) => !isCurrentPlayer(player))
      .forEach((player) => {
      if (!Number.isInteger(player?.x) || !Number.isInteger(player?.y)) return;
      const previewTiles = (
        player.virtual
          ? (virtualGardenPreviews[String(player.id)]?.tiles || [])
          : (gardenPreviews[String(player.id)]?.tiles || [])
      );
      for (let i = 0; i < 9; i += 1) {
        const tx = player.x - 1 + (i % 3);
        const ty = player.y + 1 + Math.floor(i / 3);
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
        if (tx === player.x && ty === player.y) continue;
        const key = `${tx},${ty}`;
        if (map[key]) continue;
        const code = Number(previewTiles[i]) || 0;
        const isPlanted = code === 2 || code === 3 || code === 4;
        map[key] = {
          ownerId: player.id,
          username: player.username,
          code,
          tilled: code > 0,
          planted: isPlanted,
          emoji: previewTileEmoji(code),
        };
      }
    });
    return map;
  }, [displayGardenOwners, isCurrentPlayer, gardenPreviews, virtualGardenPreviews]);
  const homeDefaultPlotIndex = 1;

  const applyToolOnOwnPlot = useCallback((index, forcedTool) => {
    if (!Number.isInteger(index) || !onUpdateGame) return;
    const activeTool = forcedTool || gameState?.selectedTool || 'till';
    const previewPlot = gameState?.plots?.[index];
    if (!previewPlot) return;
    if (activeTool === 'plant' && !gameState?.selectedSeed) {
      setLastOwnActionText(t('worldMap.action_seed_required'));
      return;
    }
    if (activeTool === 'spray' && !previewPlot.pest) {
      setLastOwnActionText(t('worldMap.action_no_pests'));
      return;
    }
    if (activeTool === 'harvest') {
      if (!previewPlot.planted) {
        setLastOwnActionText(t('worldMap.action_nothing_to_harvest'));
        return;
      }
      const growthDays = GROWTH_STAGES[previewPlot.plantType] || 3;
      const isReady = (previewPlot.daysPlanted || 0) >= growthDays;
      if (!isReady) {
        setLastOwnActionText(t('worldMap.action_not_ready'));
        return;
      }
    }
    let fxLabel = null;
    if (activeTool === 'till') fxLabel = t('worldMap.action_tilled');
    if (activeTool === 'plant') fxLabel = t('worldMap.action_planted');
    if (activeTool === 'water') fxLabel = t('worldMap.action_watered');
    if (activeTool === 'fertilize') fxLabel = t('worldMap.action_fertilized');
    if (activeTool === 'spray') fxLabel = t('worldMap.action_sprayed');
    if (activeTool === 'harvest') fxLabel = t('worldMap.action_harvested');
    if (fxLabel) setLastOwnActionText(fxLabel);
    onUpdateGame((prev) => {
      const tool = forcedTool || prev.selectedTool || 'till';

      const updatedPlots = [...(prev.plots || [])];
      const existingPlot = updatedPlots[index];
      if (!existingPlot) return prev;
      const plot = { ...existingPlot };
      const stats = { ...prev.playerStats };
      const inventory = { ...prev.inventory };
      let coinsDelta = 0;
      let xpDelta = 0;

      switch (tool) {
        case 'till':
          if (!plot.tilled) { plot.tilled = true; xpDelta = 5; }
          break;
        case 'plant':
          if (plot.tilled && !plot.planted && prev.selectedSeed) {
            plot.planted = true;
            plot.plantType = prev.selectedSeed;
            plot.dayPlanted = prev.currentDay;
            plot.daysPlanted = 0;
            xpDelta = 10;
          }
          break;
        case 'water':
          if (plot.tilled && (plot.waterLevel || 0) < 3) {
            plot.waterLevel = Math.min((plot.waterLevel || 0) + 1, 3);
            xpDelta = 2;
          }
          break;
        case 'fertilize':
          if (plot.tilled && !plot.fertilized) {
            plot.fertilized = true;
            coinsDelta = -5;
            xpDelta = 5;
          }
          break;
        case 'spray':
          if (plot.pest) { plot.pest = false; xpDelta = 3; }
          break;
        case 'harvest':
          if (plot.planted) {
            const growthDays = GROWTH_STAGES[plot.plantType] || 3;
            const isReady = (plot.daysPlanted || 0) >= growthDays;
            if (isReady) {
              const crop = plot.plantType;
              inventory[crop] = (inventory[crop] || 0) + 1;
              stats.plantsGrown = (stats.plantsGrown || 0) + 1;
              coinsDelta = CROP_COINS[crop] || 15;
              xpDelta = 25;
              plot.planted = false;
              plot.plantType = null;
              plot.waterLevel = 0;
              plot.fertilized = false;
              plot.daysPlanted = 0;
              plot.pest = false;
            }
          }
          break;
        default:
          break;
      }

      updatedPlots[index] = plot;
      const newXp = (stats.xp || 0) + xpDelta;
      const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;
      return {
        ...prev,
        plots: updatedPlots,
        selectedTool: prev.selectedTool || tool,
        inventory,
        playerStats: {
          ...stats,
          xp: newXp,
          level: newLevel,
          coins: Math.max(0, (stats.coins || 0) + coinsDelta),
        },
      };
    });
  }, [onUpdateGame, gameState?.selectedTool, gameState?.plots, gameState?.selectedSeed, t]);

  const getTile = useCallback((x, y) => {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return W;
    if (gardenMap[`${x},${y}`]) return 4;
    return serverMap[y]?.[x] ?? G;
  }, [gardenMap, serverMap]);
  const isPassable = useCallback((x, y) => {
    const t = getTile(x, y);
    return t !== W && t !== T && t !== M;
  }, [getTile]);

  // ── Broadcast own position ────────────────────────────────────────────────
  const broadcastPos = useCallback((x, y) => {
    socket?.emit('world:position', { x, y });
  }, [socket]);

  useEffect(() => {
    if (!ownHome || spawnedAtOwnGardenRef.current || hasUserMovedRef.current) return;
    const spawnCandidates = [
      { x: ownHome.x, y: ownHome.y + 1 },
      { x: ownHome.x - 1, y: ownHome.y + 1 },
      { x: ownHome.x + 1, y: ownHome.y + 1 },
      { x: ownHome.x, y: ownHome.y },
    ];
    const spawn = spawnCandidates.find((c) => isPassable(c.x, c.y));
    if (!spawn) return;
    spawnedAtOwnGardenRef.current = true;
    setPos({ x: spawn.x, y: spawn.y });
    broadcastPos(spawn.x, spawn.y);
  }, [ownHome, isPassable, broadcastPos]);

  // ── Movement ──────────────────────────────────────────────────────────────
  const move = useCallback((dx, dy, dir) => {
    hasUserMovedRef.current = true;
    setFacing(dir);
    setPos(prev => {
      const nx = prev.x + dx;
      const ny = prev.y + dy;
      if (!isPassable(nx, ny)) return prev;
      broadcastPos(nx, ny);
      return { x: nx, y: ny };
    });
    setStep(s => s + 1);
  }, [broadcastPos, isPassable]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNpcPositions((prev) => prev.map((npc) => {
        const home = NPC_HOME_BY_ID[npc.id];
        const path = npcPatrolPath(home);
        if (!path.length) return npc;
        for (let i = 1; i <= path.length; i += 1) {
          const nextStep = ((npc.patrolStep || 0) + i) % path.length;
          const next = path[nextStep];
          if (isPassable(next.x, next.y)) {
            return { ...npc, x: next.x, y: next.y, patrolStep: nextStep };
          }
        }
        return npc;
      }));
    }, 1400);
    return () => clearInterval(timer);
  }, [isPassable]);

  useEffect(() => {
    const day = Number(gameState?.currentDay || 1);
    if (lastNpcRefreshDayRef.current === day) return;
    lastNpcRefreshDayRef.current = day;
    const season = (gameState?.currentSeason || 'spring').toLowerCase();
    const pool = SEASONAL_STOCK[season] || SEASONAL_STOCK.spring;
    setNpcShopStock(() => {
      const next = {};
      VIRTUAL_NEIGHBORS.forEach((npc, i) => {
        const base = pool[(day + i) % pool.length];
        const alt = pool[(day + i + 2) % pool.length];
        next[npc.id] = {
          [base]: 2 + ((day + i) % 3),
          [alt]: 1 + ((day + i + 1) % 2),
        };
      });
      return next;
    });
  }, [gameState?.currentDay, gameState?.currentSeason]);

  useLayoutEffect(() => {
    if (!embedded || !mapMainRef.current) return undefined;
    const el = mapMainRef.current;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w < 32 || h < 32) return;

      const tw = Math.min(MAP_W, Math.max(EMBEDDED_MIN_VIEW_W, Math.floor(w / TILE)));
      const th = Math.min(MAP_H, Math.max(EMBEDDED_MIN_VIEW_H, Math.floor(h / TILE)));

      setEmbeddedViewport((prev) => ((prev.w === tw && prev.h === th) ? prev : { w: tw, h: th }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [embedded]);

  useEffect(() => {
    if (!clickTarget) return undefined;
    const timer = setInterval(() => {
      setPos((prev) => {
        if (prev.x === clickTarget.x && prev.y === clickTarget.y) {
          setClickTarget(null);
          return prev;
        }
        const dx = clickTarget.x - prev.x;
        const dy = clickTarget.y - prev.y;
        const tryX = dx === 0 ? null : { x: prev.x + Math.sign(dx), y: prev.y, dir: dx > 0 ? 'right' : 'left' };
        const tryY = dy === 0 ? null : { x: prev.x, y: prev.y + Math.sign(dy), dir: dy > 0 ? 'down' : 'up' };
        const primary = Math.abs(dx) >= Math.abs(dy) ? tryX : tryY;
        const secondary = Math.abs(dx) >= Math.abs(dy) ? tryY : tryX;
        const candidate = (primary && isPassable(primary.x, primary.y)) ? primary
          : (secondary && isPassable(secondary.x, secondary.y)) ? secondary
            : null;
        if (!candidate) {
          setClickTarget(null);
          return prev;
        }
        setFacing(candidate.dir);
        broadcastPos(candidate.x, candidate.y);
        setStep((s) => s + 1);
        return { x: candidate.x, y: candidate.y };
      });
    }, 95);
    return () => clearInterval(timer);
  }, [clickTarget, broadcastPos, isPassable]);

  // ── Garden visit ──────────────────────────────────────────────────────────
  const openVisit = useCallback(async (player) => {
    setVisitedData(null);
    setHelpDone(false);
    setLoadingVisit(true);
    socket?.emit('garden:visit', { targetUserId: player.id });
    try {
      const data = await api.get(`/api/garden/visit/${player.id}`);
      setVisitedData({ ...data, player });
    } catch {
      setVisitedData({ player, error: true });
    } finally {
      setLoadingVisit(false);
    }
  }, [socket]);

  const openMarketplace = useCallback(() => {
    setVisitedData(null);
    setHelpDone(false);
    onOpenMarketplace?.();
  }, [onOpenMarketplace]);

  const handlePrimaryInteract = useCallback(() => {
    // Marketplace has priority over other interactions.
    if (nearMarketplace) {
      openMarketplace();
      return;
    }
    if (currentOwnPlotIndex !== null && currentOwnPlotIndex !== undefined) {
      applyToolOnOwnPlot(currentOwnPlotIndex);
      return;
    }
    if (nearGarden && !isCurrentPlayer(nearGarden)) openVisit(nearGarden);
  }, [nearMarketplace, openMarketplace, currentOwnPlotIndex, applyToolOnOwnPlot, nearGarden, isCurrentPlayer, openVisit]);

  useEffect(() => {
    if (!nearMarketplace) {
      marketplaceAutoOpenedRef.current = false;
      return;
    }
    if (marketplaceAutoOpenedRef.current) return;
    marketplaceAutoOpenedRef.current = true;
    openMarketplace();
  }, [nearMarketplace, openMarketplace]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return;
      const tag = e.target?.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable;
      // Ignore movement/tool key events while typing in form fields
      if (isEditable) return;
      switch (e.key) {
        case 'ArrowUp':    case 'w': case 'W': setClickTarget(null); move( 0,-1,'up');    break;
        case 'ArrowDown':  case 's': case 'S': setClickTarget(null); move( 0, 1,'down');  break;
        case 'ArrowLeft':  case 'a': case 'A': setClickTarget(null); move(-1, 0,'left');  break;
        case 'ArrowRight': case 'd': case 'D': setClickTarget(null); move( 1, 0,'right'); break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6': {
          const tool = QUICK_TOOLS[Number(e.key) - 1];
          const targetPlot = (currentOwnPlotIndex !== null && currentOwnPlotIndex !== undefined)
              ? currentOwnPlotIndex
              : (ownHome && pos.x === ownHome.x && pos.y === ownHome.y ? homeDefaultPlotIndex : null);
          if (targetPlot !== null && targetPlot !== undefined) {
            e.preventDefault();
            applyToolOnOwnPlot(targetPlot, tool);
          } else {
            onUpdateGame?.((prev) => ({ ...prev, selectedTool: tool }));
          }
          break;
        }
        case 'q': case 'Q':
          onUpdateGame?.((prev) => {
            const idx = Math.max(0, SEEDS.findIndex((s) => s.id === prev.selectedSeed));
            const next = SEEDS[(idx + 1) % SEEDS.length];
            return { ...prev, selectedSeed: next?.id || prev.selectedSeed };
          });
          break;
        case ' ': case 'Spacebar':
          break;
        case 'e': case 'E': case 'Enter':
          e.preventDefault();
          handlePrimaryInteract();
          break;
        case 'Escape':
          if (visitedData) { setVisitedData(null); setHelpDone(false); }
          else if (nearbyPlayer && !proximityPanelDismissed) setProximityPanelDismissed(true);
          else if (!embedded) onClose?.();
          break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    const activeTag = document.activeElement?.tagName;
    const isEditableActive = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT' || document.activeElement?.isContentEditable;
    if (!isEditableActive) viewportRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [visitedData, move, onClose, currentUserId, isCurrentPlayer, embedded, onUpdateGame, ownHome, pos.x, pos.y, nearbyPlayer, proximityPanelDismissed, handlePrimaryInteract]); // eslint-disable-line

  // ── Proximity detection ───────────────────────────────────────────────────
  useEffect(() => {
    // Interactie alleen op exacte huis/plot-tegel van andere speler
    const gKey = `${pos.x},${pos.y}`;
    const gardenOwner = gardenMap[gKey] || null;
    const patchOwnerId = neighborPatchCoordMap[gKey]?.ownerId;
    const patchOwner = patchOwnerId ? displayGardenOwnersById[String(patchOwnerId)] : null;
    const activeOwner = (!gardenOwner || isCurrentPlayer(gardenOwner)) ? patchOwner : gardenOwner;
    const canInteract = !!activeOwner && !isCurrentPlayer(activeOwner);
    setNearGarden(canInteract ? activeOwner : null);
    setNearbyPlayer(canInteract ? { ...activeOwner } : null);
    setNearMarketplace(pos.x === MARKET_TILE.x && pos.y === MARKET_TILE.y);
  }, [pos, gardenMap, neighborPatchCoordMap, displayGardenOwnersById, isCurrentPlayer]);

  const nearbyIdKey = nearbyPlayer?.id !== null && nearbyPlayer?.id !== undefined ? String(nearbyPlayer.id) : null;
  useEffect(() => {
    setProximityPanelDismissed(false);
  }, [pos.x, pos.y, nearbyIdKey]);

  const handleTileClick = useCallback((tileData) => {
    const { mx, my, ownPlot, ownPatchIndex, gardenPlayer } = tileData;
    if (mx !== pos.x || my !== pos.y) hasUserMovedRef.current = true;
    if (ownPlot && ownPatchIndex !== null && ownPatchIndex !== undefined) {
      applyToolOnOwnPlot(ownPatchIndex);
      return;
    }
    if (mx === pos.x && my === pos.y) {
      if (gardenPlayer) {
        if (!isCurrentPlayer(gardenPlayer)) openVisit(gardenPlayer);
      }
      return;
    }
    if (!isPassable(mx, my)) return;
    setClickTarget({ x: mx, y: my });
  }, [pos.x, pos.y, isCurrentPlayer, isPassable, openVisit, applyToolOnOwnPlot]);

  const handleHelp = useCallback(() => {
    if (!visitedData?.player || helpDone) return;
    socket?.emit('player:help', { targetUserId: visitedData.player.id, amount: 15 });
    setHelpDone(true);
  }, [visitedData, helpDone, socket]);

  // ── DM send ───────────────────────────────────────────────────────────────
  const sendDm = useCallback(() => {
    const text = dmInput.trim();
    if (!text || !nearbyPlayer || !socket) return;
    if (nearbyPlayer.virtual) {
      const key = String(nearbyPlayer.id);
      const mine = { from: currentUserId, fromUsername: t('leaderboard.you'), text, timestamp: Date.now() };
      const npcReply = {
        from: key,
        fromUsername: nearbyPlayer.username,
        text: `Ik hoorde je: "${text}". Zullen we ruilen of samenwerken?`,
        timestamp: Date.now() + 1,
      };
      setDmHistory((prev) => ({ ...prev, [key]: [...(prev[key] || []), mine, npcReply] }));
      setDmInput('');
      return;
    }
    socket.emit('dm:send', { to: nearbyPlayer.id, text });
    // Add own message to history immediately
    setDmHistory(prev => ({
      ...prev,
      [nearbyPlayer.id]: [...(prev[nearbyPlayer.id] || []), {
        from: currentUserId,
        fromUsername: t('leaderboard.you'),
        text,
        timestamp: Date.now(),
      }],
    }));
    setDmInput('');
  }, [dmInput, nearbyPlayer, socket, currentUserId, t]);

  const npcSellOne = useCallback(() => {
    if (!nearbyPlayer?.virtual || !onUpdateGame) return;
    const role = NPC_ROLE_META[nearbyPlayer.role] || NPC_ROLE_META.trader;
    let sold = null;
    onUpdateGame((prev) => {
      const entry = Object.entries(prev.inventory || {}).find(([, qty]) => Number(qty) > 0);
      if (!entry) return prev;
      const [crop, qty] = entry;
      const nextInv = { ...prev.inventory, [crop]: Math.max(0, Number(qty) - 1) };
      const gain = Math.max(1, (CROP_COINS[crop] || 10) + role.sellDelta);
      sold = { crop, gain };
      return {
        ...prev,
        inventory: nextInv,
        playerStats: { ...prev.playerStats, coins: (prev.playerStats.coins || 0) + gain },
      };
    });
    setNpcNotice(sold ? `💰 Verkocht: ${sold.crop} (+${sold.gain} coins)` : 'Geen oogst om te verkopen');
  }, [nearbyPlayer, onUpdateGame]);

  const npcHelp = useCallback(() => {
    if (!nearbyPlayer?.virtual || !onUpdateGame) return;
    const role = NPC_ROLE_META[nearbyPlayer.role] || NPC_ROLE_META.trader;
    onUpdateGame((prev) => ({
      ...prev,
      playerStats: { ...prev.playerStats, xp: (prev.playerStats.xp || 0) + role.helpXp },
    }));
    setNpcNotice(`🤝 Samen gewerkt met ${role.label}! +${role.helpXp} XP`);
  }, [nearbyPlayer, onUpdateGame]);

  const npcBuyOne = useCallback((crop) => {
    if (!nearbyPlayer?.virtual || !onUpdateGame) return;
    const role = NPC_ROLE_META[nearbyPlayer.role] || NPC_ROLE_META.trader;
    const price = Math.max(1, (CROP_COINS[crop] || 10) + 4 + role.buyDelta);
    let bought = false;
    onUpdateGame((prev) => {
      if ((prev.playerStats?.coins || 0) < price) return prev;
      bought = true;
      return {
        ...prev,
        inventory: { ...prev.inventory, [crop]: (prev.inventory?.[crop] || 0) + 1 },
        playerStats: { ...prev.playerStats, coins: (prev.playerStats.coins || 0) - price },
      };
    });
    if (!bought) {
      setNpcNotice(`❌ Te weinig coins voor ${crop} (${price})`);
      return;
    }
    setNpcShopStock((prev) => {
      const shop = { ...(prev[nearbyPlayer.id] || {}) };
      if (typeof shop[crop] === 'number') shop[crop] = Math.max(0, shop[crop] - 1);
      return { ...prev, [nearbyPlayer.id]: shop };
    });
    setNpcNotice(`🛒 Gekocht: ${crop} (-${price} coins)`);
  }, [nearbyPlayer, onUpdateGame]);

  // ── Camera (rand van de kaart pas tonen als je ernaartoe loopt) ───────────
  /* D-pad staat in onderbalk (niet links); camera gecentreerd op speler */
  const camAnchorX = Math.floor(viewW / 2);
  const camAnchorY = Math.floor(viewH / 2);
  const rawCamX = pos.x - camAnchorX;
  const rawCamY = pos.y - camAnchorY;
  const EDGE = WORLD_EDGE_REVEAL;

  const minCamX = pos.x >= EDGE + camAnchorX
    ? Math.min(EDGE, Math.max(0, MAP_W - viewW))
    : 0;
  const maxCamXUnclamped = pos.x < MAP_W - EDGE - (viewW - 1 - camAnchorX)
    ? MAP_W - viewW - EDGE
    : MAP_W - viewW;
  const maxCamX = Math.max(minCamX, Math.min(maxCamXUnclamped, MAP_W - viewW));

  const minCamY = pos.y >= EDGE + camAnchorY
    ? Math.min(EDGE, Math.max(0, MAP_H - viewH))
    : 0;
  const maxCamYUnclamped = pos.y < MAP_H - EDGE - (viewH - 1 - camAnchorY)
    ? MAP_H - viewH - EDGE
    : MAP_H - viewH;
  const maxCamY = Math.max(minCamY, Math.min(maxCamYUnclamped, MAP_H - viewH));

  const camX = Math.max(minCamX, Math.min(maxCamX, rawCamX));
  const camY = Math.max(minCamY, Math.min(maxCamY, rawCamY));

  // ── Render tile grid ──────────────────────────────────────────────────────
  const tiles = [];
  for (let vy = 0; vy < viewH; vy++) {
    for (let vx = 0; vx < viewW; vx++) {
      const mx = camX + vx;
      const my = camY + vy;
      const tile = getTile(mx, my);
      const gardenPlayer = gardenMap[`${mx},${my}`];
      const isMe   = mx === pos.x && my === pos.y;
      const preview = gardenPlayer
        ? (gardenPlayer.virtual ? virtualGardenPreviews[String(gardenPlayer.id)] : gardenPreviews[String(gardenPlayer.id)])
        : null;
      const ownPatchIndex = Number.isInteger(ownPatchCoordToIndex[`${mx},${my}`])
        ? ownPatchCoordToIndex[`${mx},${my}`]
        : null;
      const ownPlot = (ownPatchIndex !== null && ownPatchIndex !== undefined) ? gameState?.plots?.[ownPatchIndex] : null;
      const neighborPatch = neighborPatchCoordMap[`${mx},${my}`];
      const isMarketTile = mx === MARKET_TILE.x && my === MARKET_TILE.y;

      tiles.push({ vx, vy, mx, my, tile, gardenPlayer, preview, ownPatchIndex, ownPlot, neighborPatch, isMe, isMarketTile });
    }
  }

  const visibleWalkers = useMemo(() => {
    const fallbackOccupants = otherPlayers
      .filter((p) => Number.isInteger(p?.x) && Number.isInteger(p?.y))
      .map((p) => ({ uid: String(p.id), username: p.username, x: p.x, y: p.y, virtual: false }));
    const liveWalkers = Object.entries(playerPositions)
      .filter(([, p]) => Number.isInteger(p?.x) && Number.isInteger(p?.y))
      .map(([uid, p]) => ({ uid: String(uid), username: p.username, x: p.x, y: p.y, virtual: false }));
    const npcWalkers = virtualNeighbors
      .filter((n) => Number.isInteger(n?.x) && Number.isInteger(n?.y))
      .map((n) => ({ uid: String(n.id), username: n.username, x: n.x, y: n.y, virtual: true }));

    const walkersById = {};
    [...fallbackOccupants, ...liveWalkers, ...npcWalkers].forEach((walker) => {
      walkersById[walker.uid] = walker;
    });

    const inView = Object.values(walkersById)
      .filter((w) => w.x >= camX && w.x < camX + viewW && w.y >= camY && w.y < camY + viewH)
      .sort((a, b) => (a.y - b.y) || (a.x - b.x));

    const perTileStack = {};
    return inView.map((w) => {
      const tileKey = `${w.x},${w.y}`;
      const stack = perTileStack[tileKey] || 0;
      perTileStack[tileKey] = stack + 1;
      return {
        ...w,
        vx: w.x - camX,
        vy: w.y - camY,
        stack,
      };
    });
  }, [otherPlayers, playerPositions, virtualNeighbors, camX, camY, viewW, viewH]);

  const walkEmoji = step % 2 === 0 ? '🧑‍🌾' : '🌿';

  // Right panel mode
  const isVirtualUser = (player) => !!(player?.virtual || String(player?.id || '').startsWith('npc:'));
  const isNearbyVirtual = isVirtualUser(nearbyPlayer);
  const showNearbyChat  = !!nearbyPlayer && !proximityPanelDismissed;
  const showGardenVisit = !!visitedData || loadingVisit;
  const isNearGardenVirtual = isVirtualUser(nearGarden);
  const showGardenHint  = !showNearbyChat && !showGardenVisit && !!nearGarden && !isNearGardenVirtual;
  const isAtOwnGarden = (currentOwnPlotIndex !== null && currentOwnPlotIndex !== undefined)
    || (ownHome && pos.x === ownHome.x && pos.y === ownHome.y);
  const showOwnGardenPanel = isAtOwnGarden && !showGardenVisit && !ownGardenPanelDismissed;
  const showFloatingPanel = showNearbyChat || showGardenVisit || showOwnGardenPanel
    || (showGardenHint && nearGarden && !isCurrentPlayer(nearGarden));
  const ownGardenTargetPlot = (currentOwnPlotIndex !== null && currentOwnPlotIndex !== undefined)
    ? currentOwnPlotIndex
    : homeDefaultPlotIndex;
  const ownGardenTools = QUICK_TOOLS;
  const getToolLabel = (tool) => t(`worldMap.tool_${tool}`, { defaultValue: tool });

  useEffect(() => {
    if (!isAtOwnGarden && ownGardenPanelDismissed) setOwnGardenPanelDismissed(false);
  }, [isAtOwnGarden, ownGardenPanelDismissed]);

  // DM history for current nearby player
  const dmMessages = (nearbyPlayer && dmHistory[nearbyPlayer.id]) || [];
  const nearbyNpcGarden = nearbyPlayer?.virtual ? (NPC_GARDENS[nearbyPlayer.id] || []) : [];
  const nearbyNpcShop = nearbyPlayer?.virtual ? (npcShopStock[nearbyPlayer.id] || {}) : {};
  const nearbyNpcRole = nearbyPlayer?.virtual ? (NPC_ROLE_META[nearbyPlayer.role] || NPC_ROLE_META.trader) : null;

  useEffect(() => {
    onWorldHudChange?.({
      coords: `${pos.x},${pos.y}`,
      onlineCount: otherPlayers.length,
    });
  }, [onWorldHudChange, pos.x, pos.y, otherPlayers.length]);

  const body = (
      <div className={embedded ? 'world-map-embedded' : 'modal world-map-modal-walk'}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        {!embedded && (
          <div className="modal-header">
            <h2 className="world-map-title-hidden">{t('worldMap.title')}</h2>
            <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
              <button className="modal-close" onClick={onClose}>✕</button>
            </div>
          </div>
        )}

        <div className="walk-world-body" onContextMenu={(e) => e.preventDefault()}>

          {/* ── Walking map ──────────────────────────────────────────── */}
          <div className="walk-map-column">
            <div className="walk-map-main" ref={mapMainRef}>
            {/* Overview map button */}
            <button
              className="walk-overview-btn"
              onClick={() => setShowOverviewMap((v) => !v)}
              title="Tuinoverzicht"
            >
              {'\u{1F5FA}️'}
            </button>
            {showOverviewMap && (
              <div className="walk-overview-panel">
                <div className="walk-overview-header">
                  <strong>{'\u{1F5FA}️'} Tuinoverzicht</strong>
                  <button onClick={() => setShowOverviewMap(false)}>✕</button>
                </div>
                <div
                  className="walk-overview-map"
                  style={{ position: 'relative', width: MAP_W * 8, height: MAP_H * 8, background: '#5fa33a', border: '1px solid #3a7a22' }}
                >
                  {displayGardenOwners.map((owner) => {
                    if (!Number.isInteger(owner.x) || !Number.isInteger(owner.y)) return null;
                    return (
                      <div
                        key={String(owner.id)}
                        style={{
                          position: 'absolute',
                          left: owner.x * 8 - 4,
                          top: owner.y * 8 - 4,
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: avatarColor(owner.id),
                          border: '1px solid #fff',
                          cursor: 'pointer',
                        }}
                        title={owner.username}
                      />
                    );
                  })}
                  {/* Current player position */}
                  <div
                    style={{
                      position: 'absolute',
                      left: pos.x * 8 - 4,
                      top: pos.y * 8 - 4,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#fff',
                      zIndex: 2,
                    }}
                    title={t('worldMap.you')}
                  />
                </div>
                <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: 120, overflowY: 'auto' }}>
                  {displayGardenOwners.filter((o) => !o.virtual).map((owner) => (
                    <div key={String(owner.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: avatarColor(owner.id), flexShrink: 0 }} />
                      <span style={{ fontWeight: 600 }}>{owner.username}</span>
                      {isCurrentPlayer(owner) && <span style={{ fontSize: '0.7rem', color: '#a5d6a7' }}>(jij)</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div
              className="walk-viewport"
              ref={viewportRef}
              tabIndex={0}
              style={embedded
                ? { width: '100%', height: '100%', outline: 'none' }
                : { width: viewW * pxTile, height: viewH * pxTile, outline: 'none' }}
              onClick={() => viewportRef.current?.focus()}
            >
              <div
                className="walk-viewport-inner"
                style={{
                  width: viewW * pxTile,
                  height: viewH * pxTile,
                  position: 'relative',
                  margin: embedded ? 'auto' : 0,
                }}
              >
              {tiles.map(({ vx, vy, mx, my, tile, gardenPlayer, preview, ownPatchIndex, ownPlot, neighborPatch, isMe, isMarketTile }) => {
                const isHighlighted = isMe && !!nearGarden;
                const bg = tile === 4
                  ? (isHighlighted ? '#7bc67e' : '#8bc34a')
                  : (TILE_BG[tile] || '#5fa33a');

                return (
                  <div
                    key={`${vx},${vy}`}
                    className={`walk-tile ${isMarketTile ? 'walk-tile--market' : ''}`}
                    style={{ left: vx * pxTile, top: vy * pxTile, width: pxTile, height: pxTile, background: bg }}
                    onClick={() => handleTileClick({ mx, my, ownPlot, ownPatchIndex, tile, gardenPlayer })}
                  >
                    {/* Terrain decor */}
                    {TILE_DECOR[tile] && <span className="tile-decor">{TILE_DECOR[tile]}</span>}

                    {/* Garden tile label */}
                    {gardenPlayer && (
                      <div className="garden-tile-label">
                        <span className="garden-tile-house">🏡</span>
                        <span className="garden-tile-name">{gardenPlayer.username}</span>
                      </div>
                    )}
                    {!gardenPlayer && isMarketTile && (
                      <div className="garden-tile-label">
                        <span className="garden-tile-house">🏪</span>
                        <span className="garden-tile-name">Marketplace</span>
                        <span className="market-tile-beacon" aria-hidden>✨</span>
                      </div>
                    )}
                    {preview && (
                      <div className="garden-tile-preview" title={`${preview.planted || 0} planted / ${preview.ready || 0} ready`}>
                        {(preview.tiles || []).slice(0, 9).map((code, idx) => (
                          <span
                            key={idx}
                            className="garden-tile-preview-dot"
                            style={{ background: previewTileColor(code) }}
                          />
                        ))}
                      </div>
                    )}
                    {ownPlot && (
                      <div className={`world-own-plot ${ownPlot.tilled ? 'world-own-plot--tilled' : ''} ${ownPlot.planted ? 'world-own-plot--planted' : ''} ${currentOwnPlotIndex === ownPatchIndex ? 'world-own-plot--active' : ''}`}>
                        {ownPlot.planted ? (
                          <span className="world-own-plot-emoji">{plotEmoji(ownPlot) || '🌱'}</span>
                        ) : ownPlot.tilled ? (
                          <span className="world-own-plot-dot">•</span>
                        ) : null}
                      </div>
                    )}
                    {!ownPlot && neighborPatch && (
                      <div className={`world-own-plot world-own-plot--neighbor ${neighborPatch.tilled ? 'world-own-plot--tilled' : ''} ${neighborPatch.planted ? 'world-own-plot--planted' : ''}`} title={`${neighborPatch.username} garden`}>
                        {neighborPatch.emoji ? (
                          <span className="world-own-plot-emoji">{neighborPatch.emoji}</span>
                        ) : neighborPatch.tilled ? (
                          <span className="world-own-plot-dot">•</span>
                        ) : null}
                      </div>
                    )}

                    {/* My character */}
                    {isMe && (
                      <div className="walk-player-char" title={t('worldMap.you')}>
                        {walkEmoji}
                      </div>
                    )}
                  </div>
                );
              })}
              {visibleWalkers.map(({ uid, username, virtual, vx, vy, stack }) => (
                <div
                  key={uid}
                  className={`walk-other-player walk-other-player--floating ${virtual ? 'walk-other-player--virtual' : 'walk-other-player--real'}`}
                  style={{
                    background: virtual ? '#8d6e63' : avatarColor(uid),
                    left: (vx * pxTile) + (pxTile / 2) + (stack * Math.min(16, Math.round(pxTile * 0.28))) - 11,
                    top: (vy * pxTile) + Math.max(4, Math.round(pxTile * 0.1)),
                  }}
                  title={username}
                >
                  {virtual ? '🤖' : username[0]?.toUpperCase()}
                  <span className={`walk-other-player-name ${virtual ? 'walk-other-player-name--virtual' : 'walk-other-player-name--real'}`}>
                    {username}
                  </span>
                </div>
              ))}
            </div>
            </div>
            </div>

            {/* HUD */}
            {((nearGarden && !nearbyPlayer && !isCurrentPlayer(nearGarden)) || (nearbyPlayer && !nearbyPlayer.virtual) || nearMarketplace) && (
              <div className="walk-hud">
                {nearGarden && !nearbyPlayer && !isCurrentPlayer(nearGarden) && (
                  <span className="walk-interact-hint" onClick={() => openVisit(nearGarden)}>
                    {t('worldMap.hud_visit_hint', { name: nearGarden.username })}
                  </span>
                )}
                {nearbyPlayer && !isNearbyVirtual && (
                  <span className="walk-interact-hint walk-interact-hint--player">
                    {t('worldMap.hud_player_near', { name: nearbyPlayer.username })}
                  </span>
                )}
                {nearMarketplace && (
                  <span className="walk-interact-hint" onClick={openMarketplace}>
                    🏪 Marketplace dichtbij — druk E
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── Right panel ──────────────────────────────────────────── */}
          <div
            className={`walk-garden-panel ${showFloatingPanel ? '' : 'walk-garden-panel--hidden'}${embedded && showNearbyChat ? ' walk-garden-panel--proximity' : ''}${showOwnGardenPanel ? ' walk-garden-panel--own' : ''}`}
          >

            {/* A) Proximity chat + call (player nearby) */}
            {showNearbyChat && !showOwnGardenPanel && (
              <div className="prox-panel">
                <div className="prox-header">
                  <div className="prox-header__main">
                    <div className="prox-avatar" style={{ background: avatarColor(nearbyPlayer.id) }}>
                      {nearbyPlayer.username[0]?.toUpperCase()}
                    </div>
                    <div className="prox-header__text">
                      <div className="prox-name">{nearbyPlayer.username}</div>
                      <div className="prox-range">📍 {t('worldMap.tiles_away', { count: Math.abs(pos.x - nearbyPlayer.x) + Math.abs(pos.y - nearbyPlayer.y) })}</div>
                      {nearbyPlayer.virtual && nearbyNpcRole && (
                        <div className="prox-range">🧭 Rol: {nearbyNpcRole.label}</div>
                      )}
                    </div>
                  </div>
                  <div className="prox-header__actions">
                    {!isNearbyVirtual && (
                      <>
                        <button
                          type="button"
                          className="btn prox-call-btn"
                          onClick={() => onStartCall?.({ mode: 'outgoing', peerId: nearbyPlayer.id, peerUsername: nearbyPlayer.username, audioOnly: false })}
                          title="Videogesprek starten"
                          style={{ padding: '0.3rem 0.55rem', fontSize: '0.82rem' }}
                        >
                          📹
                        </button>
                        <button
                          type="button"
                          className="btn prox-call-btn"
                          onClick={() => onStartCall?.({ mode: 'outgoing', peerId: nearbyPlayer.id, peerUsername: nearbyPlayer.username, audioOnly: true })}
                          title="Audiogesprek starten"
                          style={{ padding: '0.3rem 0.55rem', fontSize: '0.82rem' }}
                        >
                          📞
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary prox-close-btn"
                      onClick={() => setProximityPanelDismissed(true)}
                      aria-label={t('worldMap.close_panel')}
                      title={t('worldMap.close_panel')}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {nearbyPlayer.virtual && (
                  <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.45rem', flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.28rem 0.5rem' }} onClick={npcSellOne}>
                      💰 Verkoop
                    </button>
                    <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.28rem 0.5rem' }} onClick={npcHelp}>
                      🤝 Samenwerken
                    </button>
                  </div>
                )}
                {!isNearbyVirtual && (
                  <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.45rem', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '0.28rem 0.5rem' }}
                      onClick={() => socket?.emit('player:help', { targetUserId: nearbyPlayer.id, amount: 12 })}
                    >
                      🤝 Samenwerken
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '0.28rem 0.5rem' }}
                      onClick={openMarketplace}
                    >
                      🏪 Marketplace
                    </button>
                  </div>
                )}
                {nearbyPlayer.virtual && (
                  <div style={{ marginBottom: '0.45rem' }}>
                    <div className="walk-garden-note" style={{ marginBottom: '0.35rem' }}>🧺 Voorraad buur</div>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {Object.entries(nearbyNpcShop).map(([crop, qty]) => (
                        <button
                          key={crop}
                          className="btn btn-secondary"
                          style={{ fontSize: '0.76rem', padding: '0.25rem 0.45rem' }}
                          disabled={qty <= 0}
                          onClick={() => npcBuyOne(crop)}
                        >
                          {crop} x{qty}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {nearbyPlayer.virtual && nearbyNpcGarden.length > 0 && (
                  <div style={{ marginBottom: '0.45rem' }}>
                    <div className="walk-garden-note" style={{ marginBottom: '0.35rem' }}>🏡 Tuin van buur</div>
                    <div className="mini-garden-grid">
                      {nearbyNpcGarden.map((plot, i) => <MiniPlot key={i} plot={plot} />)}
                    </div>
                  </div>
                )}
                {nearbyPlayer.virtual && npcNotice && (
                  <div className="walk-garden-note" style={{ marginBottom: '0.45rem' }}>{npcNotice}</div>
                )}

                {!isNearbyVirtual && (
                  <>
                    {/* DM chat history */}
                    <div className="prox-chat-messages">
                      {dmMessages.length === 0 && (
                        <div className="prox-chat-empty">{t('worldMap.dm_empty', { name: nearbyPlayer.username })}</div>
                      )}
                      {dmMessages.map((msg, i) => (
                        <div key={i} className={`prox-msg${msg.from === currentUserId ? ' prox-msg--own' : ''}`}>
                          <span className="prox-msg-author">{msg.fromUsername}</span>
                          <span className="prox-msg-text">{msg.text}</span>
                        </div>
                      ))}
                      <div ref={dmBottomRef} />
                    </div>

                    {/* Input */}
                    <div className="prox-chat-input-row">
                      <input
                        className="chat-input"
                        placeholder={t('worldMap.dm_placeholder')}
                        value={dmInput}
                        onChange={(e) => setDmInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendDm()}
                        maxLength={300}
                      />
                      <button className="btn btn-primary" onClick={sendDm}
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                        ➤
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* B) Garden visit */}
            {showGardenVisit && !showOwnGardenPanel && (
              <div className="walk-garden-view">
                <button
                  type="button"
                  className="modal-close walk-garden-view__close"
                  onClick={() => { setVisitedData(null); setHelpDone(false); }}
                  aria-label="Sluiten"
                >
                  ✕
                </button>
                {loadingVisit && (
                  <div className="walk-garden-empty">
                    <div style={{ fontSize:'2rem', animation:'spin 1s linear infinite' }}>⏳</div>
                    <div>{t('worldMap.garden_loading')}</div>
                  </div>
                )}
                {visitedData && !visitedData.error && (
                  <>
                    <div className="walk-garden-header">
                      <div>
                        <h3>🌱 {visitedData.username || visitedData.player?.username}</h3>
                        <div className="walk-garden-meta">
                          <span>{t('worldMap.day_badge', { n: visitedData.currentDay })}</span>
                          <span>{WEATHER_ICONS[visitedData.weather]||'🌤️'} {visitedData.weather}</span>
                          <span>Lv.{visitedData.level || visitedData.player?.level}</span>
                        </div>
                      </div>
                      <button className="btn btn-primary walk-help-btn" onClick={handleHelp} disabled={helpDone}>
                        {helpDone ? t('worldMap.help_done') : t('worldMap.help_button')}
                      </button>
                    </div>
                    {helpDone && <div className="walk-help-msg">{t('worldMap.help_thanks', { name: visitedData.player?.username })}</div>}
                    <div className="walk-garden-note">{t('worldMap.view_only')}</div>
                    <div className="mini-garden-grid">
                      {(visitedData.plots||[]).map((plot,i) => <MiniPlot key={i} plot={plot} />)}
                    </div>
                    {(() => {
                      const plots   = visitedData.plots || [];
                      const tilled  = plots.filter(p => p.tilled).length;
                      const planted = plots.filter(p => p.planted).length;
                      const ready   = plots.filter(p => p.planted && (p.daysPlanted||0) >= (GROWTH_STAGES[p.plantType]||3)).length;
                      return (
                        <div className="world-garden-stats" style={{ marginTop:'0.75rem' }}>
                          <div className="world-stat"><span>{tilled}</span><small>{t('worldMap.stat_tilled')}</small></div>
                          <div className="world-stat"><span>{planted}</span><small>{t('worldMap.stat_planted')}</small></div>
                          <div className="world-stat"><span style={{color:'#4caf50'}}>{ready}</span><small>{t('worldMap.stat_ready')}</small></div>
                        </div>
                      );
                    })()}
                    <button className="btn btn-secondary" onClick={() => { setVisitedData(null); setHelpDone(false); }}
                      style={{ marginTop:'0.75rem', width:'100%', fontSize:'0.85rem', padding:'0.4rem' }}>
                      {t('worldMap.back_to_map')}
                    </button>
                  </>
                )}
                {visitedData?.error && (
                  <div className="walk-garden-empty">
                    <div style={{fontSize:'2rem'}}>⚠️</div>
                    <div>{t('worldMap.garden_unavailable')}</div>
                    <button className="btn btn-secondary" style={{marginTop:'0.5rem',fontSize:'0.8rem'}} onClick={() => setVisitedData(null)}>{t('worldMap.back')}</button>
                  </div>
                )}
              </div>
            )}

            {/* D) Own garden actions */}
            {showOwnGardenPanel && !showNearbyChat && !showGardenVisit && (
              <div className="walk-garden-view">
                <button
                  type="button"
                  className="modal-close walk-garden-view__close"
                  onClick={() => setOwnGardenPanelDismissed(true)}
                  aria-label={t('worldMap.close_panel')}
                  title={t('worldMap.close_panel')}
                >
                  ✕
                </button>
                <div className="walk-garden-header">
                  <div>
                    <h3>{t('worldMap.own_garden_title')}</h3>
                    <div className="walk-garden-meta">
                      <span>📍 {pos.x},{pos.y}</span>
                      <span>{t('worldMap.own_garden_plot', { n: ownGardenTargetPlot + 1 })}</span>
                    </div>
                  </div>
                </div>
                <div className="walk-garden-note">{t('worldMap.own_garden_hint')}</div>
                {lastOwnActionText && (
                  <div className="walk-garden-note">{lastOwnActionText}</div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.35rem' }}>
                  {ownGardenTools.map((tool) => (
                    <button
                      key={tool}
                      type="button"
                      className={`btn btn-secondary ${gameState.selectedTool === tool ? 'world-action-item--active' : ''}`}
                      style={{ fontSize: '0.72rem', padding: '0.28rem 0.35rem' }}
                      onClick={() => {
                        onUpdateGame((prev) => ({ ...prev, selectedTool: tool }));
                        applyToolOnOwnPlot(ownGardenTargetPlot, tool);
                      }}
                    >
                      {TOOL_ICONS[tool]} {getToolLabel(tool)}
                    </button>
                  ))}
                </div>
                {gameState.selectedTool === 'plant' && (
                  <>
                    <label htmlFor="own-garden-seed-select" className="walk-garden-note">
                      {t('worldMap.seed_picker_label')}
                    </label>
                    <select
                      id="own-garden-seed-select"
                      className="chat-input"
                      value={gameState.selectedSeed}
                      onChange={(e) => onUpdateGame((prev) => ({ ...prev, selectedSeed: e.target.value }))}
                    >
                      {SEEDS.map((seed) => (
                        <option key={seed.id} value={seed.id}>{seed.emoji} {t(seed.labelKey)}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            )}

            {/* C) Garden hint */}
            {showGardenHint && nearGarden && !isCurrentPlayer(nearGarden) && !showOwnGardenPanel && (
              <div className="walk-garden-empty">
                <div style={{fontSize:'2.4rem'}}>🏡</div>
                <div style={{fontWeight:700}}>{t('worldMap.garden_of', { name: nearGarden.username })}</div>
                <div>{t('worldMap.press_visit')}</div>
                <button className="btn btn-primary" style={{marginTop:'0.75rem'}} onClick={() => openVisit(nearGarden)}>
                  {t('worldMap.visit_garden')}
                </button>
              </div>
            )}

            {nearMarketplace && !showOwnGardenPanel && (
              <div className="walk-garden-empty">
                <div style={{ fontSize: '2.4rem' }}>🏪</div>
                <div style={{ fontWeight: 700 }}>Marketplace</div>
                <div>Druk E of klik om te handelen</div>
                <button className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={openMarketplace}>
                  Open market
                </button>
              </div>
            )}

            {/* Geen losse empty-state panel meer */}
          </div>
        </div>

        {typeof document !== 'undefined' &&
          createPortal(
            <div className="walk-dpad walk-dpad--gameboy walk-dpad--world-float" role="group" aria-label={t('worldMap.header_hint')}>
              <button type="button" className="walk-dpad-btn walk-dpad-btn--up" onContextMenu={(e) => e.preventDefault()} onClick={() => { setClickTarget(null); move(0, -1, 'up'); }}>↑</button>
              <button type="button" className="walk-dpad-btn walk-dpad-btn--left" onContextMenu={(e) => e.preventDefault()} onClick={() => { setClickTarget(null); move(-1, 0, 'left'); }}>←</button>
              <button type="button" className="walk-dpad-btn walk-dpad-btn--right" onContextMenu={(e) => e.preventDefault()} onClick={() => { setClickTarget(null); move(1, 0, 'right'); }}>→</button>
              <button type="button" className="walk-dpad-btn walk-dpad-btn--down" onContextMenu={(e) => e.preventDefault()} onClick={() => { setClickTarget(null); move(0, 1, 'down'); }}>↓</button>
              <button type="button" className="walk-dpad-btn walk-dpad-btn--center" onContextMenu={(e) => e.preventDefault()} onClick={handlePrimaryInteract}>E</button>
            </div>,
            document.body
          )}
      </div>
  );

  if (embedded) return body;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      {body}
    </div>
  );
}

export default WorldMap;
