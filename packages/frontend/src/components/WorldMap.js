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
import StructuresPanel, { STRUCTURE_DEFS } from './StructuresPanel';
import { getStructureRingCoords, firstFreeStructureSlot } from '../utils/structureRing';
import { buildBiomeCoordMaps, biomeForTileCode, BIOME_ZONES } from '../utils/worldBiomes';
import { shouldUsePixiMap } from '../utils/deviceProfile';
import { tilePixiGradient } from '../utils/mapTileVisuals';
import { FALLBACK_WORLD_POIS, poiAt, poiNear, localizedField, poiWithInterior } from '../utils/worldPois';
import { applyCastleVillage, CASTLE_DRAWBRIDGE, isCastleDrawbridge, isCastleGate, isCastleVillageTile } from '../utils/castleVillageMap';
import { getInteriorById } from '../data/villageInteriors';
import WorldPoiModal from './WorldPoiModal';
import VillageInteriorView from './VillageInteriorView';
import PlayerProposalsPanel from './PlayerProposalsPanel';
import { DEFAULT_PLAYER_GARDEN_SLOTS, NPC_HOMES, resolveGardenSlots } from '../utils/gardenSlotRules';
import { buildProtectedGardenTileSet } from '../utils/worldBaseTerrain';

// ─── Map constants ────────────────────────────────────────────────────────────
const TILE   = 52;
const MAP_W  = 32;
const MAP_H  = 20;
const VIEW_W = 11;
const VIEW_H = 9;
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
const K = 7;  // dock / fishing platform (passable)
const V = 8;  // village cobblestone

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

// Kasteeldorp — gracht, binnenplein en loopbrug (sync met castleVillageMap.js).
applyCastleVillage(BASE_MAP, { W, T, V, P, G });

const GARDEN_SLOTS = DEFAULT_PLAYER_GARDEN_SLOTS;

const PROTECTED_GARDEN_TILES = buildProtectedGardenTileSet([
  ...GARDEN_SLOTS,
  ...NPC_HOMES.map(({ x, y }) => ({ x, y })),
]);

const START_X = 11;
const START_Y = 7;

const TILE_BG = { [G]: '#5fa33a', [P]: '#b8955a', [W]: '#3a8fc8', [T]: '#3a7a22', [D]: '#d2b56b', [M]: '#8a9099', [K]: '#6d4f2a', [V]: '#8b7b62', 4: '#8bc34a' };
const TILE_DECOR = { [G]: null, [P]: null, [W]: '🌊', [T]: '🌲', [D]: '🏜️', [M]: '⛰️', [K]: '⚓', [V]: null };
const OVERVIEW_TILE = 8;

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
const VIRTUAL_NEIGHBORS = NPC_HOMES;
const CASTLE_ENTRANCE = CASTLE_DRAWBRIDGE;

const WORLD_HUB = { x: Math.floor(MAP_W / 2), y: Math.floor(MAP_H / 2) };
const roadTile = (x, y) => {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
  if (PROTECTED_GARDEN_TILES.has(`${x},${y}`)) return;
  if (BASE_MAP[y][x] === W) return;
  if (BASE_MAP[y][x] === V) return;
  BASE_MAP[y][x] = P;
};
const roadBetween = (from, to) => {
  const stepX = from.x <= to.x ? 1 : -1;
  for (let x = from.x; x !== to.x + stepX; x += stepX) roadTile(x, from.y);
  const stepY = from.y <= to.y ? 1 : -1;
  for (let y = from.y; y !== to.y + stepY; y += stepY) roadTile(to.x, y);
};
[CASTLE_ENTRANCE, ...GARDEN_SLOTS].forEach((slot) => roadBetween(WORLD_HUB, slot));

// Dorps-POI's blijven op kasseien (geen dirt-path overlay)

// Passable biome garden strips (desert / dock / alpine foothills)
BIOME_ZONES.forEach((zone) => {
  zone.coords.forEach(({ x, y }) => {
    if (BASE_MAP[y] && BASE_MAP[y][x] === W) BASE_MAP[y][x] = K;
    else if (BASE_MAP[y] && (BASE_MAP[y][x] === T || BASE_MAP[y][x] === M)) BASE_MAP[y][x] = G;
    else if (zone.id === 'dock' && BASE_MAP[y]) BASE_MAP[y][x] = K;
  });
});
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

