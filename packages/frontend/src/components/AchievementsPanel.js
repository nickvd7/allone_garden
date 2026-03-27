import React, { useState, useEffect } from 'react';

// Mirror of the server-side achievement definitions (for display only)
const ALL_ACHIEVEMENTS = [
  { id: 'first_plant',    emoji: '🌱', title: 'First Sprout',      desc: 'Plant your first seed'             },
  { id: 'green_thumb',    emoji: '🌿', title: 'Green Thumb',       desc: 'Plant 10 seeds'                    },
  { id: 'botanist',       emoji: '🌳', title: 'Botanist',          desc: 'Plant 50 seeds'                    },
  { id: 'first_harvest',  emoji: '🧺', title: 'First Harvest',     desc: 'Harvest your first crop'           },
  { id: 'bumper_crop',    emoji: '🌽', title: 'Bumper Crop',       desc: 'Harvest 25 crops'                  },
  { id: 'master_farmer',  emoji: '🏆', title: 'Master Farmer',     desc: 'Harvest 100 crops'                 },
  { id: 'hydrated',       emoji: '💧', title: 'Hydrated',          desc: 'Water a plot 10 times'             },
  { id: 'rain_maker',     emoji: '🌊', title: 'Rain Maker',        desc: 'Water plots 100 times'             },
  { id: 'enriched',       emoji: '✨', title: 'Enriched Soil',     desc: 'Fertilize a plot for the first time'},
  { id: 'merchant',       emoji: '🔄', title: 'Merchant',          desc: 'Complete your first trade'         },
  { id: 'market_master',  emoji: '💰', title: 'Market Master',     desc: 'Complete 10 trades'                },
  { id: 'good_neighbour', emoji: '🤝', title: 'Good Neighbour',    desc: 'Help another player'               },
  { id: 'explorer',       emoji: '🗺️', title: 'Explorer',          desc: "Visit another player's garden"    },
  { id: 'week_1',         emoji: '📅', title: 'One Week',          desc: 'Reach day 7'                       },
  { id: 'month_1',        emoji: '🌙', title: 'One Month',         desc: 'Reach day 30'                      },
  { id: 'season_1',       emoji: '🍂', title: 'First Season',      desc: 'Reach day 90'                      },
  { id: 'piggy_bank',     emoji: '🐷', title: 'Piggy Bank',        desc: 'Accumulate 500 coins'              },
  { id: 'wealthy',        emoji: '💎', title: 'Wealthy Gardener',  desc: 'Accumulate 5 000 coins'            },
  { id: 'variety',        emoji: '🌈', title: 'Variety is Life',   desc: 'Grow all 6 different plant types'  },
];

