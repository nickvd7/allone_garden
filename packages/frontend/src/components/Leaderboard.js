/**
 * Leaderboard — top players on this server.
 * Sortable by XP, coins, or plants grown.
 */
import React, { useState, useEffect } from 'react';
import api from '../hooks/useApi';

const SORTS = [
  { key: 'xp',     label: '⭐ XP'     },
  { key: 'coins',  label: '🪙 Coins'  },
  { key: 'plants', label: '🌱 Plants' },
];

const MEDAL = ['🥇', '🥈', '🥉'];

const OVERLAY = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 600, padding: '1rem',
};
const MODAL = {
  background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '560px',
  maxHeight: '85vh', display: 'flex', flexDirection: 'column',
  boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
};

export default function Leaderboard({ currentUserId, onClose }) {
  const [sortBy,   setSortBy]   = useState('xp');
  const [rows,     setRows]     = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/leaderboard?by=${sortBy}`)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [sortBy]);

  const valueKey = sortBy === 'plants' ? 'plantsGrown' : sortBy;

  return (
    <div style={OVERLAY} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={MODAL}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid #eee' }}>
          <h2 style={{ margin: 0, color: '#2e7d32' }}>🏆 Leaderboard</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#aaa' }}>✕</button>
        </div>

        {/* Sort tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1.5rem', borderBottom: '1px solid #eee' }}>
          {SORTS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              style={{
                padding: '0.4rem 0.9rem', border: 'none', borderRadius: '20px',
                cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600,
                background: sortBy === key ? '#388e3c' : '#f1f8e9',
                color:      sortBy === key ? '#fff'    : '#388e3c',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0.5rem 0' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#aaa' }}>Loading…</div>
          ) : rows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#aaa' }}>No players yet.</div>
          ) : (
            rows.map((player, i) => {
              const isMe = player.id === currentUserId;
              return (
                <div
                  key={player.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.7rem 1.5rem',
                    background: isMe ? '#f1f8e9' : 'transparent',
                    borderLeft: isMe ? '4px solid #4caf50' : '4px solid transparent',
                  }}
                >
                  <span style={{ fontSize: '1.3rem', width: '2rem', textAlign: 'center' }}>
                    {MEDAL[i] || `${i + 1}`}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', color: isMe ? '#2e7d32' : '#333' }}>
                      {player.username} {isMe && <span style={{ fontSize: '0.75rem', color: '#888' }}>(you)</span>}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#888' }}>
                      Lv {player.level} · {player.xp} XP · {player.coins} 🪙 · {player.plantsGrown} 🌱
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#388e3c' }}>
                    {(player[valueKey] || 0).toLocaleString()}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
