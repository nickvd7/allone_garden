import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// Demo players shown when no socket is connected
const DEMO_PLAYERS = [
  { id: 1, username: 'GardenGuru', level: 12, server: 'local' },
  { id: 2, username: 'PlantLover', level: 7,  server: 'local' },
  { id: 3, username: 'Tomato_Tom', level: 4,  server: 'nl.garden' },
];

function PlayersPanel({ socket, onVisit, onHelp, onTrade }) {
  const { t } = useTranslation();
  const [players, setPlayers] = useState(DEMO_PLAYERS);

  useEffect(() => {
    if (!socket) return;

    const onPlayerList = (list) => setPlayers(list);
    const onPlayerJoined = (player) =>
      setPlayers((prev) => [...prev.filter((p) => p.id !== player.id), player]);
    const onPlayerLeft = ({ id }) =>
      setPlayers((prev) => prev.filter((p) => p.id !== id));

    socket.on('players:list', onPlayerList);
    socket.on('player:joined', onPlayerJoined);
    socket.on('player:left', onPlayerLeft);

    return () => {
      socket.off('players:list', onPlayerList);
      socket.off('player:joined', onPlayerJoined);
      socket.off('player:left', onPlayerLeft);
    };
  }, [socket]);

  const handleVisit = (player) => {
    if (socket) socket.emit('garden:visit', { targetUserId: player.id });
    if (onVisit) onVisit(player);
  };

  const handleHelp = (player) => {
    if (socket) socket.emit('player:help', { targetUserId: player.id, amount: 10 });
    if (onHelp) onHelp(player);
  };

  const handleTrade = (player) => {
    if (onTrade) onTrade(player);
  };

  return (
    <div className="card">
      <h3>👥 {t('online_players')} ({players.length})</h3>

      <div className="player-list">
        {players.map((player) => (
          <div key={player.id} className="player-item">
            <div className="player-name">
              <span className="online-dot" />
              {player.username}
              <span style={{ fontSize: '0.7rem', color: '#aaa', fontWeight: 400 }}>
                Lv.{player.level}
              </span>
            </div>

            <div className="player-actions">
              <button
                className="player-action-btn"
                onClick={() => handleVisit(player)}
                title={t('visit')}
              >
                👁 {t('visit')}
              </button>
              <button
                className="player-action-btn"
                onClick={() => handleHelp(player)}
                title={t('help')}
              >
                🤝 {t('help')}
              </button>
              <button
                className="player-action-btn"
                onClick={() => handleTrade(player)}
                title={t('trade')}
              >
                🔄 {t('trade')}
              </button>
            </div>
          </div>
        ))}

        {players.length === 0 && (
          <div style={{ color: '#aaa', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>
            No other players online
          </div>
        )}
      </div>
    </div>
  );
}

export default PlayersPanel;