// ─────────────────────────────────────────────────────────────────────────────
function WorldMap({
  socket,
  currentUserId,
  currentUsername,
  gameState,
  onUpdateGame,
  onClose,
  onStartCall,
  onOpenDm,
  onOpenMarketplace,
  onWorldHudChange,
  embedded = false,
  hideDpad = false,
  suppressSidePanels = false,
  showOverviewMap: showOverviewMapProp,
  onShowOverviewMapChange,
  onSell,
  onBuildStructure,
  onUseWell,
  onUseCompost,
  onCollectEggs,
  onCollectMilk,
}) {
  const [embeddedViewport, setEmbeddedViewport] = useState({ w: EMBEDDED_VIEW_W, h: EMBEDDED_VIEW_H });
  const [worldPois, setWorldPois] = useState(FALLBACK_WORLD_POIS);
  const [activePoi, setActivePoi] = useState(null);
  const [activeInterior, setActiveInterior] = useState(null);
  const [villageNotice, setVillageNotice] = useState('');
  const [nearPoi, setNearPoi] = useState(null);
  const [playerPulse, setPlayerPulse] = useState(false);
  const [findMeNotice, setFindMeNotice] = useState('');
  const pulseTimerRef = useRef(null);
  const findMeNoticeTimerRef = useRef(null);
  const [serverNpcState, setServerNpcState] = useState(null);
  const [proposalNotice, setProposalNotice] = useState('');
  const [WalkMapPixi, setWalkMapPixi] = useState(null);
  const pixiEnabled = embedded && shouldUsePixiMap();
  const mapMainRef = useRef(null);
  const viewW = embedded ? embeddedViewport.w : VIEW_W;
  const viewH = embedded ? embeddedViewport.h : VIEW_H;
  /** Altijd vaste tegelgrootte (zoals oorspronkelijk), geen “kleiner schalen”. */
  const pxTile = TILE;
  const { t, i18n } = useTranslation();
  const poiLang = i18n.language?.startsWith('en') ? 'en' : 'nl';
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
  const mapW = useMemo(() => serverMap[0]?.length || MAP_W, [serverMap]);
  const mapH = useMemo(() => serverMap.length || MAP_H, [serverMap]);
  const [serverSlots,    setServerSlots]    = useState(GARDEN_SLOTS);
  const [worldOccupants, setWorldOccupants] = useState([]);
  const [gardenPreviews, setGardenPreviews] = useState({});
  const refreshTimerRef = useRef(null);
  const pollTimerRef = useRef(null);
  const refreshInFlightRef = useRef(false);
  const lastRefreshRef = useRef(0);
  const stableGardenByUserRef = useRef(new Map());
  const hasGardenProjectionRef = useRef(false);

  const mergeOccupantsFromApi = useCallback((occupants) => {
    if (!Array.isArray(occupants) || occupants.length === 0) return null;
    const next = new Map(stableGardenByUserRef.current);
    occupants.forEach((o) => {
      if (!o?.userId || !Number.isInteger(o.x) || !Number.isInteger(o.y)) return;
      const key = String(o.userId);
      const existing = next.get(key);
      if (existing && Number.isInteger(existing.x) && Number.isInteger(existing.y)) {
        next.set(key, {
          ...existing,
          username: o.username || existing.username,
          slotId: Number.isInteger(o.slotId) ? o.slotId : existing.slotId,
          sharedCount: o.sharedCount || existing.sharedCount || 1,
        });
        return;
      }
      next.set(key, {
        id: o.userId,
        username: o.username,
        slotId: o.slotId,
        x: o.x,
        y: o.y,
        sharedCount: o.sharedCount || 1,
      });
    });
    stableGardenByUserRef.current = next;
    hasGardenProjectionRef.current = true;
    return Array.from(next.values());
  }, []);

  const refreshWorldProjection = useCallback(async () => {
    refreshInFlightRef.current = true;
    try {
      const data = await api.get('/api/world/gardens');
      if (data && Array.isArray(data.map)) setServerMap(data.map);
      setServerSlots(resolveGardenSlots(data?.gardenSlots));
      const merged = mergeOccupantsFromApi(data?.occupants);
      if (merged) setWorldOccupants(merged);
      if (data?.gardenPreviewByUserId) {
        setGardenPreviews((prev) => ({ ...prev, ...data.gardenPreviewByUserId }));
      }
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
        setServerSlots(resolveGardenSlots(data.gardenSlots));
      }
    } catch {
      // Keep defaults
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [mergeOccupantsFromApi]);

  useEffect(() => {
    api.get('/api/world/pois')
      .then((data) => {
        if (Array.isArray(data?.pois) && data.pois.length) setWorldPois(data.pois);
      })
      .catch(() => {});
    api.get('/api/world/npcs')
      .then((data) => { if (data?.npcs) setServerNpcState(data); })
      .catch(() => {});
  }, []);

  const scheduleProjectionRefresh = useCallback((delayMs = 0) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    refreshTimerRef.current = setTimeout(() => {
      const now = Date.now();
      if (refreshInFlightRef.current) return;
      if (now - lastRefreshRef.current < 2000) return;
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
    }, 30000);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    };
  }, [scheduleProjectionRefresh]);

  const [players,        setPlayers]        = useState([]);
  const [playerPositions,setPlayerPositions]= useState({}); // userId → {x,y,username,level}
  const [pos,            setPos]            = useState({ x: START_X, y: START_Y });
  const [facing,         setFacing]         = useState('down');  // eslint-disable-line

  // Overview map (optionally controlled from App header)
  const [showOverviewMapInternal, setShowOverviewMapInternal] = useState(false);
  const showOverviewMap = showOverviewMapProp !== undefined ? showOverviewMapProp : showOverviewMapInternal;
  const setShowOverviewMap = onShowOverviewMapChange || setShowOverviewMapInternal;
  const [overviewSearch, setOverviewSearch] = useState('');
  const [ownPanelSection, setOwnPanelSection] = useState(null);
  const [activeStructureId, setActiveStructureId] = useState(null);

  // Garden visiting
  const [nearGarden,   setNearGarden]   = useState(null);
  const [visitedData,  setVisitedData]  = useState(null);
  const [loadingVisit, setLoadingVisit] = useState(false);
  const [helpDone,     setHelpDone]     = useState(false);
  const [clickTarget, setClickTarget] = useState(null);
  const [lastOwnActionText, setLastOwnActionText] = useState('');
  const [ownGardenPanelDismissed, setOwnGardenPanelDismissed] = useState(false);

  // Proximity chat
  const [nearbyPlayer, setNearbyPlayer] = useState(null);     // closest walking player within range
  const [proximityPanelOpen, setProximityPanelOpen] = useState(false);
  const [proximitySubview, setProximitySubview] = useState('overview'); // overview | garden | proposals
  const [helpGivenNotice, setHelpGivenNotice] = useState('');
  const [npcNotice, setNpcNotice] = useState('');
  const [npcShopStock, setNpcShopStock] = useState(() => ({ ...NPC_SHOP }));
  // NPC's blijven op vaste thuislocatie (geen patrol / geen lopende bots op de kaart).
  const staticNpcHomes = useMemo(() => (
    VIRTUAL_NEIGHBORS.map((n) => ({ ...n, virtual: true, x: n.x, y: n.y }))
  ), []);
  const lastNpcRefreshDayRef = useRef(null);

  const viewportRef = useRef(null);
  const gardenPanelRef = useRef(null);
  const spawnedAtOwnGardenRef = useRef(false);
  const hasUserMovedRef = useRef(false);
  const lockedOwnHomeRef = useRef(null);
  // ── Socket: keep player list in sync ─────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const onList    = (list)   => {
      setPlayers(list.filter((p) => !isCurrentPlayer({ id: p.id, username: p.username })));
    };
    const onJoined  = (player) => {
      setPlayers(prev => [...prev.filter(p => p.id !== player.id), player]);
    };
    const onLeft    = ({ id }) => {
      setPlayers(prev => prev.filter(p => p.id !== id));
      setPlayerPositions(prev => { const n = {...prev}; delete n[id]; return n; });
    };
    socket.on('players:list',  onList);
    socket.on('player:joined', onJoined);
    socket.on('player:left',   onLeft);
    return () => {
      socket.off('players:list',  onList);
      socket.off('player:joined', onJoined);
      socket.off('player:left',   onLeft);
    };
  }, [socket, currentUserId, isCurrentPlayer]);

  // ── Socket: live positions of other walking players ───────────────────────
  useEffect(() => {
    if (!socket) return;
    const onMoved   = ({ userId, username, x, y }) =>
      setPlayerPositions(prev => ({ ...prev, [userId]: { x, y, username } }));
    const onOffline = ({ userId }) =>
      setPlayerPositions(prev => { const n = {...prev}; delete n[userId]; return n; });
    const onSnapshot = (positions) => {
      if (!Array.isArray(positions)) return;
      setPlayerPositions((prev) => {
        const next = { ...prev };
        positions.forEach((p) => {
          if (!p?.userId || String(p.userId) === String(currentUserId)) return;
          next[p.userId] = { x: p.x, y: p.y, username: p.username };
        });
        return next;
      });
    };
    socket.on('world:player-moved', onMoved);
    socket.on('world:player-offline', onOffline);
    socket.on('world:positions-snapshot', onSnapshot);
    socket.emit('world:request-positions');
    return () => {
      socket.off('world:player-moved', onMoved);
      socket.off('world:player-offline', onOffline);
      socket.off('world:positions-snapshot', onSnapshot);
    };
  }, [socket, currentUserId]);

  // ── Socket: refresh world projection when any garden changes ───────────────
  useEffect(() => {
    if (!socket) return;
    const onPreviewUpdated = () => {
      scheduleProjectionRefresh(200);
    };
    socket.on('garden:preview-updated', onPreviewUpdated);
    return () => socket.off('garden:preview-updated', onPreviewUpdated);
  }, [socket, scheduleProjectionRefresh]);

  // ── Build garden map from server-authoritative occupants ──────────────────
  const renderOccupants = useMemo(() => {
    if (worldOccupants.length > 0) return worldOccupants;
    const stable = Array.from(stableGardenByUserRef.current.values());
    if (stable.length > 0) return stable;
    if (hasGardenProjectionRef.current) return [];
    return players
      .slice(0, serverSlots.length)
      .map((p, idx) => ({
        id: p.id,
        username: p.username,
        slotId: idx,
        x: serverSlots[idx]?.x,
        y: serverSlots[idx]?.y,
      }));
  }, [worldOccupants, players, serverSlots]);
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
    if (serverNpcState?.npcs?.length) {
      serverNpcState.npcs.forEach((n) => {
        if (n.preview) previews[String(n.id)] = n.preview;
      });
    }
    staticNpcHomes.forEach((n) => {
      if (!previews[String(n.id)]) {
        previews[String(n.id)] = npcGardenToPreview(NPC_GARDENS[n.id] || []);
      }
    });
    return previews;
  }, [serverNpcState, staticNpcHomes]);
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
    const sorted = [...displayGardenOwners].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    sorted.forEach((player) => {
      if (!Number.isInteger(player.x) || !Number.isInteger(player.y)) return;
      const key = `${player.x},${player.y}`;
      if (map[key]) return;
      map[key] = player;
    });
    return map;
  }, [displayGardenOwners]);

  const gardenCoOwnersByCoord = useMemo(() => {
    const map = {};
    renderOccupantsWithSelf.forEach((player) => {
      if (!Number.isInteger(player?.x) || !Number.isInteger(player?.y)) return;
      const key = `${player.x},${player.y}`;
      if (!map[key]) map[key] = [];
      map[key].push(player);
    });
    return map;
  }, [renderOccupantsWithSelf]);

  const gardenPlotCoordMap = useMemo(() => {
    const map = {};
    displayGardenOwners.forEach((player) => {
      if (!Number.isInteger(player?.x) || !Number.isInteger(player?.y)) return;
      for (let i = 0; i < 9; i += 1) {
        const tx = player.x - 1 + (i % 3);
        const ty = player.y + 1 + Math.floor(i / 3);
        map[`${tx},${ty}`] = player;
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
  const ownPatchCoordToIndex = useMemo(() => {
    const map = {};
    if (ownHome && gameState?.plots?.length) {
      for (let i = 0; i < 9; i += 1) {
        const px = ownHome.x - 1 + (i % 3);
        const py = ownHome.y + 1 + Math.floor(i / 3);
        map[`${px},${py}`] = i;
      }
    }
    return map;
  }, [ownHome, gameState?.plots]);
  const currentOwnPlotIndex = Number.isInteger(ownPatchCoordToIndex[`${pos.x},${pos.y}`])
    ? ownPatchCoordToIndex[`${pos.x},${pos.y}`]
    : null;

  const structureEmojiById = useMemo(
    () => Object.fromEntries(STRUCTURE_DEFS.map((d) => [d.id, d.emoji])),
    [],
  );

  const structureByCoord = useMemo(() => {
    if (!ownHome || !gameState?.structures) return {};
    const ring = getStructureRingCoords(ownHome.x, ownHome.y);
    const map = {};
    Object.entries(gameState.structures).forEach(([id, st]) => {
      if (!st?.built || !Number.isInteger(st.ringSlot)) return;
      const coord = ring[st.ringSlot];
      if (coord) map[`${coord.x},${coord.y}`] = { id, emoji: structureEmojiById[id] || '🏗️' };
    });
    return map;
  }, [ownHome, gameState?.structures, structureEmojiById]);

  useEffect(() => {
    if (!ownHome || !onUpdateGame || !gameState?.structures) return;
    const needsSlot = Object.entries(gameState.structures).some(
      ([, st]) => st?.built && !Number.isInteger(st.ringSlot),
    );
    if (!needsSlot) return;
    const used = new Set();
    const nextStructures = { ...gameState.structures };
    Object.entries(nextStructures).forEach(([id, st]) => {
      if (st?.built && Number.isInteger(st.ringSlot)) used.add(st.ringSlot);
      else if (st?.built) {
        const slot = [...Array(12).keys()].find((i) => !used.has(i));
        if (slot !== undefined) {
          used.add(slot);
          nextStructures[id] = { ...st, ringSlot: slot };
        }
      }
    });
    onUpdateGame((prev) => ({ ...prev, structures: nextStructures }));
  }, [ownHome, gameState?.structures, onUpdateGame]);

  const handleBuildStructureAtGarden = useCallback((id) => {
    if (!onBuildStructure || !ownHome) return;
    const slot = firstFreeStructureSlot(gameState?.structures);
    if (slot < 0) {
      setLastOwnActionText(t('structures.ring_full'));
      return;
    }
    onBuildStructure(id, slot);
    setLastOwnActionText(t('structures.built_on_ring', { emoji: structureEmojiById[id] || '🏗️' }));
  }, [onBuildStructure, ownHome, gameState?.structures, structureEmojiById, t]);

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
        if (tx < 0 || ty < 0 || tx >= mapW || ty >= mapH) continue;
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
  }, [displayGardenOwners, isCurrentPlayer, gardenPreviews, virtualGardenPreviews, mapW, mapH]);
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
            if ((inventory.fertilizer || 0) > 0) {
              inventory.fertilizer -= 1;
            } else {
              coinsDelta = -5;
            }
            plot.fertilized = true;
            xpDelta = 5;
          }
          break;
        case 'spray':
          if (plot.pest) {
            if ((inventory.spray || 0) > 0) {
              inventory.spray -= 1;
            }
            plot.pest = false;
            xpDelta = 3;
          }
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
    if (x < 0 || x >= mapW || y < 0 || y >= mapH) return W;
    if (poiAt(worldPois, x, y)) {
      return isCastleVillageTile(x, y) ? V : P;
    }
    if (gardenMap[`${x},${y}`] || gardenPlotCoordMap[`${x},${y}`]) return 4;
    return serverMap[y]?.[x] ?? G;
  }, [gardenMap, gardenPlotCoordMap, serverMap, mapW, mapH, worldPois]);
  const isPassable = useCallback((x, y) => {
    const t = getTile(x, y);
    return t !== W && t !== T && t !== M;
  }, [getTile]);

  const { coordToPlot: biomeCoordToPlot, coordToZone: biomeCoordToZone } = useMemo(
    () => buildBiomeCoordMaps(),
    [],
  );
  const currentBiomePlotIndex = Number.isInteger(biomeCoordToPlot[`${pos.x},${pos.y}`])
    ? biomeCoordToPlot[`${pos.x},${pos.y}`]
    : null;
  const [biomeNotice, setBiomeNotice] = useState('');

  // ── Broadcast own position ────────────────────────────────────────────────
  const lastBroadcastPosRef = useRef(null);
  const broadcastPos = useCallback((x, y) => {
    if (lastBroadcastPosRef.current &&
        lastBroadcastPosRef.current.x === x &&
        lastBroadcastPosRef.current.y === y) return;
    lastBroadcastPosRef.current = { x, y };
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
  }, [broadcastPos, isPassable]);

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

  useEffect(() => {
    if (!pixiEnabled) {
      setWalkMapPixi(null);
      return undefined;
    }
    let live = true;
    import('./WalkMapPixiRenderer')
      .then((mod) => { if (live) setWalkMapPixi(() => mod.default); })
      .catch(() => { if (live) setWalkMapPixi(null); });
    return () => { live = false; };
  }, [pixiEnabled]);

  useLayoutEffect(() => {
    if (!embedded || !mapMainRef.current) return undefined;
    const el = mapMainRef.current;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w < 32 || h < 32) return;

      const tw = Math.min(mapW, Math.max(EMBEDDED_MIN_VIEW_W, Math.floor(w / TILE)));
      const th = Math.min(mapH, Math.max(EMBEDDED_MIN_VIEW_H, Math.floor(h / TILE)));

      setEmbeddedViewport((prev) => ((prev.w === tw && prev.h === th) ? prev : { w: tw, h: th }));
    };
    measure();

    let resizeObserver = null;
    if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'function') {
      resizeObserver = new window.ResizeObserver(measure);
      resizeObserver.observe(el);
    } else if (typeof window !== 'undefined') {
      window.addEventListener('resize', measure);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else if (typeof window !== 'undefined') {
        window.removeEventListener('resize', measure);
      }
    };
  }, [embedded, mapW, mapH]);

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

  const enterInterior = useCallback((poi) => {
    const interior = getInteriorById(poi?.interiorId);
    if (!interior) return;
    setActiveInterior({ poi, interior });
    setActivePoi(null);
  }, []);

  const exitInterior = useCallback(() => {
    setActiveInterior(null);
  }, []);

  const flashWorldLocate = useCallback((message) => {
    setFindMeNotice(message);
    clearTimeout(findMeNoticeTimerRef.current);
    findMeNoticeTimerRef.current = setTimeout(() => setFindMeNotice(''), 2800);
    setPlayerPulse(true);
    clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = setTimeout(() => setPlayerPulse(false), 4500);
    viewportRef.current?.focus();
  }, []);

  const jumpToWorldPoint = useCallback((tx, ty, notice, extraCandidates = []) => {
    if (activeInterior) exitInterior();
    setShowOverviewMap(false);
    setClickTarget(null);
    setVisitedData(null);
    setHelpDone(false);

    const candidates = [
      ...extraCandidates,
      { x: tx, y: ty + 1 },
      { x: tx - 1, y: ty },
      { x: tx + 1, y: ty },
      { x: tx, y: ty - 1 },
      { x: tx - 1, y: ty + 1 },
      { x: tx + 1, y: ty + 1 },
      { x: tx, y: ty },
    ];

    const target = candidates.find((c) => isPassable(c.x, c.y));
    if (target) {
      hasUserMovedRef.current = true;
      setPos(target);
      broadcastPos(target.x, target.y);
      flashWorldLocate(notice || t('worldMap.find_me_here'));
      return true;
    }

    flashWorldLocate(t('worldMap.overview_jump_blocked'));
    return false;
  }, [
    activeInterior,
    exitInterior,
    isPassable,
    broadcastPos,
    setShowOverviewMap,
    flashWorldLocate,
    t,
  ]);

  const findMyGarden = useCallback(() => {
    setOwnGardenPanelDismissed(false);
    if (!ownHome) {
      flashWorldLocate(t('worldMap.find_me_here'));
      return;
    }
    jumpToWorldPoint(
      ownHome.x,
      ownHome.y,
      t('worldMap.find_me_done'),
      [
        { x: ownHome.x, y: ownHome.y + 1 },
        { x: ownHome.x - 1, y: ownHome.y + 1 },
        { x: ownHome.x + 1, y: ownHome.y + 1 },
      ],
    );
  }, [ownHome, jumpToWorldPoint, flashWorldLocate, t]);

  const jumpToOverviewEntry = useCallback((entry) => {
    if (!entry || !Number.isInteger(entry.x) || !Number.isInteger(entry.y)) return;
    jumpToWorldPoint(
      entry.x,
      entry.y,
      entry.isMe
        ? t('worldMap.find_me_done')
        : t('worldMap.overview_jump_done', { name: entry.username }),
    );
  }, [jumpToWorldPoint, t]);

  const handlePrimaryInteract = useCallback(() => {
    if (activeInterior) return;
    if (nearPoi) {
      if (poiWithInterior(nearPoi)) {
        enterInterior(nearPoi);
        return;
      }
      if (nearPoi.type === 'info') {
        setActivePoi(nearPoi);
        return;
      }
      if (nearPoi.type === 'market') {
        enterInterior(nearPoi);
        return;
      }
      setActivePoi(nearPoi);
      return;
    }
    if (currentOwnPlotIndex !== null && currentOwnPlotIndex !== undefined) {
      applyToolOnOwnPlot(currentOwnPlotIndex);
      return;
    }
    if ((nearGarden && !isCurrentPlayer(nearGarden)) || (nearbyPlayer && !isCurrentPlayer(nearbyPlayer))) {
      setProximitySubview('overview');
      setProximityPanelOpen(true);
    }
  }, [activeInterior, nearPoi, enterInterior, currentOwnPlotIndex, applyToolOnOwnPlot, nearGarden, nearbyPlayer, isCurrentPlayer]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return;
      if (activeInterior) {
        return;
      }
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
          else if (proximityPanelOpen) closeProximityPanel();
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
  }, [visitedData, move, onClose, embedded, onUpdateGame, ownHome, pos.x, pos.y, proximityPanelOpen, handlePrimaryInteract, activeInterior, exitInterior]); // eslint-disable-line

  // ── Proximity detection ───────────────────────────────────────────────────
  const WALKER_PROXIMITY = 2;
  useEffect(() => {
    const gKey = `${pos.x},${pos.y}`;
    const gardenOwner = gardenMap[gKey] || null;
    const patchOwnerId = neighborPatchCoordMap[gKey]?.ownerId;
    const patchOwner = patchOwnerId ? displayGardenOwnersById[String(patchOwnerId)] : null;
    const activeOwner = (!gardenOwner || isCurrentPlayer(gardenOwner)) ? patchOwner : gardenOwner;
    const canInteract = !!activeOwner && !isCurrentPlayer(activeOwner);

    let closestWalker = null;
    let closestDist = WALKER_PROXIMITY + 1;
    Object.entries(playerPositions).forEach(([uid, p]) => {
      if (String(uid) === String(currentUserId)) return;
      const d = Math.abs(p.x - pos.x) + Math.abs(p.y - pos.y);
      if (d <= WALKER_PROXIMITY && d < closestDist) {
        closestDist = d;
        closestWalker = { id: uid, username: p.username, x: p.x, y: p.y, virtual: false };
      }
    });
    const plazaPoi = poiNear(worldPois, pos.x, pos.y, 2);
    setNearGarden(canInteract ? activeOwner : null);
    setNearbyPlayer(canInteract ? { ...activeOwner } : closestWalker);
    setNearPoi(plazaPoi);
  }, [pos, gardenMap, neighborPatchCoordMap, displayGardenOwnersById, isCurrentPlayer, worldPois, playerPositions, currentUserId]);

  const handleTileClick = useCallback((tileData) => {
    const { mx, my, ownPlot, ownPatchIndex, gardenPlayer, structureDecor, tile, poi } = tileData;
    if (mx !== pos.x || my !== pos.y) hasUserMovedRef.current = true;
    const biomePlotIndex = biomeCoordToPlot[`${mx},${my}`];
    if (ownPlot && ownPatchIndex !== null && ownPatchIndex !== undefined) {
      applyToolOnOwnPlot(ownPatchIndex);
      return;
    }
    if (
      Number.isInteger(biomePlotIndex)
      && mx === pos.x && my === pos.y
    ) {
      setOwnGardenPanelDismissed(false);
      applyToolOnOwnPlot(biomePlotIndex);
      return;
    }
    if (mx === pos.x && my === pos.y) {
      if (poi) {
        if (poiWithInterior(poi)) {
          enterInterior(poi);
          return;
        }
        setActivePoi(poi);
        return;
      }
      if (structureDecor) {
        setOwnGardenPanelDismissed(false);
        setOwnPanelSection('structures');
        setActiveStructureId(structureDecor.id);
        return;
      }
      if (tile === W || tile === T || tile === M) {
        const biome = biomeForTileCode(tile);
        setBiomeNotice(t(`worldMap.biome_interact_${biome}`, { defaultValue: '' }));
        return;
      }
      if (gardenPlayer) {
        if (!isCurrentPlayer(gardenPlayer)) {
          setProximitySubview('overview');
          setProximityPanelOpen(true);
        }
      }
      return;
    }
    if (!isPassable(mx, my)) return;
    setClickTarget({ x: mx, y: my });
  }, [pos.x, pos.y, isCurrentPlayer, isPassable, openVisit, applyToolOnOwnPlot, biomeCoordToPlot, t, enterInterior]);

  const handleHelp = useCallback(() => {
    const target = visitedData?.player || nearbyPlayer;
    if (!target || helpDone) return;
    socket?.emit('player:help', { targetUserId: target.id, amount: 15 });
    setHelpDone(true);
    setHelpGivenNotice(`🤝 Jij hebt ${target.username} geholpen!`);
    setTimeout(() => setHelpGivenNotice(''), 2500);
  }, [visitedData, nearbyPlayer, helpDone, socket]);

  const closeProximityPanel = useCallback(() => {
    setProximityPanelOpen(false);
    setProximitySubview('overview');
    setVisitedData(null);
    setHelpDone(false);
    setLoadingVisit(false);
  }, []);

  const openVisitFromPanel = useCallback(async (player) => {
    setProximitySubview('garden');
    await openVisit(player);
  }, [openVisit]);

  const nearbyIdKey = nearbyPlayer?.id !== null && nearbyPlayer?.id !== undefined ? String(nearbyPlayer.id) : null;
  useEffect(() => {
    closeProximityPanel();
  }, [nearbyIdKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Camera: volledige kaart bereikbaar; rand zichtbaar op kleine schermen ──
  const camAnchorX = Math.floor(viewW / 2);
  const camAnchorY = Math.floor(viewH / 2);
  const maxCamX = Math.max(0, mapW - viewW);
  const maxCamY = Math.max(0, mapH - viewH);
  const rawCamX = pos.x - camAnchorX;
  const rawCamY = pos.y - camAnchorY;
  const camX = Math.max(0, Math.min(maxCamX, rawCamX));
  const camY = Math.max(0, Math.min(maxCamY, rawCamY));
  const atEdgeLeft = camX <= 0;
  const atEdgeRight = camX >= maxCamX;
  const atEdgeTop = camY <= 0;
  const atEdgeBottom = camY >= maxCamY;
  const mapFitScale = 1;

  // ── Render tile grid ──────────────────────────────────────────────────────
  const tiles = useMemo(() => {
    const grid = [];
    for (let vy = 0; vy < viewH; vy += 1) {
      for (let vx = 0; vx < viewW; vx += 1) {
        const mx = camX + vx;
        const my = camY + vy;
        const tile = getTile(mx, my);
        const gardenPlayer = gardenMap[`${mx},${my}`];
        const isMe = mx === pos.x && my === pos.y;
        const preview = gardenPlayer
          ? (gardenPlayer.virtual
            ? virtualGardenPreviews[String(gardenPlayer.id)]
            : gardenPreviews[String(gardenPlayer.id)])
          : null;
        const ownPatchIndex = Number.isInteger(ownPatchCoordToIndex[`${mx},${my}`])
          ? ownPatchCoordToIndex[`${mx},${my}`]
          : null;
        const ownPlot = (ownPatchIndex !== null && ownPatchIndex !== undefined)
          ? gameState?.plots?.[ownPatchIndex]
          : null;
        const neighborPatch = neighborPatchCoordMap[`${mx},${my}`];
        const structureDecor = structureByCoord[`${mx},${my}`];
        const poi = poiAt(worldPois, mx, my);
        const isMarketTile = poi?.type === 'market';
        const isWorldEdge = mx === 0 || mx === mapW - 1 || my === 0 || my === mapH - 1;
        const coOwners = gardenCoOwnersByCoord[`${mx},${my}`] || [];

        grid.push({
          vx, vy, mx, my, tile, gardenPlayer, preview, ownPatchIndex, ownPlot,
          neighborPatch, isMe, isMarketTile, structureDecor, poi, isWorldEdge, coOwners,
        });
      }
    }
    return grid;
  }, [
    viewH, viewW, camX, camY, mapW, mapH, pos.x, pos.y, getTile, gardenMap,
    virtualGardenPreviews, gardenPreviews, ownPatchCoordToIndex, gameState?.plots,
    neighborPatchCoordMap, structureByCoord, worldPois, gardenCoOwnersByCoord,
  ]);

  const usePixiLayer = pixiEnabled && WalkMapPixi;

  const pixiTileSpecs = useMemo(() => {
    if (!usePixiLayer) return [];
    return tiles.map((t) => {
      const biomePlotIndex = biomeCoordToPlot[`${t.mx},${t.my}`];
      const biomePlot = Number.isInteger(biomePlotIndex)
        ? gameState?.plots?.[biomePlotIndex]
        : null;
      const isHighlighted = t.isMe && !!nearGarden;
      const plotSource = t.ownPlot || biomePlot;
      let plotOverlay = null;
      if (plotSource) {
        plotOverlay = {
          tilled: !!plotSource.tilled,
          planted: !!plotSource.planted,
          active: (currentOwnPlotIndex === t.ownPatchIndex)
            || (currentBiomePlotIndex === biomePlotIndex),
          emoji: plotSource.planted ? (plotEmoji(plotSource) || '🌱') : null,
        };
      }

      const coCount = t.coOwners?.length || 0;
      const houseLabel = t.gardenPlayer
        ? (coCount > 1
          ? `${t.gardenPlayer.username} +${coCount - 1}`
          : t.gardenPlayer.username)
        : null;

      return {
        vx: t.vx,
        vy: t.vy,
        gradientStops: tilePixiGradient(t.tile, { highlighted: isHighlighted }),
        borderHex: t.isMarketTile ? '#fff59d' : (t.structureDecor ? '#81c784' : null),
        worldEdge: t.isWorldEdge,
        decor: t.poi ? null : (TILE_DECOR[t.tile] || null),
        poiEmoji: t.poi?.emoji || null,
        plotOverlay,
        houseEmoji: t.gardenPlayer ? '🏡' : (t.isMarketTile ? '🏪' : null),
        houseLabel,
        clickPayload: {
          mx: t.mx,
          my: t.my,
          ownPlot: t.ownPlot,
          ownPatchIndex: t.ownPatchIndex,
          tile: t.tile,
          gardenPlayer: t.gardenPlayer,
          structureDecor: t.structureDecor,
          poi: t.poi,
        },
      };
    });
  }, [
    usePixiLayer, tiles, biomeCoordToPlot, gameState?.plots, nearGarden,
    currentOwnPlotIndex, currentBiomePlotIndex,
  ]);

  const pixiPlayerTile = useMemo(() => {
    const me = tiles.find((t) => t.isMe);
    return me ? { vx: me.vx, vy: me.vy } : null;
  }, [tiles]);

  const visibleWalkers = useMemo(() => {
    // Alleen online spelers met live socket-positie — offline tuineigenaren niet als poppetje.
    const inView = Object.entries(playerPositions)
      .filter(([uid, p]) => String(uid) !== String(currentUserId) && Number.isInteger(p?.x) && Number.isInteger(p?.y))
      .map(([uid, p]) => ({ uid: String(uid), username: p.username, x: p.x, y: p.y, virtual: false }))
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
  }, [playerPositions, currentUserId, camX, camY, viewW, viewH]);

  const pixiWalkers = useMemo(() => (
    usePixiLayer
      ? visibleWalkers.map((w) => ({
        vx: w.vx,
        vy: w.vy,
        stackOffset: w.stack * Math.min(16, Math.round(pxTile * 0.28)),
        virtual: w.virtual,
        initial: w.virtual ? null : (w.username?.[0]?.toUpperCase() || '?'),
      }))
      : []
  ), [usePixiLayer, visibleWalkers, pxTile]);

  const liveMapPlayers = useMemo(() => {
    const map = {};
    otherPlayers.forEach((p) => {
      const live = playerPositions[p.id];
      map[String(p.id)] = {
        id: p.id,
        username: p.username,
        x: Number.isInteger(live?.x) ? live.x : p.x,
        y: Number.isInteger(live?.y) ? live.y : p.y,
        online: true,
        virtual: false,
      };
    });
    Object.entries(playerPositions).forEach(([uid, p]) => {
      if (String(uid) === String(currentUserId)) return;
      map[String(uid)] = {
        id: uid,
        username: p.username,
        x: p.x,
        y: p.y,
        online: true,
        virtual: false,
      };
    });
    return Object.values(map).filter((p) => Number.isInteger(p.x) && Number.isInteger(p.y));
  }, [otherPlayers, playerPositions, currentUserId]);

  const overviewTerrainCells = useMemo(() => {
    const cells = [];
    for (let y = 0; y < mapH; y += 1) {
      for (let x = 0; x < mapW; x += 1) {
        const code = getTile(x, y);
        cells.push({
          x,
          y,
          code,
          bg: TILE_BG[code] || '#5fa33a',
          decor: TILE_DECOR[code],
        });
      }
    }
    return cells;
  }, [mapH, mapW, getTile]);

  const overviewSearchEntries = useMemo(() => {
    const seen = new Set();
    const entries = [];
    const add = (player) => {
      if (!player || !Number.isInteger(player.x) || !Number.isInteger(player.y)) return;
      const key = String(player.id);
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({
        id: key,
        username: player.username,
        x: player.x,
        y: player.y,
        virtual: !!player.virtual,
        isMe: isCurrentPlayer(player),
      });
    };
    liveMapPlayers.forEach(add);
    displayGardenOwners.forEach(add);
    return entries.sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: 'base' }));
  }, [liveMapPlayers, displayGardenOwners, isCurrentPlayer]);

  const filteredOverviewEntries = useMemo(() => {
    const q = overviewSearch.trim().toLowerCase();
    if (!q) return overviewSearchEntries;
    return overviewSearchEntries.filter((e) => e.username.toLowerCase().includes(q));
  }, [overviewSearch, overviewSearchEntries]);

  const overviewTerrainLegend = useMemo(() => ([
    { code: G, label: t('worldMap.overview_tile_grass'), sample: TILE_BG[G] },
    { code: P, label: t('worldMap.overview_tile_path'), sample: TILE_BG[P] },
    { code: W, label: t('worldMap.overview_tile_water'), sample: TILE_BG[W] },
    { code: T, label: t('worldMap.overview_tile_forest'), sample: TILE_BG[T] },
    { code: M, label: t('worldMap.overview_tile_mountain'), sample: TILE_BG[M] },
    { code: D, label: t('worldMap.overview_tile_desert'), sample: TILE_BG[D] },
    { code: K, label: t('worldMap.overview_tile_dock'), sample: TILE_BG[K] },
    { code: 4, label: t('worldMap.overview_tile_garden'), sample: TILE_BG[4] },
  ]), [t]);

  const offScreenPlayers = useMemo(() => (
    liveMapPlayers
      .map((p) => {
        const inView = p.x >= camX && p.x < camX + viewW && p.y >= camY && p.y < camY + viewH;
        if (inView) return null;
        let edge = 'left';
        if (p.x >= camX + viewW - 1) edge = 'right';
        else if (p.y < camY) edge = 'top';
        else if (p.y >= camY + viewH - 1) edge = 'bottom';
        return { ...p, edge };
      })
      .filter(Boolean)
  ), [liveMapPlayers, camX, camY, viewW, viewH]);

  const walkEmoji = '🧑‍🌾';

  // Right panel mode
  const isVirtualUser = (player) => !!(player?.virtual || String(player?.id || '').startsWith('npc:'));
  const isNearbyVirtual = isVirtualUser(nearbyPlayer);
  const showNearbyPanel = proximityPanelOpen && !!nearbyPlayer;
  const showGardenVisitInPanel = showNearbyPanel && proximitySubview === 'garden' && (!!visitedData || loadingVisit);
  const showGardenVisit = showGardenVisitInPanel || (!proximityPanelOpen && (!!visitedData || loadingVisit));
  const structureAtPlayer = structureByCoord[`${pos.x},${pos.y}`];
  const isAtOwnStructure = !!structureAtPlayer && !!ownHome;
  const currentBiomeZone = biomeCoordToZone[`${pos.x},${pos.y}`] || null;
  const isAtBiomeGarden = currentBiomePlotIndex !== null;
  const isAtOwnGarden = (currentOwnPlotIndex !== null && currentOwnPlotIndex !== undefined)
    || (ownHome && pos.x === ownHome.x && pos.y === ownHome.y)
    || isAtOwnStructure
    || isAtBiomeGarden;
  const showOwnGardenPanel = isAtOwnGarden && !showGardenVisit && !ownGardenPanelDismissed;
  const harvestTotal = useMemo(
    () => Object.values(gameState?.inventory || {}).reduce((sum, qty) => sum + (qty > 0 ? qty : 0), 0),
    [gameState?.inventory],
  );
  const showFloatingPanel = !suppressSidePanels && (
    showNearbyPanel || showGardenVisit || showOwnGardenPanel
  );
  const ownGardenTargetPlot = (currentOwnPlotIndex !== null && currentOwnPlotIndex !== undefined)
    ? currentOwnPlotIndex
    : (currentBiomePlotIndex !== null ? currentBiomePlotIndex : homeDefaultPlotIndex);
  const ownGardenTools = QUICK_TOOLS;
  const getToolLabel = (tool) => t(`tool_${tool}`);

  useEffect(() => {
    if (!showGardenVisit || !gardenPanelRef.current) return;
    gardenPanelRef.current.scrollTop = 0;
  }, [showGardenVisit, visitedData?.player?.id, visitedData?.username]);

  useEffect(() => {
    if (!isAtOwnGarden && ownGardenPanelDismissed) setOwnGardenPanelDismissed(false);
  }, [isAtOwnGarden, ownGardenPanelDismissed]);

  useEffect(() => {
    if (!showOwnGardenPanel) setOwnPanelSection(null);
  }, [showOwnGardenPanel]);

  useEffect(() => {
    if (isAtOwnStructure && structureAtPlayer?.id) {
      setOwnPanelSection('structures');
      setActiveStructureId(structureAtPlayer.id);
    }
  }, [isAtOwnStructure, structureAtPlayer?.id]);

  // Proximity panel helpers
  const nearbyNpcGarden = useMemo(() => {
    if (!nearbyPlayer?.virtual) return [];
    const npcPlots = serverNpcState?.npcs?.find((n) => String(n.id) === String(nearbyPlayer.id))?.plots;
    return npcPlots || NPC_GARDENS[nearbyPlayer.id] || [];
  }, [nearbyPlayer, serverNpcState]);
  const nearbyNpcShop = nearbyPlayer?.virtual ? (npcShopStock[nearbyPlayer.id] || {}) : {};
  const nearbyNpcRole = nearbyPlayer?.virtual ? (NPC_ROLE_META[nearbyPlayer.role] || NPC_ROLE_META.trader) : null;
  const nearbyGardenPreview = useMemo(() => {
    if (!nearbyPlayer) return null;
    const key = String(nearbyPlayer.id);
    if (gardenPreviews[key]) return gardenPreviews[key];
    if (nearbyPlayer.virtual && virtualGardenPreviews[key]) return virtualGardenPreviews[key];
    return null;
  }, [nearbyPlayer, gardenPreviews, virtualGardenPreviews]);

  useEffect(() => {
    onWorldHudChange?.({
      coords: `${pos.x},${pos.y}`,
      onlineCount: players.length + (currentUserId && String(currentUserId) !== '0' ? 1 : 0),
    });
  }, [onWorldHudChange, pos.x, pos.y, players.length, currentUserId]);

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
            <div className={`walk-map-main${activeInterior ? ' walk-map-main--interior' : ''}`} ref={mapMainRef}>
            {activeInterior ? (
              <VillageInteriorView
                interior={activeInterior.interior}
                onExit={exitInterior}
                onOpenMarket={openMarketplace}
                gameState={gameState}
                onUpdateGame={onUpdateGame}
                onShopNotice={setVillageNotice}
                currentUserId={currentUserId}
              />
            ) : (
            <>
            {!embedded && (
            <button
              type="button"
              className="walk-overview-btn"
              onClick={() => setShowOverviewMap((v) => !v)}
              title={t('worldMap.overview_map_title')}
              aria-label={t('worldMap.overview_map_title')}
              aria-pressed={showOverviewMap}
            >
              {'\u{1F5FA}️'}
            </button>
            )}
            {showOverviewMap && (
              <div className={`walk-overview-panel${embedded ? ' walk-overview-panel--dock' : ''}`}>
                <div className="walk-overview-header">
                  <strong>{'\u{1F5FA}️'} {t('worldMap.overview_map_title')}</strong>
                  <button type="button" onClick={() => setShowOverviewMap(false)} aria-label={t('worldMap.close_panel')}>✕</button>
                </div>

                <label className="walk-overview-search-label">
                  <span className="walk-overview-search-label__text">{t('worldMap.overview_search_label')}</span>
                  <input
                    type="search"
                    className="walk-overview-search"
                    value={overviewSearch}
                    onChange={(e) => setOverviewSearch(e.target.value)}
                    placeholder={t('worldMap.overview_search_placeholder')}
                    aria-label={t('worldMap.overview_search_placeholder')}
                  />
                </label>

                <div className="walk-overview-map-wrap">
                  <div
                    className="walk-overview-map"
                    style={{ width: mapW * OVERVIEW_TILE, height: mapH * OVERVIEW_TILE }}
                  >
                    <div
                      className="walk-overview-terrain"
                      style={{
                        gridTemplateColumns: `repeat(${mapW}, ${OVERVIEW_TILE}px)`,
                        gridTemplateRows: `repeat(${mapH}, ${OVERVIEW_TILE}px)`,
                      }}
                    >
                      {overviewTerrainCells.map((cell) => (
                        <div
                          key={`${cell.x},${cell.y}`}
                          className="walk-overview-tile"
                          style={{ background: cell.bg }}
                          title={cell.decor || undefined}
                        />
                      ))}
                    </div>

                    <div className="walk-overview-markers">
                      {worldPois.map((poi) => (
                        <button
                          key={poi.id}
                          type="button"
                          className="walk-overview-poi"
                          style={{
                            left: poi.x * OVERVIEW_TILE - 1,
                            top: poi.y * OVERVIEW_TILE - 3,
                          }}
                          title={localizedField(poi.label, poiLang)}
                          onClick={() => jumpToWorldPoint(
                            poi.x,
                            poi.y,
                            t('worldMap.overview_jump_poi', { name: localizedField(poi.label, poiLang) }),
                          )}
                        >
                          {poi.emoji}
                        </button>
                      ))}

                      {displayGardenOwners.map((owner) => {
                        if (!Number.isInteger(owner.x) || !Number.isInteger(owner.y)) return null;
                        const isMeGarden = isCurrentPlayer(owner);
                        return (
                          <button
                            key={`g-${owner.id}`}
                            type="button"
                            className={`walk-overview-garden${isMeGarden ? ' walk-overview-garden--me' : ''}`}
                            style={{
                              left: owner.x * OVERVIEW_TILE - (isMeGarden ? 5 : 3),
                              top: owner.y * OVERVIEW_TILE - (isMeGarden ? 7 : 3),
                            }}
                            title={isMeGarden
                              ? t('worldMap.your_garden_marker')
                              : t('worldMap.legend_jump', { name: owner.username })}
                            onClick={() => jumpToOverviewEntry({
                              id: owner.id,
                              username: owner.username,
                              x: owner.x,
                              y: owner.y,
                              isMe: isMeGarden,
                            })}
                          >
                            {isMeGarden ? '🏡' : '🏠'}
                          </button>
                        );
                      })}

                      {liveMapPlayers.map((p) => {
                        if (isCurrentPlayer(p)) return null;
                        return (
                          <button
                            key={`p-${p.id}`}
                            type="button"
                            className={`walk-overview-player-dot${p.virtual ? ' walk-overview-player-dot--npc' : ''}`}
                            style={{
                              left: p.x * OVERVIEW_TILE - 4,
                              top: p.y * OVERVIEW_TILE - 4,
                              background: p.virtual ? '#8d6e63' : avatarColor(p.id),
                            }}
                            title={t('worldMap.overview_jump_done', { name: p.username })}
                            onClick={() => jumpToOverviewEntry(p)}
                          />
                        );
                      })}

                      <div
                        className="walk-overview-you"
                        style={{
                          left: pos.x * OVERVIEW_TILE - 4,
                          top: pos.y * OVERVIEW_TILE - 4,
                        }}
                        title={t('worldMap.you')}
                      />
                    </div>
                  </div>
                </div>

                <div className="walk-overview-legend walk-overview-legend--terrain">
                  <span className="walk-overview-legend__title">{t('worldMap.overview_terrain_legend')}</span>
                  {overviewTerrainLegend.map((item) => (
                    <span key={item.code} className="walk-overview-legend__item">
                      <span className="walk-overview-legend__swatch" style={{ background: item.sample }} />
                      {item.label}
                    </span>
                  ))}
                  <span className="walk-overview-legend__item">🏘️ {t('worldMap.overview_tile_village')}</span>
                </div>

                <div className="walk-overview-legend">
                  <span>🏡 {t('worldMap.your_garden_marker')}</span>
                  <span>⚪ {t('worldMap.you')}</span>
                  <span>● {t('worldMap.other_players_live')}</span>
                  <span>📍 {t('worldMap.overview_tile_poi')}</span>
                </div>

                <div className="walk-overview-player-list">
                  {filteredOverviewEntries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="walk-overview-player-row walk-overview-player-row--btn"
                      onClick={() => jumpToOverviewEntry(entry)}
                    >
                      <span>{entry.virtual ? '🤖' : (entry.isMe ? '🏡' : '●')}</span>
                      <span className="walk-overview-player-row__name">{entry.username}</span>
                      <span className="walk-overview-coords">({entry.x},{entry.y})</span>
                      <span className="walk-overview-go">{t('worldMap.overview_go_to')}</span>
                    </button>
                  ))}
                  {filteredOverviewEntries.length === 0 && (
                    <p className="walk-overview-empty">{t('worldMap.overview_search_empty')}</p>
                  )}
                </div>
              </div>
            )}
            <div
              className={`walk-viewport${atEdgeLeft ? ' walk-viewport--at-edge-left' : ''}${atEdgeRight ? ' walk-viewport--at-edge-right' : ''}${atEdgeTop ? ' walk-viewport--at-edge-top' : ''}${atEdgeBottom ? ' walk-viewport--at-edge-bottom' : ''}`}
              ref={viewportRef}
              tabIndex={0}
              style={embedded
                ? { width: '100%', height: '100%', outline: 'none' }
                : { width: viewW * pxTile, height: viewH * pxTile, outline: 'none' }}
              onClick={() => viewportRef.current?.focus()}
            >
              {offScreenPlayers.map((p) => (
                <div
                  key={`off-${p.id}`}
                  className={`walk-offscreen-player walk-offscreen-player--${p.edge}`}
                  title={`${p.username} (${p.x},${p.y})`}
                >
                  {p.virtual ? '🤖' : p.username[0]?.toUpperCase()}
                </div>
              ))}
              <div
                className="walk-viewport-fit"
                style={embedded && mapFitScale < 1 ? { width: '100%', height: '100%' } : undefined}
              >
              <div
                className={`walk-viewport-inner${usePixiLayer ? ' walk-viewport-inner--pixi' : ''}`}
                style={{
                  width: viewW * pxTile,
                  height: viewH * pxTile,
                  position: 'relative',
                  margin: 0,
                  transform: mapFitScale < 1 ? `scale(${mapFitScale})` : undefined,
                  transformOrigin: 'center center',
                }}
              >
              {usePixiLayer && (
                <WalkMapPixi
                  width={viewW * pxTile}
                  height={viewH * pxTile}
                  pxTile={pxTile}
                  tileSpecs={pixiTileSpecs}
                  walkers={pixiWalkers}
                  playerTile={pixiPlayerTile}
                  playerPulse={playerPulse}
                  playerEmoji={walkEmoji}
                  onTileClick={handleTileClick}
                />
              )}
              {!usePixiLayer && tiles.map(({
                vx, vy, mx, my, tile, gardenPlayer, preview, ownPatchIndex, ownPlot,
                neighborPatch, isMe, isMarketTile, structureDecor, poi, isWorldEdge, coOwners,
              }) => {
                const isHighlighted = isMe && !!nearGarden;
                const biomePlotIndex = biomeCoordToPlot[`${mx},${my}`];
                const biomePlot = Number.isInteger(biomePlotIndex)
                  ? gameState?.plots?.[biomePlotIndex]
                  : null;
                const biomeKind = tile === 4 ? 'garden' : biomeForTileCode(tile);
                const bg = tile === 4
                  ? (isHighlighted ? '#7bc67e' : '#8bc34a')
                  : (TILE_BG[tile] || '#5fa33a');
                const sharedLabel = coOwners?.length > 1
                  ? `${gardenPlayer?.username || ''} +${coOwners.length - 1}`
                  : gardenPlayer?.username;

                const villageBuilding = poi?.villageBuilding;
                const villageClass = villageBuilding ? ` walk-tile--village-${villageBuilding}` : '';
                const isVillage = isCastleVillageTile(mx, my);
                const showDrawbridge = isCastleDrawbridge(mx, my);
                const showCastleGate = isCastleGate(mx, my) && !poi;

                return (
                  <div
                    key={`${vx},${vy}`}
                    className={`walk-tile walk-tile--biome-${biomeKind}${isMarketTile ? ' walk-tile--market' : ''}${structureDecor ? ' walk-tile--structure' : ''}${Number.isInteger(biomePlotIndex) ? ' walk-tile--biome-plot' : ''}${isWorldEdge ? ' walk-tile--world-edge' : ''}${poi ? ' walk-tile--poi' : ''}${isVillage ? ' walk-tile--village' : ''}${villageClass}`}
                    style={{ left: vx * pxTile, top: vy * pxTile, width: pxTile, height: pxTile, background: bg }}
                    onClick={() => handleTileClick({
                      mx, my, ownPlot, ownPatchIndex, tile, gardenPlayer, structureDecor, poi,
                    })}
                  >
                    {poi && (
                      <div className="world-poi-tile" title={localizedField(poi.label, poiLang)}>
                        <span className="world-poi-tile__emoji" aria-hidden>{poi.emoji}</span>
                        <span className="world-poi-tile__name">{localizedField(poi.label, poiLang)}</span>
                      </div>
                    )}
                    {/* Terrain decor */}
                    {!poi && TILE_DECOR[tile] && !gardenPlotCoordMap[`${mx},${my}`] && !gardenPlayer && (
                      <span className={`tile-decor${tile === W || tile === T || tile === M ? ' tile-decor--animated' : ''}`}>
                        {TILE_DECOR[tile]}
                      </span>
                    )}
                    {showDrawbridge && (
                      <span className="tile-decor tile-decor--castle-bridge" aria-hidden>🌉</span>
                    )}
                    {showCastleGate && (
                      <span className="tile-decor tile-decor--castle-gate" aria-hidden>🏰</span>
                    )}
                    {biomePlot && (
                      <div className={`world-own-plot world-own-plot--biome ${biomePlot.tilled ? 'world-own-plot--tilled' : ''} ${biomePlot.planted ? 'world-own-plot--planted' : ''} ${currentBiomePlotIndex === biomePlotIndex ? 'world-own-plot--active' : ''}`}>
                        {biomePlot.planted ? (
                          <span className="world-own-plot-emoji">{plotEmoji(biomePlot) || '🌱'}</span>
                        ) : biomePlot.tilled ? (
                          <span className="world-own-plot-dot">•</span>
                        ) : null}
                      </div>
                    )}

                    {/* Garden tile label */}
                    {gardenPlayer && (
                      <div className="garden-tile-label">
                        <span className="garden-tile-house">🏡</span>
                        <span className="garden-tile-name">{sharedLabel}</span>
                        {coOwners?.length > 1 && (
                          <span className="garden-tile-shared">{t('worldMap.shared_garden', { count: coOwners.length })}</span>
                        )}
                      </div>
                    )}
                    {!gardenPlayer && isMarketTile && !poi && (
                      <div className="garden-tile-label">
                        <span className="garden-tile-house">🏪</span>
                        <span className="garden-tile-name">{t('marketplace')}</span>
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
                    {structureDecor && (
                      <div
                        className="world-structure-tile"
                        title={t(`structures.${structureDecor.id}_name`, { defaultValue: structureDecor.id })}
                      >
                        <span className="world-structure-tile__emoji" aria-hidden>{structureDecor.emoji}</span>
                      </div>
                    )}
                    {!ownPlot && neighborPatch && (
                      <div className={`world-own-plot world-own-plot--neighbor ${neighborPatch.tilled ? 'world-own-plot--tilled' : ''} ${neighborPatch.planted ? 'world-own-plot--planted' : ''}`} title={t('worldMap.neighbor_garden', { name: neighborPatch.username })}>
                        {neighborPatch.emoji ? (
                          <span className="world-own-plot-emoji">{neighborPatch.emoji}</span>
                        ) : neighborPatch.tilled ? (
                          <span className="world-own-plot-dot">•</span>
                        ) : null}
                      </div>
                    )}

                    {/* My character */}
                    {isMe && (
                      <div className={`walk-player-char${playerPulse ? ' walk-player-char--pulse' : ''}`} title={t('worldMap.you')}>
                        {walkEmoji}
                      </div>
                    )}
                  </div>
                );
              })}
              {!usePixiLayer && visibleWalkers.map(({ uid, username, virtual, vx, vy, stack }) => (
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

            {findMeNotice && !activeInterior && (
              <div className="walk-find-me-toast" role="status">{findMeNotice}</div>
            )}

            {nearPoi && !activeInterior && (
              <div className="walk-enter-banner" role="status">
                <button
                  type="button"
                  className="walk-enter-banner__btn"
                  onClick={() => (poiWithInterior(nearPoi) ? enterInterior(nearPoi) : setActivePoi(nearPoi))}
                >
                  <span className="walk-enter-banner__emoji" aria-hidden>{nearPoi.emoji}</span>
                  <span className="walk-enter-banner__label">{localizedField(nearPoi.label, poiLang)}</span>
                  <span className="walk-enter-banner__action">
                    {poiWithInterior(nearPoi)
                      ? t('worldMap.hud_poi_enter_short', { defaultValue: 'Druk E om binnen te gaan' })
                      : t('worldMap.hud_poi_hint', { name: localizedField(nearPoi.label, poiLang) })}
                  </span>
                </button>
              </div>
            )}

            {/* HUD — één actie bij tuin of speler in de buurt */}
            {((nearGarden && !isCurrentPlayer(nearGarden)) || (nearbyPlayer && !isCurrentPlayer(nearbyPlayer))) && !proximityPanelOpen && (
              <div className="walk-hud">
                <button
                  type="button"
                  className="walk-interact-hint walk-interact-hint--player"
                  onClick={() => { setProximitySubview('overview'); setProximityPanelOpen(true); }}
                >
                  {t('worldMap.hud_player_actions', {
                    name: (nearGarden || nearbyPlayer).username,
                    defaultValue: '👤 {{name}} — druk E voor acties',
                  })}
                </button>
              </div>
            )}
            </>
            )}
          </div>

          {/* ── Right panel ──────────────────────────────────────────── */}
          <div
            ref={gardenPanelRef}
            className={`walk-garden-panel ${showFloatingPanel ? '' : 'walk-garden-panel--hidden'}${embedded && showNearbyPanel ? ' walk-garden-panel--proximity' : ''}${showOwnGardenPanel ? ' walk-garden-panel--own' : ''}${showGardenVisit ? ' walk-garden-panel--visit' : ''}`}
          >

            {/* A) Gebruikersoverzicht (E / HUD) */}
            {showNearbyPanel && !showOwnGardenPanel && (
              <div className="prox-panel">
                <button
                  type="button"
                  className="modal-close prox-panel__close"
                  onClick={closeProximityPanel}
                  aria-label={t('worldMap.close_panel')}
                  title={t('worldMap.close_panel')}
                >
                  ✕
                </button>

                {proximitySubview !== 'overview' && (
                  <button
                    type="button"
                    className="prox-panel__back"
                    onClick={() => {
                      if (proximitySubview === 'garden') {
                        setVisitedData(null);
                        setHelpDone(false);
                        setLoadingVisit(false);
                      }
                      setProximitySubview('overview');
                    }}
                  >
                    ← {t('worldMap.back', { defaultValue: 'Terug' })}
                  </button>
                )}

                <div className="prox-header">
                  <div className="prox-header__main">
                    <div className="prox-avatar" style={{ background: avatarColor(nearbyPlayer.id) }}>
                      {nearbyPlayer.username[0]?.toUpperCase()}
                    </div>
                    <div className="prox-header__text">
                      <div className="prox-name">{nearbyPlayer.username}</div>
                      {!isNearbyVirtual && (
                        <div className="prox-quick-actions">
                          <button
                            type="button"
                            className="prox-quick-actions__btn"
                            onClick={() => onOpenDm?.({ id: nearbyPlayer.id, username: nearbyPlayer.username })}
                            title={t('chat_send_message', { defaultValue: 'Bericht' })}
                            aria-label={t('chat_send_message', { defaultValue: 'Bericht' })}
                          >
                            ✉️
                          </button>
                          <button
                            type="button"
                            className="prox-quick-actions__btn"
                            onClick={() => onStartCall?.({ mode: 'outgoing', peerId: nearbyPlayer.id, peerUsername: nearbyPlayer.username, audioOnly: true })}
                            title={t('chat_audio_call', { defaultValue: 'Bellen' })}
                            aria-label={t('chat_audio_call', { defaultValue: 'Bellen' })}
                          >
                            📞
                          </button>
                          <button
                            type="button"
                            className="prox-quick-actions__btn"
                            onClick={() => onStartCall?.({ mode: 'outgoing', peerId: nearbyPlayer.id, peerUsername: nearbyPlayer.username, audioOnly: false })}
                            title={t('chat_video_call', { defaultValue: 'Video' })}
                            aria-label={t('chat_video_call', { defaultValue: 'Video' })}
                          >
                            📹
                          </button>
                        </div>
                      )}
                      {nearbyPlayer.virtual && nearbyNpcRole && (
                        <div className="prox-range">🧭 {nearbyNpcRole.label}</div>
                      )}
                    </div>
                  </div>
                </div>

                {proximitySubview === 'overview' && (
                  <div className="prox-overview">
                    {nearbyGardenPreview && (
                      <div className="prox-stats-row">
                        <span><strong>{nearbyGardenPreview.tilled ?? 0}</strong> {t('worldMap.stat_tilled')}</span>
                        <span><strong>{nearbyGardenPreview.planted ?? 0}</strong> {t('worldMap.stat_planted')}</span>
                        <span><strong>{nearbyGardenPreview.ready ?? 0}</strong> {t('worldMap.stat_ready')}</span>
                      </div>
                    )}

                    {!isNearbyVirtual && (
                      <>
                        <button
                          type="button"
                          className="btn btn-secondary prox-overview__help"
                          onClick={handleHelp}
                          disabled={helpDone}
                        >
                          {helpDone ? t('worldMap.help_done') : t('worldMap.help_button')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary prox-overview__visit"
                          onClick={() => openVisitFromPanel(nearGarden || nearbyPlayer)}
                        >
                          🏡 {t('worldMap.visit_garden')}
                        </button>
                      </>
                    )}

                    <div className="prox-action-grid prox-action-grid--compact">
                      {!isNearbyVirtual && (
                        <>
                          <button type="button" className="btn btn-secondary" onClick={openMarketplace}>
                            🏪 {t('marketplace')}
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={() => setProximitySubview('proposals')}>
                            📋 {t('worldMap.proposals_title', { defaultValue: 'Voorstellen' })}
                          </button>
                        </>
                      )}
                      {isNearbyVirtual && (
                        <>
                          <button type="button" className="btn btn-secondary" onClick={npcSellOne}>💰 Verkoop</button>
                          <button type="button" className="btn btn-secondary" onClick={npcHelp}>🤝 Samenwerken</button>
                          <button type="button" className="btn btn-secondary" onClick={() => setProximitySubview('proposals')}>
                            📋 {t('worldMap.proposals_title', { defaultValue: 'Voorstellen' })}
                          </button>
                        </>
                      )}
                    </div>

                    {isNearbyVirtual && (
                      <>
                        <div className="walk-garden-note">🧺 {t('worldMap.neighbor_stock')}</div>
                        <div className="prox-npc-shop">
                          {Object.entries(nearbyNpcShop).map(([crop, qty]) => (
                            <button
                              key={crop}
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={qty <= 0}
                              onClick={() => npcBuyOne(crop)}
                            >
                              {crop} x{qty}
                            </button>
                          ))}
                        </div>
                        {nearbyNpcGarden.length > 0 && (
                          <div className="mini-garden-grid">
                            {nearbyNpcGarden.map((plot, i) => <MiniPlot key={i} plot={plot} />)}
                          </div>
                        )}
                        {npcNotice && <div className="walk-garden-note">{npcNotice}</div>}
                        {nearbyPlayer.lastAction && (
                          <div className="walk-garden-note">🤖 {nearbyPlayer.lastAction}</div>
                        )}
                      </>
                    )}

                    {helpGivenNotice && <div className="prox-help-notice">{helpGivenNotice}</div>}
                    {proposalNotice && proximitySubview === 'overview' && (
                      <div className="walk-garden-note">{proposalNotice}</div>
                    )}
                  </div>
                )}

                {proximitySubview === 'garden' && (
                  <div className="prox-garden-view">
                    {loadingVisit && (
                      <div className="walk-garden-empty">
                        <div style={{ fontSize: '2rem', animation: 'spin 1s linear infinite' }}>⏳</div>
                        <div>{t('worldMap.garden_loading')}</div>
                      </div>
                    )}
                    {visitedData && !visitedData.error && (
                      <>
                        <div className="walk-garden-note">{t('worldMap.view_only')}</div>
                        <div className="walk-garden-note walk-garden-note--warn">{t('worldMap.build_only_own')}</div>
                        <div className="mini-garden-grid">
                          {(visitedData.plots || []).map((plot, i) => <MiniPlot key={i} plot={plot} />)}
                        </div>
                        {(() => {
                          const plots = visitedData.plots || [];
                          const tilled = plots.filter((p) => p.tilled).length;
                          const planted = plots.filter((p) => p.planted).length;
                          const ready = plots.filter((p) => p.planted && (p.daysPlanted || 0) >= (GROWTH_STAGES[p.plantType] || 3)).length;
                          return (
                            <div className="world-garden-stats" style={{ marginTop: '0.75rem' }}>
                              <div className="world-stat"><span>{tilled}</span><small>{t('worldMap.stat_tilled')}</small></div>
                              <div className="world-stat"><span>{planted}</span><small>{t('worldMap.stat_planted')}</small></div>
                              <div className="world-stat"><span style={{ color: '#4caf50' }}>{ready}</span><small>{t('worldMap.stat_ready')}</small></div>
                            </div>
                          );
                        })()}
                        <button type="button" className="btn btn-primary prox-overview__help" onClick={handleHelp} disabled={helpDone}>
                          {helpDone ? t('worldMap.help_done') : t('worldMap.help_button')}
                        </button>
                        {helpDone && (
                          <div className="walk-help-msg">{t('worldMap.help_thanks', { name: visitedData.player?.username })}</div>
                        )}
                      </>
                    )}
                    {visitedData?.error && (
                      <div className="walk-garden-empty">
                        <div style={{ fontSize: '2rem' }}>⚠️</div>
                        <div>{t('worldMap.garden_unavailable')}</div>
                      </div>
                    )}
                  </div>
                )}

                {proximitySubview === 'proposals' && currentUserId && (
                  <PlayerProposalsPanel
                    compact
                    currentUserId={currentUserId}
                    targetUser={nearbyPlayer.id}
                    targetUsername={nearbyPlayer.username}
                    onNotice={setProposalNotice}
                    onEconomyUpdate={({ inventory, coins }) => {
                      onUpdateGame?.((prev) => ({
                        ...prev,
                        inventory: inventory ? { ...prev.inventory, ...inventory } : prev.inventory,
                        playerStats: coins !== undefined
                          ? { ...prev.playerStats, coins }
                          : prev.playerStats,
                      }));
                    }}
                  />
                )}
              </div>
            )}

            {/* B) Garden visit (alleen buiten gebruikerspaneel) */}
            {showGardenVisit && !showOwnGardenPanel && !showNearbyPanel && (
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
                    <div className="walk-garden-note walk-garden-note--warn">{t('worldMap.build_only_own')}</div>
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
            {showOwnGardenPanel && !showNearbyPanel && !showGardenVisit && (
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
                    <h3>
                      {currentBiomeZone
                        ? `${currentBiomeZone.emoji} ${t(currentBiomeZone.labelKey)}`
                        : t('worldMap.own_garden_title')}
                    </h3>
                    <div className="walk-garden-meta">
                      <span>📍 {pos.x},{pos.y}</span>
                      <span>{t('worldMap.own_garden_plot', { n: ownGardenTargetPlot + 1 })}</span>
                    </div>
                  </div>
                </div>
                <div className="walk-garden-note">
                  {currentBiomeZone
                    ? t(currentBiomeZone.hintKey)
                    : t('worldMap.own_garden_hint')}
                </div>
                {biomeNotice && (
                  <div className="walk-biome-hint">{biomeNotice}</div>
                )}
                {lastOwnActionText && (
                  <div className="walk-garden-note">{lastOwnActionText}</div>
                )}
                <div className="walk-own-tools-grid" data-tour="tools">
                  {ownGardenTools.map((tool) => (
                    <button
                      key={tool}
                      type="button"
                      className={`btn btn-secondary walk-own-tool-btn ${gameState?.selectedTool === tool ? 'world-action-item--active' : ''}`}
                      onClick={() => {
                        onUpdateGame((prev) => ({ ...prev, selectedTool: tool }));
                        applyToolOnOwnPlot(ownGardenTargetPlot, tool);
                      }}
                    >
                      {TOOL_ICONS[tool]} {getToolLabel(tool)}
                    </button>
                  ))}
                </div>

                <div className="walk-own-panel-sections">
                  <button
                    type="button"
                    data-tour="inventory"
                    className={`btn btn-secondary walk-own-section-tab${ownPanelSection === 'inventory' ? ' walk-own-section-tab--active' : ''}`}
                    onClick={() => setOwnPanelSection((s) => (s === 'inventory' ? null : 'inventory'))}
                  >
                    🧺 {t('harvest_with_count', { count: harvestTotal })}
                  </button>
                  <button
                    type="button"
                    data-tour="structures"
                    className={`btn btn-secondary walk-own-section-tab${ownPanelSection === 'structures' ? ' walk-own-section-tab--active' : ''}`}
                    onClick={() => setOwnPanelSection((s) => (s === 'structures' ? null : 'structures'))}
                  >
                    🔨 {t('structures.title')}
                  </button>
                </div>

                {ownPanelSection === 'inventory' && (
                  <div className="walk-own-inline-panel">
                    {Object.entries(gameState.inventory || {})
                      .filter(([, qty]) => qty > 0)
                      .map(([cropId, qty]) => {
                        const seed = SEEDS.find((s) => s.id === cropId);
                        const sellPrice = { tomato: 10, carrot: 6, lettuce: 5, radish: 4, corn: 12, potato: 8, pumpkin: 22, sunflower: 9, blueberry: 16 }[cropId] || 5;
                        return (
                          <div key={cropId} className="walk-own-inv-row">
                            <span>{seed?.emoji || '🌱'} {t(seed?.labelKey || cropId, { defaultValue: cropId })} ×{qty}</span>
                            {onSell && (
                              <button type="button" className="btn btn-secondary walk-own-inv-sell" onClick={() => onSell(cropId, 1, sellPrice)}>
                                +{sellPrice}🪙
                              </button>
                            )}
                          </div>
                        );
                      })}
                    {Object.values(gameState.inventory || {}).every((q) => !q) && (
                      <p className="walk-garden-note">{t('inventory_empty', { defaultValue: 'Inventory is empty' })}</p>
                    )}
                  </div>
                )}

                {ownPanelSection === 'structures' && onBuildStructure && (
                  <div className="walk-own-inline-panel walk-own-inline-panel--structures">
                    <StructuresPanel
                      hideTitle
                      activeStructureId={activeStructureId}
                      structures={gameState.structures}
                      coins={gameState.playerStats?.coins || 0}
                      onBuild={handleBuildStructureAtGarden}
                      onUseWell={onUseWell}
                      onUseCompost={onUseCompost}
                      onCollectEggs={onCollectEggs}
                      onCollectMilk={onCollectMilk}
                    />
                  </div>
                )}

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

            {/* C) Garden hint — replaced by walk-hud bar */}

            {nearPoi && !showOwnGardenPanel && (
              <div className="walk-garden-empty">
                <div style={{ fontSize: '2.4rem' }}>{nearPoi.emoji}</div>
                <div style={{ fontWeight: 700 }}>{localizedField(nearPoi.label, poiLang)}</div>
                <div>
                  {poiWithInterior(nearPoi)
                    ? t('worldMap.press_poi_enter', { defaultValue: 'Druk E om naar binnen te gaan' })
                    : t('worldMap.press_poi')}
                </div>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: '0.75rem' }}
                  onClick={() => (poiWithInterior(nearPoi) ? enterInterior(nearPoi) : setActivePoi(nearPoi))}
                >
                  {poiWithInterior(nearPoi)
                    ? t('worldMap.enter_poi', { defaultValue: 'Naar binnen' })
                    : t('worldMap.open_poi')}
                </button>
              </div>
            )}

            {villageNotice && !showOwnGardenPanel && (
              <div className="walk-garden-empty walk-village-notice">{villageNotice}</div>
            )}

            {/* Geen losse empty-state panel meer */}
          </div>
          </div>
        </div>

        {!activeInterior && typeof document !== 'undefined' &&
          createPortal(
            <button
              type="button"
              className="walk-find-me-btn walk-find-me-btn--float"
              onClick={findMyGarden}
              title={t('worldMap.find_me')}
              aria-label={t('worldMap.find_me')}
            >
              📍
            </button>,
            document.body
          )}

        {!hideDpad && !activeInterior && typeof document !== 'undefined' &&
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

        {activePoi && (
          <WorldPoiModal poi={activePoi} onClose={() => setActivePoi(null)} onOpenTrade={openMarketplace} />
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
