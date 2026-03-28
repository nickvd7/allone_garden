import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../hooks/useApi';

// Reuse growth/emoji data (must stay in sync with Garden.js)
const GROWTH_STAGES = {
  tomato: 3, carrot: 2, lettuce: 2, radish: 1, corn: 4,
  potato: 3, pumpkin: 5, sunflower: 2, blueberry: 4,
};

const PLANT_EMOJIS = {
  tomato:    ['🌱', '🌿', '🍅', '🍅'],
  carrot:    ['🌱', '🌿', '🥕'],
  lettuce:   ['🌱', '🌿', '🥬'],
  radish:    ['🌱', '🌸'],
  corn:      ['🌱', '🌿', '🌾', '🌽', '🌽'],
  potato:    ['🌱', '🌿', '🌿', '🥔'],
  pumpkin:   ['🌱', '🌿', '🌿', '🟠', '🎃', '🎃'],
  sunflower: ['🌱', '🌿', '🌻'],
  blueberry: ['🌱', '🌿', '🌿', '🫐', '🫐'],
};

const WEATHER_ICONS = {
  sunny: '☀️', cloudy: '☁️', rainy: '🌧️',
  windy: '💨', storm: '⛈️', drought: '🏜️',
};

function getPlotEmoji(plot) {
  if (!plot.planted || !plot.plantType) return null;
  const totalDays = GROWTH_STAGES[plot.plantType] || 3;
  const days      = plot.daysPlanted || 0;
  const emojis    = PLANT_EMOJIS[plot.plantType] || ['🌱'];
  // Map progress to emoji index
  const idx = Math.min(
    Math.floor((days / totalDays) * (emojis.length - 1)),
    emojis.length - 1
  );
  return emojis[idx];
}

// Small read-only plot
function MiniPlot({ plot }) {
  const emoji = getPlotEmoji(plot);
  let bg = '#3e2c1e';
  if (plot.tilled && plot.waterLevel > 0) bg = '#6d5247';
  else if (plot.tilled) bg = '#7a5944';

  return (
    <div
      className="mini-plot"
      style={{ background: bg }}
      title={
        plot.planted
          ? `${plot.plantType} · day ${plot.daysPlanted}`
          : plot.tilled ? 'Tilled' : 'Untilled'
      }
    >
      {emoji && <span className="mini-plant-emoji">{emoji}</span>}
      {plot.pest && <span className="mini-pest">🐛</span>}
    </div>
  );
}

// Demo players shown when no socket is connected
const DEMO_PLAYERS = [
  { id: 1,   username: 'GardenGuru',  level: 12, server: 'local' },
  { id: 2,   username: 'PlantLover',  level: 7,  server: 'local' },
  { id: 3,   username: 'Tomato_Tom',  level: 4,  server: 'nl.garden' },
];

