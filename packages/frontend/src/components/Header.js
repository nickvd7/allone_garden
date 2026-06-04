import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import appLogo from '../assets/allone-garden-logo-transparent.png';

// Supported UI languages (add more by adding locale files + registering in i18n/config.js)
const LANGUAGES = [
  { code: 'en', label: 'EN 🇬🇧' },
  { code: 'nl', label: 'NL 🇳🇱' },
  { code: 'de', label: 'DE 🇩🇪' },
  { code: 'fr', label: 'FR 🇫🇷' },
  { code: 'es', label: 'ES 🇪🇸' },
  { code: 'pt', label: 'PT 🇵🇹' },
  { code: 'ru', label: 'RU 🇷🇺' },
  { code: 'it', label: 'IT 🇮🇹' },
  { code: 'pl', label: 'PL 🇵🇱' },
  { code: 'tr', label: 'TR 🇹🇷' },
  { code: 'ja', label: 'JA 🇯🇵' },
  { code: 'ko', label: 'KO 🇰🇷' },
  { code: 'zh', label: 'ZH 🇨🇳' },
  { code: 'hi', label: 'HI 🇮🇳' },
  { code: 'id', label: 'ID 🇮🇩' },
  { code: 'vi', label: 'VI 🇻🇳' },
  { code: 'uk', label: 'UK 🇺🇦' },
  { code: 'el', label: 'Ελληνικά 🇬🇷' },
  { code: 'ar', label: 'AR 🇸🇦', rtl: true },
];

function Header({
  onLanguageChange,
  currentLang,
  serverInfo,
  username,
  darkMode,
  onToggleDark,
  onLogout,
  onOpenAccount,
  onOpenTrade: _onOpenTrade,
  onOpenPlugins,
  onOpenProfile,
  onOpenWorldMap: _onOpenWorldMap,
  onOpenSocialMenu,
  socialBadge,
  onToggleInventory,
  inventoryOpen,
  worldSummary: _worldSummary,
  onNextDay,
  onOpenXpDetails: _onOpenXpDetails,
}) {
  const { t } = useTranslation();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileWrapRef = useRef(null);

  useEffect(() => {
    if (!profileOpen) return undefined;
    const onDocPointerDown = (e) => {
      if (profileWrapRef.current && !profileWrapRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setProfileOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [profileOpen]);

  return (
    <header className="header" data-tour="header">
      <h1 className="header-brand">
        <img src={appLogo} alt={t('app_title')} className="header-brand-logo" />
      </h1>

      <div className="header-actions">
        {onNextDay && (
          <button
            type="button"
            className="header-icon-btn header-icon-btn--minimal header-icon-btn--nextday"
            onClick={onNextDay}
            aria-label={t('header_next_day', { defaultValue: 'Next day' })}
          >
            ⏭️ <span className="header-icon-btn__label">{t('header_next_day', { defaultValue: 'Next day' })}</span>
          </button>
        )}

        {onOpenSocialMenu && (
          <button
            type="button"
            className="header-icon-btn header-icon-btn--minimal header-icon-btn--badge-wrap"
            onClick={onOpenSocialMenu}
            title={t('header_menu_social', { defaultValue: 'Chat & Online Players' })}
            aria-label={t('header_menu_social', { defaultValue: 'Chat & Players' })}
          >
            💬
            {serverInfo?.players > 1 && (
              <span style={{ fontSize: '0.65rem', color: '#4caf50', marginLeft: '0.25rem', fontWeight: 600 }}>
                {serverInfo.players} online
              </span>
            )}
            {socialBadge > 0 && (
              <span className="header-icon-btn__badge" aria-hidden>
                {socialBadge > 99 ? '99+' : socialBadge}
              </span>
            )}
          </button>
        )}

        {onToggleInventory && (
          <button
            type="button"
            className="header-icon-btn"
            onClick={onToggleInventory}
            title={t('header_menu_inventory', { defaultValue: 'Inventory' })}
          >
            🎒 <span className="header-icon-btn__label">{t('header_menu_inventory', { defaultValue: 'Inventory' })}</span> {inventoryOpen ? '▴' : '▾'}
          </button>
        )}

        <div className="header-more" ref={profileWrapRef}>
          <button
            type="button"
            className="header-icon-btn header-icon-btn--minimal header-user-icon-btn"
            aria-expanded={profileOpen}
            aria-haspopup="menu"
            aria-controls="header-profile-menu"
            id="header-profile-btn"
            onClick={(e) => {
              e.stopPropagation();
              setProfileOpen((o) => !o);
            }}
            title={t('header_profile_title', { defaultValue: 'Profile' })}
          >
            👤
          </button>
          {profileOpen && (
            <div
              id="header-profile-menu"
              role="menu"
              aria-labelledby="header-profile-btn"
              className="header-more-dropdown"
            >
              {onOpenProfile ? (
                <button
                  type="button"
                  role="menuitem"
                  className="header-more-item header-more-item--label header-more-item--label-btn"
                  onClick={() => { setProfileOpen(false); onOpenAccount?.(); }}
                >
                  👤 {username || 'Guest'}
                </button>
              ) : (
                <div className="header-more-item header-more-item--label" aria-hidden>
                  👤 {username || 'Guest'}
                </div>
              )}
              {onOpenProfile && (
                <button
                  type="button"
                  role="menuitem"
                  className="header-more-item"
                  onClick={() => { setProfileOpen(false); onOpenProfile(); }}
                >
                  📊 {t('header_profile_title', { defaultValue: 'Profile' })}
                </button>
              )}
              {onOpenPlugins && (
                <button
                  type="button"
                  role="menuitem"
                  className="header-more-item"
                  onClick={() => { setProfileOpen(false); onOpenPlugins(); }}
                  title={t('header_menu_plugins', { defaultValue: 'Plugins' })}
                >
                  🔌 {t('header_menu_plugins', { defaultValue: 'Plugins' })}
                </button>
              )}
              {onToggleDark && (
                <button
                  type="button"
                  role="menuitem"
                  className="header-more-item"
                  onClick={() => { setProfileOpen(false); onToggleDark(); }}
                  title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {darkMode ? '☀️' : '🌙'} {darkMode ? t('theme_light', { defaultValue: 'Light mode' }) : t('theme_dark', { defaultValue: 'Dark mode' })}
                </button>
              )}
              <select
                id="header-profile-lang"
                className="lang-selector header-profile-lang"
                value={currentLang}
                onChange={(e) => onLanguageChange(e.target.value)}
                aria-label="Language"
                title={t('language', { defaultValue: 'Language' })}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
              {onLogout && (
                <>
                  <div className="header-more-divider" aria-hidden="true" />
                  <button type="button" role="menuitem" className="header-more-item" onClick={() => { setProfileOpen(false); onLogout(); }} title="Log out">
                    🚪 {t('header_logout_short', { defaultValue: 'Logout' })}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
