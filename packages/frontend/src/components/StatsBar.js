import React from 'react';
import { useTranslation } from 'react-i18next';

// XP required per level (simple quadratic formula)
function xpForLevel(level) {
  return level * level * 100;
}

function StatsBar({ stats }) {
  const { t } = useTranslation();
  const { xp, coins, level, plantsGrown } = stats;

  const xpNeeded = xpForLevel(level);
  const xpProgress = Math.min((xp / xpNeeded) * 100, 100);

  return (
    <div className="card stats-bar">
      <div className="stats-grid">
        <div className="stat-item">
          <div className="stat-value"><span className="stat-level">⭐ {level}</span></div>
          <div className="stat-label">{t('level')}</div>
        </div>

        <div className="stat-item">
          <div className="stat-value"><span className="stat-coins">🪙 {coins}</span></div>
          <div className="stat-label">{t('coins')}</div>
        </div>

        <div className="stat-item stat-grown">
          <div className="stat-value">🌱 {plantsGrown}</div>
          <div className="stat-label">{t('plants_grown')}</div>
        </div>

        {/* XP progress spans remaining columns */}
        <div className="stat-item" style={{ gridColumn: 'span 2' }}>
          <div className="stat-label" style={{ textAlign: 'left', marginBottom: '0.3rem' }}>
            <span className="stat-xp">{t('xp')} · {xp}</span> / {xpNeeded}
          </div>
          <div className="xp-bar-track">
            <div
              className="xp-bar-fill"
              style={{ width: `${xpProgress}%` }}
              role="progressbar"
              aria-valuenow={xp}
              aria-valuemin={0}
              aria-valuemax={xpNeeded}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default StatsBar;