function WorldMap({ socket, currentUserId, onClose }) {
  const [players,       setPlayers]       = useState(DEMO_PLAYERS);
  const [selected,      setSelected]      = useState(null);   // selected player
  const [visitedGarden, setVisitedGarden] = useState(null);
  const [loadingVisit,  setLoadingVisit]  = useState(false);
  const [helpBusy,      setHelpBusy]      = useState(false);
  const [helpMsg,       setHelpMsg]       = useState('');

  // Keep player list in sync with socket
  useEffect(() => {
    if (!socket) return;
    const onList    = (list)   => setPlayers(list);
    const onJoined  = (player) => setPlayers((prev) => [...prev.filter((p) => p.id !== player.id), player]);
    const onLeft    = ({ id }) => {
      setPlayers((prev) => prev.filter((p) => p.id !== id));
      setSelected((prev) => (prev?.id === id ? null : prev));
    };
    socket.on('players:list',   onList);
    socket.on('player:joined',  onJoined);
    socket.on('player:left',    onLeft);
    return () => {
      socket.off('players:list',  onList);
      socket.off('player:joined', onJoined);
      socket.off('player:left',   onLeft);
    };
  }, [socket]);

  // Fetch visited garden when selected player changes
  const visitPlayer = useCallback(async (player) => {
    setSelected(player);
    setVisitedGarden(null);
    setHelpMsg('');
    setLoadingVisit(true);
    try {
      const data = await api.get(`/api/garden/visit/${player.id}`);
      setVisitedGarden(data);
      // Emit visit notification to the player
      socket?.emit('garden:visit', { targetUserId: player.id });
    } catch {
      setVisitedGarden(null);
    } finally {
      setLoadingVisit(false);
    }
  }, [socket]);

  // Water a few unwatered plots in the visited garden — sends help event
  const handleHelp = useCallback(() => {
    if (!selected || helpBusy) return;
    setHelpBusy(true);
    socket?.emit('player:help', { targetUserId: selected.id, amount: 15 });
    setHelpMsg(`🤝 You helped ${selected.username}'s garden! (+15 XP for them)`);
    setTimeout(() => {
      setHelpBusy(false);
    }, 3000);
  }, [selected, helpBusy, socket]);

  // Filter out yourself
  const otherPlayers = players.filter((p) => p.id !== currentUserId);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal world-map-modal">
        {/* Header */}
        <div className="modal-header">
          <h2>🗺️ World Map</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="world-map-body">
          {/* Left: player list */}
          <div className="world-map-players">
            <h3>🌐 Online Players ({otherPlayers.length})</h3>

            {otherPlayers.length === 0 && (
              <div className="world-empty">
                No other players online right now.<br />
                <span style={{ opacity: 0.6 }}>Invite a friend to start co-op gardening!</span>
              </div>
            )}

            <div className="world-player-list">
              {otherPlayers.map((player) => (
                <div
                  key={player.id}
                  className={`world-player-card${selected?.id === player.id ? ' world-player-card--active' : ''}`}
                  onClick={() => visitPlayer(player)}
                >
                  <div className="world-player-avatar">
                    {player.username[0].toUpperCase()}
                  </div>
                  <div className="world-player-info">
                    <div className="world-player-name">{player.username}</div>
                    <div className="world-player-meta">
                      Lv.{player.level}
                      {player.server && player.server !== 'local' && (
                        <span className="world-server-badge"> · {player.server}</span>
                      )}
                    </div>
                  </div>
                  <span className="world-visit-hint">👁 Visit</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: visited garden */}
          <div className="world-map-garden">
            {!selected && (
              <div className="world-garden-placeholder">
                <div className="world-garden-placeholder-icon">🌍</div>
                <div>Select a player to visit their garden</div>
              </div>
            )}

            {selected && loadingVisit && (
              <div className="world-garden-placeholder">
                <div className="world-garden-placeholder-icon" style={{ animation: 'spin 1s linear infinite' }}>⏳</div>
                <div>Loading {selected.username}'s garden…</div>
              </div>
            )}

            {selected && !loadingVisit && visitedGarden && (
              <>
                <div className="world-garden-header">
                  <div>
                    <h3>🌱 {visitedGarden.username || selected.username}'s Garden</h3>
                    <div className="world-garden-meta">
                      <span>📅 Day {visitedGarden.currentDay}</span>
                      <span>{WEATHER_ICONS[visitedGarden.weather] || '🌤️'} {visitedGarden.weather}</span>
                      <span>Lv.{visitedGarden.level || selected.level}</span>
                    </div>
                  </div>
                  <button
                    className="btn btn-primary world-help-btn"
                    onClick={handleHelp}
                    disabled={helpBusy}
                    title="Water some plots & give XP to this player"
                  >
                    {helpBusy ? '✅ Helped!' : '🤝 Help'}
                  </button>
                </div>

                {helpMsg && (
                  <div className="world-help-msg">{helpMsg}</div>
                )}

                <div className="world-garden-note">
                  👁 Viewing only — changes are theirs to make
                </div>

                <div className="mini-garden-grid">
                  {(visitedGarden.plots || []).map((plot, i) => (
                    <MiniPlot key={i} plot={plot} />
                  ))}
                </div>

                {/* Stats summary */}
                <div className="world-garden-stats">
                  {(() => {
                    const plots = visitedGarden.plots || [];
                    const tilled   = plots.filter((p) => p.tilled).length;
                    const planted  = plots.filter((p) => p.planted).length;
                    const ready    = plots.filter((p) => {
                      if (!p.planted) return false;
                      const total = GROWTH_STAGES[p.plantType] || 3;
                      return (p.daysPlanted || 0) >= total;
                    }).length;
                    return (
                      <>
                        <div className="world-stat"><span>{tilled}</span><small>Tilled</small></div>
                        <div className="world-stat"><span>{planted}</span><small>Planted</small></div>
                        <div className="world-stat"><span style={{ color: '#4caf50' }}>{ready}</span><small>Ready 🌟</small></div>
                      </>
                    );
                  })()}
                </div>
              </>
            )}

            {selected && !loadingVisit && !visitedGarden && (
              <div className="world-garden-placeholder">
                <div className="world-garden-placeholder-icon">🌿</div>
                <div>Couldn't load {selected.username}'s garden.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default WorldMap;
