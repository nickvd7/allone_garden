/**
 * Leaderboard — top players on this server.
 * Sortable by XP, coins, or plants grown; optional filter by in-game season (garden day).
 * "Archive" mode shows stored scores when players crossed a season boundary (requires DB).
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../hooks/useApi';

const SORTS = [
  { key: 'xp',     labelKey: 'leaderboard.sort_xp',     defaultLabel: '⭐ XP'     },
  { key: 'coins',  labelKey: 'leaderboard.sort_coins',  defaultLabel: '🪙 Coins'  },
  { key: 'plants', labelKey: 'leaderboard.sort_plants', defaultLabel: '🌱 Plants' },
];

const SEASONS = [
  { key: '',         labelKey: 'leaderboard.season_all',     defaultLabel: '🌍 All'     },
  { key: 'spring',   labelKey: 'leaderboard.season_spring',  defaultLabel: '🌸 Spring'  },
  { key: 'summer',   labelKey: 'leaderboard.season_summer',  defaultLabel: '☀️ Summer'  },
  { key: 'autumn',   labelKey: 'leaderboard.season_autumn',  defaultLabel: '🍂 Autumn'  },
  { key: 'winter',   labelKey: 'leaderboard.season_winter',  defaultLabel: '❄️ Winter'  },
];

const MEDAL = ['🥇', '🥈', '🥉'];

export default function Leaderboard({ currentUserId, onClose }) {
  const { t } = useTranslation();
  const [sortBy,   setSortBy]   = useState('xp');
  const [season,   setSeason]   = useState('');
  const [viewMode, setViewMode] = useState('live');
  const [historyCycles, setHistoryCycles] = useState([]);
  const [historyCycle, setHistoryCycle] = useState(null);
  const [rows,     setRows]     = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (viewMode !== 'history') return;
    api.get('/api/leaderboard/history/cycles')
      .then((d) => {
        const c = d.cycles || [];
        setHistoryCycles(c);
        setHistoryCycle((prev) => (prev !== null && prev !== undefined && c.includes(prev) ? prev : (c[0] ?? null)));
      })
      .catch(() => {});
  }, [viewMode]);

  useEffect(() => {
    setLoading(true);
    if (viewMode === 'history') {
      if (!season) {
        setRows([]);
        setLoading(false);
        return;
      }
      const c = historyCycle !== null && historyCycle !== undefined ? `&cycle=${historyCycle}` : '';
      api.get(`/api/leaderboard/history?by=${sortBy}&season=${encodeURIComponent(season)}${c}`)
        .then(setRows)
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
      return;
    }
    const q = season ? `&season=${encodeURIComponent(season)}` : '';
    api.get(`/api/leaderboard?by=${sortBy}${q}`)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [sortBy, season, viewMode, historyCycle]);

  const valueKey = sortBy === 'plants' ? 'plantsGrown' : sortBy;

  const emptyKey = viewMode === 'history' ? 'leaderboard.history_empty' : 'leaderboard.empty';

  return (
    <div
      className="modal-overlay leaderboard-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        className="modal leaderboard-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leaderboard-title"
      >
        <div className="modal-header">
          <h2 id="leaderboard-title">{t('leaderboard.title', { defaultValue: '🏆 Leaderboard' })}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label={t('videoCall.close', { defaultValue: 'Close' })}
          >
            ✕
          </button>
        </div>

        <div className="leaderboard-toolbar">
          <button
            type="button"
            onClick={() => setViewMode('live')}
            className={`leaderboard-chip ${viewMode === 'live' ? 'leaderboard-chip--active' : ''}`}
          >
            {t('leaderboard.mode_live', { defaultValue: 'Live' })}
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('history');
              if (!season) setSeason('spring');
            }}
            className={`leaderboard-chip ${viewMode === 'history' ? 'leaderboard-chip--active' : ''}`}
          >
            {t('leaderboard.mode_history', { defaultValue: 'Archive' })}
          </button>
          {viewMode === 'history' && historyCycles.length > 0 && (
            <label>
              {t('leaderboard.history_cycle', { defaultValue: 'Cycle' })}
              <select
                className="leaderboard-select"
                value={historyCycle ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setHistoryCycle(v === '' ? null : parseInt(v, 10));
                }}
                aria-label={t('leaderboard.history_cycle', { defaultValue: 'Cycle' })}
              >
                {historyCycles.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="leaderboard-toolbar">
          {SEASONS.map(({ key, labelKey, defaultLabel }) => (
            <button
              key={key || 'all'}
              type="button"
              onClick={() => setSeason(key)}
              className={`leaderboard-chip ${season === key ? 'leaderboard-chip--active' : ''}`}
            >
              {t(labelKey, { defaultValue: defaultLabel })}
            </button>
          ))}
        </div>

        <div className="leaderboard-toolbar">
          {SORTS.map(({ key, labelKey, defaultLabel }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSortBy(key)}
              className={`leaderboard-sort ${sortBy === key ? 'leaderboard-sort--active' : ''}`}
            >
              {t(labelKey, { defaultValue: defaultLabel })}
            </button>
          ))}
        </div>

        <div className="leaderboard-list">
          {loading ? (
            <div className="leaderboard-empty">
              {t('leaderboard.loading', { defaultValue: 'Loading…' })}
            </div>
          ) : rows.length === 0 ? (
            <div className="leaderboard-empty">
              {t(emptyKey, { defaultValue: viewMode === 'history' ? 'No archived scores for this season yet.' : 'No players yet.' })}
            </div>
          ) : (
            rows.map((player, i) => {
              const isMe = player.id === currentUserId;
              return (
                <div
                  key={player.id}
                  className={`leaderboard-row ${isMe ? 'leaderboard-row--self' : ''}`}
                >
                  <span className="leaderboard-rank">
                    {MEDAL[i] || `${i + 1}`}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="leaderboard-name">
                      {player.username}{' '}
                      {isMe && (
                        <span className="leaderboard-you">
                          ({t('leaderboard.you', { defaultValue: 'you' })})
                        </span>
                      )}
                    </div>
                    <div className="leaderboard-meta">
                      Lv {player.level} · {player.xp} XP · {player.coins} 🪙 · {player.plantsGrown} 🌱
                    </div>
                  </div>
                  <div className="leaderboard-value">
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
