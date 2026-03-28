/**
 * WorldMap — top-down walking world (Mario-style)
 *
 * Arrow keys / WASD to move your character 🧑‍🌾
 * Walk onto another player's garden plot to visit it.
 * Press E or Enter (or click the Visit button) to open their garden.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../hooks/useApi';

// ─── Map constants ────────────────────────────────────────────────────────────
const TILE      = 52;   // px per tile
const MAP_W     = 22;   // tiles wide
const MAP_H     = 14;   // tiles tall
const VIEW_W    = 11;   // visible tiles horizontal
const VIEW_H    = 9;    // visible tiles vertical

// Tile type codes
const G = 0; // grass
const P = 1; // dirt path
const W = 2; // water (impassable)
const T = 3; // tree  (impassable)
// code 4+ = garden slot (set dynamically)

// 22×14 base map  (row-major, y=0 is top)
const BASE_MAP = [
  [T,G,G,G,W,W,W,G,G,G,G,P,G,G,G,G,W,W,W,G,G,T],
  [G,T,G,G,W,W,W,G,G,G,G,P,G,G,G,G,W,W,W,G,T,G],
  [G,G,G,G,G,G,G,G,G,G,G,P,G,G,G,G,G,G,G,G,G,G],
  [G,G,G,G,G,T,G,G,G,G,G,P,G,G,G,G,T,G,G,G,G,G],
  [G,G,G,G,G,G,G,G,G,G,G,P,G,G,G,G,G,G,G,G,G,G],
  [G,G,G,G,G,G,G,G,G,G,G,P,G,G,G,G,G,G,G,G,G,G],
  [G,G,G,G,G,G,G,G,G,G,G,P,G,G,G,G,G,G,G,G,G,G],
  [P,P,P,P,P,P,P,P,P,P,P,P,P,P,P,P,P,P,P,P,P,P],
  [G,G,G,G,G,G,G,G,G,G,G,P,G,G,G,G,G,G,G,G,G,G],
  [G,G,G,G,G,G,G,G,G,G,G,P,G,G,G,G,G,G,G,G,G,G],
  [G,G,G,G,G,T,G,G,G,G,G,P,G,G,G,G,T,G,G,G,G,G],
  [G,G,G,G,G,G,G,G,G,G,G,P,G,G,G,G,G,G,G,G,G,G],
  [G,T,G,G,W,W,W,G,G,G,G,P,G,G,G,G,W,W,W,G,T,G],
  [T,G,G,G,W,W,W,G,G,G,G,P,G,G,G,G,W,W,W,G,G,T],
];

// Pre-defined garden slot positions (spread over the map, avoiding paths/water/trees)
const GARDEN_SLOTS = [
  { x: 2,  y: 2  },
  { x: 18, y: 2  },
  { x: 2,  y: 11 },
  { x: 18, y: 11 },
  { x: 8,  y: 3  },
  { x: 14, y: 4  },
  { x: 8,  y: 10 },
  { x: 14, y: 9  },
];

// Player avatar starts at the cross-roads centre
const START_X = 11;
const START_Y = 7;

// Tile visual styles
const TILE_BG = {
  [G]: '#5fa33a',
  [P]: '#b8955a',
  [W]: '#3a8fc8',
  [T]: '#3a7a22',
};

const TILE_DECOR = {
  [G]: null,
  [P]: null,
  [W]: '🌊',
  [T]: '🌲',
};

// Direction → character facing emoji
const FACING = {
  up:    '⬆️',
  down:  '⬇️',
  left:  '⬅️',
  right: '➡️',
};

// ─── Growth / emoji helpers (kept in sync with Garden.js) ────────────────────
const GROWTH_STAGES = {
  tomato: 3, carrot: 2, lettuce: 2, radish: 1, corn: 4,
  potato: 3, pumpkin: 5, sunflower: 2, blueberry: 4,
};

const PLANT_EMOJIS = {
  tomato:    ['🌱','🌿','🍅','🍅'],
  carrot:    ['🌱','🌿','🥕'],
  lettuce:   ['🌱','🌿','🥬'],
  radish:    ['🌱','🌸'],
  corn:      ['🌱','🌿','🌾','🌽','🌽'],
  potato:    ['🌱','🌿','🌿','🥔'],
  pumpkin:   ['🌱','🌿','🌿','🟠','🎃','🎃'],
  sunflower: ['🌱','🌿','🌻'],
  blueberry: ['🌱','🌿','🌿','🫐','🫐'],
};

const WEATHER_ICONS = { sunny:'☀️', cloudy:'☁️', rainy:'🌧️', windy:'💨', storm:'⛈️', drought:'🏜️' };

function plotEmoji(plot) {
  if (!plot.planted || !plot.plantType) return null;
  const total  = GROWTH_STAGES[plot.plantType] || 3;
  const emojis = PLANT_EMOJIS[plot.plantType] || ['🌱'];
  const idx    = Math.min(Math.floor(((plot.daysPlanted||0)/total)*(emojis.length-1)), emojis.length-1);
  return emojis[idx];
}

// ─── Mini read-only plot (shown in garden preview panel) ─────────────────────
function MiniPlot({ plot }) {
  const emoji = plotEmoji(plot);
  const bg    = plot.tilled && plot.waterLevel > 0 ? '#7a5c4c'
              : plot.tilled ? '#8a6244'
              : '#3e2c1e';
  return (
    <div className="mini-plot" style={{ background: bg }}
      title={plot.planted ? `${plot.plantType} · day ${plot.daysPlanted}` : plot.tilled ? 'Tilled' : 'Untilled'}>
      {emoji && <span className="mini-plant-emoji">{emoji}</span>}
      {plot.pest && <span className="mini-pest">🐛</span>}
    </div>
  );
}

// Demo players for when socket is not connected
const DEMO_PLAYERS = [
  { id: 1, username: 'GardenGuru',  level: 12, server: 'local' },
  { id: 2, username: 'PlantLover',  level: 7,  server: 'local' },
  { id: 3, username: 'Tomato_Tom',  level: 4,  server: 'nl.garden' },
];

// ─── Main component ───────────────────────────────────────────────────────────
function WorldMap({ socket, currentUserId, onClose }) {
  const [players,      setPlayers]      = useState(DEMO_PLAYERS);
  const [pos,          setPos]          = useState({ x: START_X, y: START_Y });
  const [facing,       setFacing]       = useState('down');
  const [nearGarden,   setNearGarden]   = useState(null);  // player whose garden we're standing on
  const [visitedData,  setVisitedData]  = useState(null);  // fetched garden data
  const [loadingVisit, setLoadingVisit] = useState(false);
  const [helpDone,     setHelpDone]     = useState(false);
  const [step,         setStep]         = useState(0);      // for walk animation

  const viewportRef = useRef(null);
  const mapRef      = useRef(null);

  // ── Keep player list in sync via socket ────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const onList   = (list)   => setPlayers(list.filter(p => p.id !== currentUserId));
    const onJoined = (player) => setPlayers(prev => [...prev.filter(p => p.id !== player.id), player]);
    const onLeft   = ({ id }) => setPlayers(prev => prev.filter(p => p.id !== id));
    socket.on('players:list',  onList);
    socket.on('player:joined', onJoined);
    socket.on('player:left',   onLeft);
    return () => {
      socket.off('players:list',  onList);
      socket.off('player:joined', onJoined);
      socket.off('player:left',   onLeft);
    };
  }, [socket, currentUserId]);

  // ── Assign players to garden slots ─────────────────────────────────────────
  const otherPlayers = players.filter(p => p.id !== currentUserId);
  const gardenMap    = {};  // tile key "x,y" → player
  otherPlayers.forEach((player, i) => {
    const slot = GARDEN_SLOTS[i % GARDEN_SLOTS.length];
    if (slot) gardenMap[`${slot.x},${slot.y}`] = player;
  });

  // ── Build full map (base + garden overlays) ────────────────────────────────
  function getTile(x, y) {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return W; // out-of-bounds = impassable
    const key = `${x},${y}`;
    if (gardenMap[key]) return 4; // garden tile
    return BASE_MAP[y]?.[x] ?? G;
  }

  function isPassable(x, y) {
    const t = getTile(x, y);
    return t !== W && t !== T;
  }

  // ── Keyboard movement ──────────────────────────────────────────────────────
  const move = useCallback((dx, dy, dir) => {
    setFacing(dir);
    setPos(prev => {
      const nx = prev.x + dx;
      const ny = prev.y + dy;
      if (!isPassable(nx, ny)) return prev;  // bump into wall
      return { x: nx, y: ny };
    });
    setStep(s => s + 1);
  }, []); // eslint-disable-line

  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return;
      switch (e.key) {
        case 'ArrowUp':    case 'w': case 'W': move( 0,-1,'up');    break;
        case 'ArrowDown':  case 's': case 'S': move( 0, 1,'down');  break;
        case 'ArrowLeft':  case 'a': case 'A': move(-1, 0,'left');  break;
        case 'ArrowRight': case 'd': case 'D': move( 1, 0,'right'); break;
        case 'e': case 'E': case 'Enter':
          // Interact with nearby garden
          if (nearGarden) openVisit(nearGarden);
          break;
        case 'Escape':
          if (visitedData) { setVisitedData(null); setHelpDone(false); }
          else onClose();
          break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    // Focus the viewport so keys work
    viewportRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [nearGarden, visitedData, move, onClose]); // eslint-disable-line

  // ── Detect nearby gardens ──────────────────────────────────────────────────
  useEffect(() => {
    const key = `${pos.x},${pos.y}`;
    const found = gardenMap[key] || null;
    setNearGarden(found);
    if (!found) {
      // left the garden — clear visited if we moved away while viewing
      // (keep it open so user can read it, clear only on Escape)
    }
  }, [pos, otherPlayers]); // eslint-disable-line

  // ── Camera: keep player centred in viewport ────────────────────────────────
  const camX = Math.max(0, Math.min(MAP_W - VIEW_W, pos.x - Math.floor(VIEW_W / 2)));
  const camY = Math.max(0, Math.min(MAP_H - VIEW_H, pos.y - Math.floor(VIEW_H / 2)));

  // ── Visit a garden ─────────────────────────────────────────────────────────
  const openVisit = useCallback(async (player) => {
    setLoadingVisit(true);
    setVisitedData(null);
    setHelpDone(false);
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

  const handleHelp = useCallback(() => {
    if (!visitedData?.player || helpDone) return;
    socket?.emit('player:help', { targetUserId: visitedData.player.id, amount: 15 });
    setHelpDone(true);
  }, [visitedData, helpDone, socket]);

  // ── Render map tiles in viewport ───────────────────────────────────────────
  const visibleTiles = [];
  for (let vy = 0; vy < VIEW_H; vy++) {
    for (let vx = 0; vx < VIEW_W; vx++) {
      const mx = camX + vx;
      const my = camY + vy;
      const tile = getTile(mx, my);
      const key  = `${mx},${my}`;
      const gardenPlayer = gardenMap[key];
      const isPlayer = mx === pos.x && my === pos.y;
      const isNear   = nearGarden && key === `${pos.x},${pos.y}`;

      visibleTiles.push({ vx, vy, mx, my, tile, gardenPlayer, isPlayer, isNear });
    }
  }

  const walkEmoji = step % 2 === 0 ? '🧑‍🌾' : '🌿';  // subtle walk flicker

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal world-map-modal-walk">

        {/* Header */}
        <div className="modal-header">
          <h2>🗺️ World Map</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#888' }}>
              Arrow keys / WASD · E = Visit
            </span>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="walk-world-body">
          {/* ── Walking map ─────────────────────────────────────────── */}
          <div className="walk-map-column">
            <div
              className="walk-viewport"
              ref={viewportRef}
              tabIndex={0}
              style={{ width: VIEW_W * TILE, height: VIEW_H * TILE, outline: 'none' }}
              onClick={() => viewportRef.current?.focus()}
            >
              {visibleTiles.map(({ vx, vy, mx, my, tile, gardenPlayer, isPlayer }) => {
                const bg = tile === 4
                  ? (nearGarden && gardenMap[`${mx},${my}`]?.id === nearGarden?.id
                      ? '#7bc67e'   // highlighted (player is on it)
                      : '#8bc34a') // normal garden green
                  : (TILE_BG[tile] || '#5fa33a');

                const decor = tile === 4
                  ? (gardenPlayer
                      ? <div className="garden-tile-label">
                          <span className="garden-tile-house">🏡</span>
                          <span className="garden-tile-name">{gardenPlayer.username}</span>
                        </div>
                      : '🏡')
                  : (TILE_DECOR[tile]
                      ? <span className="tile-decor">{TILE_DECOR[tile]}</span>
                      : null);

                return (
                  <div
                    key={`${vx},${vy}`}
                    className="walk-tile"
                    style={{
                      left:       vx * TILE,
                      top:        vy * TILE,
                      width:      TILE,
                      height:     TILE,
                      background: bg,
                    }}
                    onClick={tile === 4 && gardenPlayer ? () => openVisit(gardenPlayer) : undefined}
                  >
                    {decor}
                    {isPlayer && (
                      <div className="walk-player-char" title="You">
                        {walkEmoji}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Minimap + coordinates */}
            <div className="walk-hud">
              <span className="walk-coord">📍 {pos.x},{pos.y}</span>
              <span className="walk-players-count">👥 {otherPlayers.length} online</span>
              {nearGarden && (
                <span className="walk-interact-hint" onClick={() => openVisit(nearGarden)}>
                  🏡 {nearGarden.username} — press <kbd>E</kbd> to visit
                </span>
              )}
            </div>

            {/* Player legend */}
            {otherPlayers.length > 0 && (
              <div className="walk-legend">
                {otherPlayers.map((p, i) => {
                  const slot = GARDEN_SLOTS[i % GARDEN_SLOTS.length];
                  return (
                    <div
                      key={p.id}
                      className="walk-legend-item"
                      onClick={() => {
                        // Teleport near that player's garden
                        if (slot) setPos({ x: slot.x, y: slot.y + 1 });
                      }}
                      title={`Jump to ${p.username}'s garden`}
                    >
                      <span className="walk-legend-dot" style={{ background: `hsl(${(i*73)%360},60%,45%)` }} />
                      {p.username} <small>Lv.{p.level}</small>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Garden panel (right side) ────────────────────────── */}
          <div className="walk-garden-panel">
            {!visitedData && !loadingVisit && (
              <div className="walk-garden-empty">
                <div style={{ fontSize: '2.8rem' }}>🌍</div>
                <div>Walk to a 🏡 and press</div>
                <div><kbd className="walk-kbd">E</kbd> or <kbd className="walk-kbd">Enter</kbd> to visit</div>
                {otherPlayers.length === 0 && (
                  <div style={{ opacity: 0.5, marginTop: '0.5rem', fontSize: '0.8rem' }}>
                    No other players online
                  </div>
                )}
              </div>
            )}

            {loadingVisit && (
              <div className="walk-garden-empty">
                <div style={{ fontSize: '2rem', animation: 'spin 1s linear infinite' }}>⏳</div>
                <div>Loading garden…</div>
              </div>
            )}

            {visitedData && !visitedData.error && (
              <div className="walk-garden-view">
                <div className="walk-garden-header">
                  <div>
                    <h3>🌱 {visitedData.username || visitedData.player?.username}'s Garden</h3>
                    <div className="walk-garden-meta">
                      <span>📅 Day {visitedData.currentDay}</span>
                      <span>{WEATHER_ICONS[visitedData.weather] || '🌤️'} {visitedData.weather}</span>
                      <span>Lv.{visitedData.level || visitedData.player?.level}</span>
                    </div>
                  </div>
                  <button
                    className="btn btn-primary walk-help-btn"
                    onClick={handleHelp}
                    disabled={helpDone}
                  >
                    {helpDone ? '✅ Helped!' : '🤝 Help +15 XP'}
                  </button>
                </div>

                {helpDone && (
                  <div className="walk-help-msg">
                    🤝 You helped {visitedData.player?.username}!
                  </div>
                )}

                <div className="walk-garden-note">👁 Read-only view</div>

                <div className="mini-garden-grid">
                  {(visitedData.plots || []).map((plot, i) => (
                    <MiniPlot key={i} plot={plot} />
                  ))}
                </div>

                {/* Stats */}
                {(() => {
                  const plots    = visitedData.plots || [];
                  const tilled   = plots.filter(p => p.tilled).length;
                  const planted  = plots.filter(p => p.planted).length;
                  const ready    = plots.filter(p => p.planted && (p.daysPlanted||0) >= (GROWTH_STAGES[p.plantType]||3)).length;
                  return (
                    <div className="world-garden-stats" style={{ marginTop: '0.75rem' }}>
                      <div className="world-stat"><span>{tilled}</span><small>Tilled</small></div>
                      <div className="world-stat"><span>{planted}</span><small>Planted</small></div>
                      <div className="world-stat"><span style={{color:'#4caf50'}}>{ready}</span><small>Ready 🌟</small></div>
                    </div>
                  );
                })()}

                <button
                  className="btn btn-secondary"
                  onClick={() => { setVisitedData(null); setHelpDone(false); }}
                  style={{ marginTop: '0.75rem', width: '100%', fontSize: '0.85rem', padding: '0.4rem' }}
                >
                  ← Back to map
                </button>
              </div>
            )}

            {visitedData?.error && (
              <div className="walk-garden-empty">
                <div style={{ fontSize: '2rem' }}>⚠️</div>
                <div>Couldn't load garden</div>
                <button className="btn btn-secondary" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}
                  onClick={() => setVisitedData(null)}>Back</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default WorldMap;
