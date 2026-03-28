/**
 * SeasonBanner
 *
 * Shows the current in-game season, days remaining, and which crops
 * are boosted or penalised this season.
 *
 * Props:
 *   socket      — Socket.IO client (may be null when offline)
 *   currentDay  — current in-game day number (used to request initial data)
 */
import React, { useState, useEffect } from 'react';

const SEASON_PALETTE = {
  Spring: { bg: '#f3fde8', border: '#a5d6a7', text: '#2e7d32' },
  Summer: { bg: '#fffde7', border: '#ffe082', text: '#f57f17' },
  Autumn: { bg: '#fff3e0', border: '#ffcc80', text: '#e65100' },
  Winter: { bg: '#e3f2fd', border: '#90caf9', text: '#1565c0' },
};

const FALLBACK = { season: '…', emoji: '🌍', daysLeft: 0, bonusCrops: [], penaltyCrops: [], yieldMult: 1 };

const CROP_EMOJI = { tomato: '🍅', carrot: '🥕', lettuce: '🥬', radish: '🌸', corn: '🌽', potato: '🥔', pumpkin: '🎃' };

export default function SeasonBanner({ socket, currentDay }) {
  const [data, setData] = useState(FALLBACK);

  useEffect(() => {
    if (!socket) return;

    const onUpdate = (payload) => setData(payload);
    const onData   = (payload) => setData(payload);

    socket.on('plugin:seasons:update', onUpdate);
    socket.on('plugin:seasons:data',   onData);

    // Request current season on mount / day change
    socket.emit('plugin:seasons:request', { currentDay: currentDay || 1 });

    return () => {
      socket.off('plugin:seasons:update', onUpdate);
      socket.off('plugin:seasons:data',   onData);
    };
  }, [socket, currentDay]);

  if (data.season === '…') return null; // don't render until we have real data

  const pal = SEASON_PALETTE[data.season] || SEASON_PALETTE.Spring;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem',
      padding: '0.55rem 1rem',
      background: pal.bg, border: `1.5px solid ${pal.border}`,
      borderRadius: '10px', marginBottom: '0.75rem',
      fontSize: '0.85rem',
    }}>
      {/* Season name */}
      <span style={{ fontWeight: 700, color: pal.text, fontSize: '0.95rem' }}>
        {data.emoji} {data.season}
      </span>

      {/* Days left */}
      <span style={{ color: '#888' }}>
        {data.daysLeft} day{data.daysLeft !== 1 ? 's' : ''} left
      </span>

      {/* Yield multiplier */}
      {data.yieldMult !== 1 && (
        <span style={{
          padding: '0.1rem 0.45rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700,
          background: data.yieldMult > 1 ? '#e8f5e9' : '#fce4ec',
          color:      data.yieldMult > 1 ? '#2e7d32' : '#c62828',
        }}>
          {data.yieldMult > 1
            ? `+${Math.round((data.yieldMult - 1) * 100)}% yield`
            : `−${Math.round((1 - data.yieldMult) * 100)}% yield`}
        </span>
      )}

      {/* Bonus crops */}
      {data.bonusCrops.length > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
          <span style={{ color: '#888', fontSize: '0.78rem' }}>Bonus:</span>
          {data.bonusCrops.map((c) => (
            <span key={c} title={c} style={{
              padding: '0.1rem 0.4rem', borderRadius: '8px',
              background: '#e8f5e9', color: '#2e7d32', fontSize: '0.78rem', fontWeight: 600,
            }}>
              {CROP_EMOJI[c] || '🌿'} {c}
            </span>
          ))}
        </span>
      )}

      {/* Penalty crops */}
      {data.penaltyCrops.length > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
          <span style={{ color: '#888', fontSize: '0.78rem' }}>Slow:</span>
          {data.penaltyCrops.map((c) => (
            <span key={c} title={c} style={{
              padding: '0.1rem 0.4rem', borderRadius: '8px',
              background: '#fff3e0', color: '#e65100', fontSize: '0.78rem', fontWeight: 600,
            }}>
              {CROP_EMOJI[c] || '🌿'} {c}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
