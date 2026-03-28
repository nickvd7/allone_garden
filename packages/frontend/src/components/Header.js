import React from 'react';
import { useTranslation } from 'react-i18next';

// Supported UI languages (add more by adding locale files)
const LANGUAGES = [
  { code: 'en', label: 'EN 🇬🇧' },
  { code: 'nl', label: 'NL 🇳🇱' },
];

const HEADER_BTN = {
  padding: '0.4rem 0.8rem',
  border: 'none',
  borderRadius: '6px',
  background: 'rgba(255,255,255,0.15)',
  color: 'white',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: '600',
};

function Header({ onLanguageChange, currentLang, serverInfo, username, darkMode, onToggleDark, onLogout, onOpenTrade, onOpenPlugins, onOpenAchievements, onOpenAdmin, onOpenAccount, onOpenLeaderboard, onOpenWorldMap }) {
  const { t } = useTranslation();

  return (
    <header className="header">
      <h1>🌱 {t('app_title')}</h1>

      <div className="header-actions">
        {serverInfo && (
          <div className="server-badge">
            <span className="dot" />
            {serverInfo.name || 'Local Server'} · {serverInfo.players || 0} online
          </div>
        )}

        {onOpenTrade && (
          <button style={HEADER_BTN} onClick={onOpenTrade} title="Marketplace">
            🔄 {t('trade')}
          </button>
        )}

        {onOpenPlugins && (
          <button style={HEADER_BTN} onClick={onOpenPlugins} title="Plugins">
            🔌 Plugins
          </button>
        )}

        {onOpenAchievements && (
          <button style={HEADER_BTN} onClick={onOpenAchievements} title="Achievements">
            🏆 Badges
          </button>
        )}

        {onOpenWorldMap && (
          <button style={HEADER_BTN} onClick={onOpenWorldMap} title="World Map — visit other players">
            🗺️ World
          </button>
        )}

        {onOpenLeaderboard && (
          <button style={HEADER_BTN} onClick={onOpenLeaderboard} title="Leaderboard">
            📊 Scores
          </button>
        )}

        {onOpenAdmin && (
          <button style={HEADER_BTN} onClick={onOpenAdmin} title="Admin Panel">
            ⚙️ Admin
          </button>
        )}

        {username && (
          <button style={HEADER_BTN} onClick={onOpenAccount} title="Account settings">
            👤 {username}
          </button>
        )}

        {onToggleDark && (
          <button
            style={HEADER_BTN}
            onClick={onToggleDark}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle dark mode"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        )}

        <select
          className="lang-selector"
          value={currentLang}
          onChange={(e) => onLanguageChange(e.target.value)}
          aria-label="Language"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>

        {onLogout && (
          <button style={HEADER_BTN} onClick={onLogout} title="Log out">
            ⬡ Logout
          </button>
        )}
      </div>
    </header>
  );
}

export default Header;
