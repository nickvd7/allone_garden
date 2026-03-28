/**
 * WorldMap — top-down walking world (Mario-style)
 *
 * Arrow keys / WASD  → move character 🧑‍🌾
 * Walk to a 🏡        → press E / Enter to visit garden
 * Walk near a player  → right panel shows proximity chat + video call button
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../hooks/useApi';

// ─── Map constants ────────────────────────────────────────────────────────────
const TILE   = 52;
const MAP_W  = 22;
const MAP_H  = 14;
const VIEW_W = 11;
const VIEW_H = 9;

// Proximity range (in tiles) to trigger chat / call UI
const PROX_RANGE = 3;

// Tile type codes
const G = 0;  // grass
const P = 1;  // dirt path
const W = 2;  // water   (impassable)
const T = 3;  // tree    (impassable)

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

const START_X = 11;
const START_Y = 7;

const TILE_BG = { [G]: '#5fa33a', [P]: '#b8955a', [W]: '#3a8fc8', [T]: '#3a7a22' };
const TILE_DECOR = { [G]: null, [P]: null, [W]: '🌊', [T]: '🌲' };

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

function plotEmoji(plot) {
  if (!plot.planted || !plot.plantType) return null;
  const total  = GROWTH_STAGES[plot.plantType] || 3;
  const emojis = PLANT_EMOJIS[plot.plantType] || ['🌱'];
  const idx    = Math.min(Math.floor(((plot.daysPlanted||0)/total)*(emojis.length-1)), emojis.length-1);
  return emojis[idx];
}

function MiniPlot({ plot }) {
  const emoji = plotEmoji(plot);
  const bg    = plot.tilled && plot.waterLevel > 0 ? '#7a5c4c'
              : plot.tilled ? '#8a6244' : '#3e2c1e';
  return (
    <div className="mini-plot" style={{ background: bg }}
      title={plot.planted ? `${plot.plantType} · day ${plot.daysPlanted}` : plot.tilled ? 'Tilled' : 'Untilled'}>
      {emoji && <span className="mini-plant-emoji">{emoji}</span>}
      {plot.pest && <span className="mini-pest">🐛</span>}
    </div>
  );
}

// ─── Demo players ─────────────────────────────────────────────────────────────
const DEMO_PLAYERS = [
  { id: 1, username: 'GardenGuru',  level: 12, server: 'local' },
  { id: 2, username: 'PlantLover',  level: 7,  server: 'local' },
  { id: 3, username: 'Tomato_Tom',  level: 4,  server: 'nl.garden' },
];

// ─────────────────────────────────────────────────────────────────────────────
function WorldMap({ socket, currentUserId, onClose, onStartCall }) {
  const [players,        setPlayers]        = useState(DEMO_PLAYERS);
  const [playerPositions,setPlayerPositions]= useState({}); // userId → {x,y,username,level}
  const [pos,            setPos]            = useState({ x: START_X, y: START_Y });
  const [facing,         setFacing]         = useState('down');  // eslint-disable-line
  const [step,           setStep]           = useState(0);

  // Garden visiting
  const [nearGarden,   setNearGarden]   = useState(null);
  const [visitedData,  setVisitedData]  = useState(null);
  const [loadingVisit, setLoadingVisit] = useState(false);
  const [helpDone,     setHelpDone]     = useState(false);

  // Proximity chat
  const [nearbyPlayer, setNearbyPlayer] = useState(null);     // closest walking player within range
  const [dmHistory,    setDmHistory]    = useState({});        // { userId: [msg, ...] }
  const [dmInput,      setDmInput]      = useState('');
  const dmBottomRef = useRef(null);

  const viewportRef = useRef(null);

  // ── Socket: keep player list in sync ─────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const onList    = (list)   => setPlayers(list.filter(p => p.id !== currentUserId));
    const onJoined  = (player) => setPlayers(prev => [...prev.filter(p => p.id !== player.id), player]);
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
  }, [socket, currentUserId]);

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

  // ── Socket: incoming DMs ──────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const onDm = (msg) => {
      setDmHistory(prev => ({
        ...prev,
        [msg.from]: [...(prev[msg.from] || []), msg],
      }));
    };
    socket.on('dm:receive', onDm);
    return () => socket.off('dm:receive', onDm);
  }, [socket]);

  // Auto-scroll DM chat
  useEffect(() => {
    dmBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dmHistory, nearbyPlayer]);

  // ── Build garden map (assign players to slots) ────────────────────────────
  const otherPlayers = players.filter(p => p.id !== currentUserId);
  const gardenMap    = {};
  otherPlayers.forEach((player, i) => {
    const slot = GARDEN_SLOTS[i % GARDEN_SLOTS.length];
    if (slot) gardenMap[`${slot.x},${slot.y}`] = player;
  });

  function getTile(x, y) {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return W;
    if (gardenMap[`${x},${y}`]) return 4;
    return BASE_MAP[y]?.[x] ?? G;
  }
  function isPassable(x, y) { const t = getTile(x, y); return t !== W && t !== T; }

  // ── Broadcast own position ────────────────────────────────────────────────
  const broadcastPos = useCallback((x, y) => {
    socket?.emit('world:position', { x, y });
  }, [socket]);

  // ── Movement ──────────────────────────────────────────────────────────────
  const move = useCallback((dx, dy, dir) => {
    setFacing(dir);
    setPos(prev => {
      const nx = prev.x + dx;
      const ny = prev.y + dy;
      if (!isPassable(nx, ny)) return prev;
      broadcastPos(nx, ny);
      return { x: nx, y: ny };
    });
    setStep(s => s + 1);
  }, [broadcastPos]); // eslint-disable-line

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return;
      // Ignore key events when typing in DM input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.key) {
        case 'ArrowUp':    case 'w': case 'W': move( 0,-1,'up');    break;
        case 'ArrowDown':  case 's': case 'S': move( 0, 1,'down');  break;
        case 'ArrowLeft':  case 'a': case 'A': move(-1, 0,'left');  break;
        case 'ArrowRight': case 'd': case 'D': move( 1, 0,'right'); break;
        case 'e': case 'E': case 'Enter':
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
    viewportRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [nearGarden, visitedData, move, onClose]); // eslint-disable-line

  // ── Proximity detection ───────────────────────────────────────────────────
  useEffect(() => {
    // Garden proximity
    const gKey = `${pos.x},${pos.y}`;
    setNearGarden(gardenMap[gKey] || null);

    // Walking player proximity
    let closest = null;
    let closestDist = Infinity;
    for (const [uid, ppos] of Object.entries(playerPositions)) {
      const dist = Math.abs(pos.x - ppos.x) + Math.abs(pos.y - ppos.y);
      if (dist <= PROX_RANGE && dist < closestDist) {
        closestDist = dist;
        closest = { id: Number(uid), username: ppos.username, ...ppos };
      }
    }
    setNearbyPlayer(closest);
  }, [pos, otherPlayers]); // eslint-disable-line

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

  const handleHelp = useCallback(() => {
    if (!visitedData?.player || helpDone) return;
    socket?.emit('player:help', { targetUserId: visitedData.player.id, amount: 15 });
    setHelpDone(true);
  }, [visitedData, helpDone, socket]);

  // ── DM send ───────────────────────────────────────────────────────────────
  const sendDm = useCallback(() => {
    const text = dmInput.trim();
    if (!text || !nearbyPlayer || !socket) return;
    socket.emit('dm:send', { to: nearbyPlayer.id, text });
    // Add own message to history immediately
    setDmHistory(prev => ({
      ...prev,
      [nearbyPlayer.id]: [...(prev[nearbyPlayer.id] || []), {
        from: currentUserId,
        fromUsername: 'You',
        text,
        timestamp: Date.now(),
      }],
    }));
    setDmInput('');
  }, [dmInput, nearbyPlayer, socket, currentUserId]);

  // ── Camera ────────────────────────────────────────────────────────────────
  const camX = Math.max(0, Math.min(MAP_W - VIEW_W, pos.x - Math.floor(VIEW_W / 2)));
  const camY = Math.max(0, Math.min(MAP_H - VIEW_H, pos.y - Math.floor(VIEW_H / 2)));

  // ── Render tile grid ──────────────────────────────────────────────────────
  const tiles = [];
  for (let vy = 0; vy < VIEW_H; vy++) {
    for (let vx = 0; vx < VIEW_W; vx++) {
      const mx = camX + vx;
      const my = camY + vy;
      const tile = getTile(mx, my);
      const gardenPlayer = gardenMap[`${mx},${my}`];
      const isMe   = mx === pos.x && my === pos.y;
      const isNear = isMe && nearGarden?.id === gardenPlayer?.id;

      // Walking players on this tile
      const walkersHere = Object.entries(playerPositions)
        .filter(([, p]) => p.x === mx && p.y === my)
        .map(([uid, p]) => ({ uid, ...p }));

      tiles.push({ vx, vy, mx, my, tile, gardenPlayer, isMe, isNear, walkersHere });
    }
  }

  const walkEmoji = step % 2 === 0 ? '🧑‍🌾' : '🌿';

  // Right panel mode
  const showNearbyChat  = !!nearbyPlayer;
  const showGardenVisit = !!visitedData || loadingVisit;
  const showGardenHint  = !showNearbyChat && !showGardenVisit && !!nearGarden;

  // DM history for current nearby player
  const dmMessages = (nearbyPlayer && dmHistory[nearbyPlayer.id]) || [];

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal world-map-modal-walk">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="modal-header">
          <h2>🗺️ World Map</h2>
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
            <span style={{ fontSize:'0.78rem', color:'#888' }}>
              ← → ↑ ↓ bewegen · <kbd style={{background:'#eee',padding:'0 4px',borderRadius:3}}>E</kbd> bezoeken
            </span>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="walk-world-body">

          {/* ── Walking map ──────────────────────────────────────────── */}
          <div className="walk-map-column">
            <div
              className="walk-viewport"
              ref={viewportRef}
              tabIndex={0}
              style={{ width: VIEW_W * TILE, height: VIEW_H * TILE, outline: 'none' }}
              onClick={() => viewportRef.current?.focus()}
            >
              {tiles.map(({ vx, vy, tile, gardenPlayer, isMe, walkersHere }) => {
                const isHighlighted = isMe && !!nearGarden;
                const bg = tile === 4
                  ? (isHighlighted ? '#7bc67e' : '#8bc34a')
                  : (TILE_BG[tile] || '#5fa33a');

                return (
                  <div
                    key={`${vx},${vy}`}
                    className="walk-tile"
                    style={{ left: vx * TILE, top: vy * TILE, width: TILE, height: TILE, background: bg }}
                    onClick={tile === 4 && gardenPlayer ? () => openVisit(gardenPlayer) : undefined}
                  >
                    {/* Terrain decor */}
                    {TILE_DECOR[tile] && <span className="tile-decor">{TILE_DECOR[tile]}</span>}

                    {/* Garden tile label */}
                    {tile === 4 && gardenPlayer && (
                      <div className="garden-tile-label">
                        <span className="garden-tile-house">🏡</span>
                        <span className="garden-tile-name">{gardenPlayer.username}</span>
                      </div>
                    )}

                    {/* Other walking players on this tile */}
                    {walkersHere.map(({ uid, username }) => (
                      <div
                        key={uid}
                        className="walk-other-player"
                        style={{ background: avatarColor(uid) }}
                        title={username}
                      >
                        {username[0]?.toUpperCase()}
                      </div>
                    ))}

                    {/* My character */}
                    {isMe && (
                      <div className="walk-player-char" title="Jij">
                        {walkEmoji}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* HUD */}
            <div className="walk-hud">
              <span className="walk-coord">📍 {pos.x},{pos.y}</span>
              <span className="walk-players-count">👥 {otherPlayers.length} online</span>
              {nearGarden && !nearbyPlayer && (
                <span className="walk-interact-hint" onClick={() => openVisit(nearGarden)}>
                  🏡 {nearGarden.username} — druk <kbd>E</kbd> om te bezoeken
                </span>
              )}
              {nearbyPlayer && (
                <span className="walk-interact-hint walk-interact-hint--player">
                  💬 {nearbyPlayer.username} is dichtbij!
                </span>
              )}
            </div>

            {/* Legend */}
            {otherPlayers.length > 0 && (
              <div className="walk-legend">
                {otherPlayers.map((p, i) => {
                  const slot = GARDEN_SLOTS[i % GARDEN_SLOTS.length];
                  return (
                    <div key={p.id} className="walk-legend-item"
                      onClick={() => slot && setPos({ x: slot.x, y: slot.y + 1 })}
                      title={`Spring naar ${p.username}'s tuin`}
                    >
                      <span className="walk-legend-dot" style={{ background: avatarColor(p.id) }} />
                      {p.username} <small>Lv.{p.level}</small>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Right panel ──────────────────────────────────────────── */}
          <div className="walk-garden-panel">

            {/* A) Proximity chat + call (player nearby) */}
            {showNearbyChat && (
              <div className="prox-panel">
                <div className="prox-header">
                  <div className="prox-avatar" style={{ background: avatarColor(nearbyPlayer.id) }}>
                    {nearbyPlayer.username[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="prox-name">{nearbyPlayer.username}</div>
                    <div className="prox-range">📍 {Math.abs(pos.x - nearbyPlayer.x) + Math.abs(pos.y - nearbyPlayer.y)} tegels dichtbij</div>
                  </div>
                  <button
                    className="btn prox-call-btn"
                    onClick={() => onStartCall?.({ mode: 'outgoing', peerId: nearbyPlayer.id, peerUsername: nearbyPlayer.username })}
                    title="Start videogesprek"
                  >
                    📹 Bellen
                  </button>
                </div>

                {/* DM chat history */}
                <div className="prox-chat-messages">
                  {dmMessages.length === 0 && (
                    <div className="prox-chat-empty">Stuur een bericht naar {nearbyPlayer.username}…</div>
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
                    placeholder="Typ bericht…"
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
              </div>
            )}

            {/* B) Garden visit */}
            {showGardenVisit && (
              <div className="walk-garden-view">
                {loadingVisit && (
                  <div className="walk-garden-empty">
                    <div style={{ fontSize:'2rem', animation:'spin 1s linear infinite' }}>⏳</div>
                    <div>Tuin laden…</div>
                  </div>
                )}
                {visitedData && !visitedData.error && (
                  <>
                    <div className="walk-garden-header">
                      <div>
                        <h3>🌱 {visitedData.username || visitedData.player?.username}</h3>
                        <div className="walk-garden-meta">
                          <span>📅 Dag {visitedData.currentDay}</span>
                          <span>{WEATHER_ICONS[visitedData.weather]||'🌤️'} {visitedData.weather}</span>
                          <span>Lv.{visitedData.level || visitedData.player?.level}</span>
                        </div>
                      </div>
                      <button className="btn btn-primary walk-help-btn" onClick={handleHelp} disabled={helpDone}>
                        {helpDone ? '✅ Geholpen!' : '🤝 Help +15'}
                      </button>
                    </div>
                    {helpDone && <div className="walk-help-msg">🤝 Je hebt {visitedData.player?.username} geholpen!</div>}
                    <div className="walk-garden-note">👁 Alleen weergave</div>
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
                          <div className="world-stat"><span>{tilled}</span><small>Omgespade</small></div>
                          <div className="world-stat"><span>{planted}</span><small>Geplant</small></div>
                          <div className="world-stat"><span style={{color:'#4caf50'}}>{ready}</span><small>Klaar 🌟</small></div>
                        </div>
                      );
                    })()}
                    <button className="btn btn-secondary" onClick={() => { setVisitedData(null); setHelpDone(false); }}
                      style={{ marginTop:'0.75rem', width:'100%', fontSize:'0.85rem', padding:'0.4rem' }}>
                      ← Terug naar kaart
                    </button>
                  </>
                )}
                {visitedData?.error && (
                  <div className="walk-garden-empty">
                    <div style={{fontSize:'2rem'}}>⚠️</div>
                    <div>Tuin niet beschikbaar</div>
                    <button className="btn btn-secondary" style={{marginTop:'0.5rem',fontSize:'0.8rem'}} onClick={() => setVisitedData(null)}>Terug</button>
                  </div>
                )}
              </div>
            )}

            {/* C) Garden hint */}
            {showGardenHint && (
              <div className="walk-garden-empty">
                <div style={{fontSize:'2.4rem'}}>🏡</div>
                <div style={{fontWeight:700}}>{nearGarden.username}&apos;s tuin</div>
                <div>Druk <kbd className="walk-kbd">E</kbd> of <kbd className="walk-kbd">Enter</kbd> om te bezoeken</div>
                <button className="btn btn-primary" style={{marginTop:'0.75rem'}} onClick={() => openVisit(nearGarden)}>
                  👁 Bezoek tuin
                </button>
              </div>
            )}

            {/* D) Empty state */}
            {!showNearbyChat && !showGardenVisit && !showGardenHint && (
              <div className="walk-garden-empty">
                <div style={{fontSize:'2.8rem'}}>🌍</div>
                <div>Loop naar een 🏡 om een tuin te bezoeken</div>
                <div style={{opacity:0.5,fontSize:'0.8rem',marginTop:'0.3rem'}}>
                  Loop naar een andere speler om te chatten of te bellen
                </div>
                {otherPlayers.length === 0 && (
                  <div style={{opacity:0.5,marginTop:'0.5rem',fontSize:'0.8rem'}}>
                    Geen andere spelers online
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default WorldMap;