function AchievementsPanel({ socket, userId, onClose }) {
  const [unlocked, setUnlocked]   = useState(new Set());
  const [unlockedAt, setUnlockedAt] = useState({});
  const [newFlash, setNewFlash]   = useState(null); // { emoji, title } for toast

  // Request unlocked list from the achievements plugin
  useEffect(() => {
    if (!socket || !userId) return;
    socket.emit('plugin:achievements:request', { userId });
  }, [socket, userId]);

  // Listen for the server response
  useEffect(() => {
    if (!socket) return;

    const onData = ({ achievements }) => {
      const ids = new Set(achievements.map((a) => a.achievement_id));
      const dates = {};
      achievements.forEach((a) => { dates[a.achievement_id] = a.unlocked_at; });
      setUnlocked(ids);
      setUnlockedAt(dates);
    };

    const onNew = ({ userId: uid, achievement }) => {
      if (uid !== userId) return;
      setUnlocked((prev) => new Set([...prev, achievement.id]));
      setNewFlash(achievement);
      setTimeout(() => setNewFlash(null), 3500);
    };

    socket.on('plugin:achievements:data', onData);
    socket.on('plugin:achievements:unlocked', onNew);

    return () => {
      socket.off('plugin:achievements:data', onData);
      socket.off('plugin:achievements:unlocked', onNew);
    };
  }, [socket, userId]);

  const unlockedCount = unlocked.size;

  return (
    <>
      {/* Toast for newly unlocked achievement */}
      {newFlash && (
        <div style={styles.toast}>
          <span style={{ fontSize: '1.8rem' }}>{newFlash.emoji}</span>
          <div>
            <strong>Achievement unlocked!</strong>
            <div style={{ fontSize: '0.9rem' }}>{newFlash.title}</div>
          </div>
        </div>
      )}

      <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div style={styles.modal}>
          <div style={styles.header}>
            <h2 style={styles.title}>🏆 Achievements</h2>
            <span style={styles.counter}>{unlockedCount} / {ALL_ACHIEVEMENTS.length}</span>
            <button style={styles.closeBtn} onClick={onClose}>✕</button>
          </div>

          {/* Progress bar */}
          <div style={styles.progressTrack}>
            <div
              style={{
                ...styles.progressFill,
                width: `${(unlockedCount / ALL_ACHIEVEMENTS.length) * 100}%`,
              }}
            />
          </div>

          <div style={styles.grid}>
            {ALL_ACHIEVEMENTS.map((ach) => {
              const done = unlocked.has(ach.id);
              return (
                <div
                  key={ach.id}
                  style={{ ...styles.card, ...(done ? styles.cardDone : styles.cardLocked) }}
                  title={done ? `Unlocked: ${new Date(unlockedAt[ach.id]).toLocaleDateString()}` : 'Locked'}
                >
                  <div style={{ fontSize: done ? '2rem' : '1.8rem', filter: done ? 'none' : 'grayscale(1)', opacity: done ? 1 : 0.35 }}>
                    {ach.emoji}
                  </div>
                  <div style={styles.achTitle}>{ach.title}</div>
                  <div style={styles.achDesc}>{ach.desc}</div>
                  {done && <div style={styles.checkmark}>✓</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 500, padding: '1rem',
  },
  modal: {
    background: 'white', borderRadius: '14px',
    width: '100%', maxWidth: '780px', maxHeight: '85vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 16px 48px rgba(0,0,0,0.2)', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '1.25rem 1.5rem', borderBottom: '1px solid #eee',
  },
  title: { margin: 0, color: '#2e7d32', fontSize: '1.3rem', flex: 1 },
  counter: {
    background: '#e8f5e9', color: '#2e7d32',
    padding: '0.2rem 0.7rem', borderRadius: '12px',
    fontWeight: '700', fontSize: '0.9rem',
  },
  closeBtn: {
    border: 'none', background: 'none', fontSize: '1.2rem',
    cursor: 'pointer', color: '#aaa',
  },
  progressTrack: {
    height: '6px', background: '#e0e0e0', margin: '0 1.5rem 0',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #4caf50, #8bc34a)',
    transition: 'width 0.5s ease',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: '0.75rem',
    padding: '1.25rem 1.5rem',
    overflowY: 'auto',
  },
  card: {
    borderRadius: '10px', padding: '1rem 0.75rem',
    textAlign: 'center', position: 'relative',
    border: '2px solid transparent',
    transition: 'transform 0.15s, box-shadow 0.15s',
  },
  cardDone: {
    background: '#f1f8e9', border: '2px solid #a5d6a7',
    boxShadow: '0 2px 8px rgba(76,175,80,0.15)',
  },
  cardLocked: { background: '#fafafa', border: '2px solid #eee' },
  achTitle: {
    fontWeight: '700', fontSize: '0.85rem', color: '#333',
    margin: '0.4rem 0 0.2rem',
  },
  achDesc: { fontSize: '0.75rem', color: '#888', lineHeight: '1.3' },
  checkmark: {
    position: 'absolute', top: '6px', right: '8px',
    color: '#4caf50', fontWeight: '700', fontSize: '0.9rem',
  },
  toast: {
    position: 'fixed', bottom: '5rem', right: '1.5rem',
    background: '#2e7d32', color: 'white',
    padding: '0.9rem 1.25rem', borderRadius: '12px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    zIndex: 1000, animation: 'slideIn 0.3s ease',
    minWidth: '220px',
  },
};

export default AchievementsPanel;
