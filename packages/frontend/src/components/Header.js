import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { IconWorld, IconChat, IconBell, IconProfile, IconAdmin } from './HeaderIcons';

const WEATHER_ICONS = {
  sunny: '☀️',
  cloudy: '☁️',
  rainy: '🌧️',
  windy: '💨',
  storm: '⛈️',
  drought: '🏜️',
};

function Header({
  username,
  darkMode,
  onToggleDark,
  onLogout,
  onOpenPlugins,
  onOpenProfile,
  onOpenWorldMap,
  onOpenSocialMenu,
  socialBadge,
  socialOpen = false,
  worldSummary,
  communityGoal,
  communityProgress,
  onNextDay,
  onOpenHelp,
  onOpenGradendex,
  onOpenAdmin,
  isAdmin = false,
  onOpenNotifications,
  notificationsBadge = 0,
  notificationsOpen = false,
  onProfileMenuToggle,
  worldMapOpen,
}) {
  const { t } = useTranslation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const profileWrapRef = useRef(null);
  const statusWrapRef = useRef(null);

  useEffect(() => {
    if (!profileOpen && !statusOpen) return undefined;
    const onDocPointerDown = (e) => {
      if (profileOpen && profileWrapRef.current && !profileWrapRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
      if (statusOpen && statusWrapRef.current && !statusWrapRef.current.contains(e.target)) {
        setStatusOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setProfileOpen(false);
        setStatusOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [profileOpen, statusOpen]);

  const goalPct = communityGoal?.target
    ? Math.min(100, Math.round(((communityProgress || 0) / communityGoal.target) * 100))
    : 0;

  return (
    <header className="header header--game" data-tour="header">
      <div className="header-start" ref={statusWrapRef}>
        <button
          type="button"
          className="header-day-chip"
          aria-expanded={statusOpen}
          onClick={() => setStatusOpen((o) => !o)}
          title={t('header_world_status')}
        >
          <span className="header-day-chip__main">📅 {t('day')} {worldSummary?.currentDay || 1}</span>
          <span className="header-day-chip__chevron" aria-hidden>{statusOpen ? '▴' : '▾'}</span>
        </button>

        {statusOpen && worldSummary && (
          <div className="header-status-popover" role="region" aria-label={t('header_world_status')}>
            <div className="header-status-popover__row">
              {t(`leaderboard.season_${worldSummary.season || 'spring'}`, { defaultValue: worldSummary.season })}
            </div>
            <div className="header-status-popover__row">
              {WEATHER_ICONS[worldSummary.weather] || '🌤️'}{' '}
              {t(`weather_${worldSummary.weather || 'sunny'}`, { defaultValue: worldSummary.weather })}
            </div>
            <div className="header-status-popover__row">✨ XP {worldSummary.xp ?? 0}</div>
            <div className="header-status-popover__row">📍 {worldSummary.coords || '-,-'}</div>
            {!worldSummary.isGuest && (
              <div className="header-status-popover__row">👥 {worldSummary.onlineCount ?? 0} online</div>
            )}
            {communityGoal && (
              <div className="header-status-popover__row header-status-popover__goal">
                {communityGoal.icon} {communityGoal.text} — {communityProgress || 0}/{communityGoal.target} ({goalPct}%)
              </div>
            )}
          </div>
        )}

        {onNextDay && (
          <button
            type="button"
            className="header-next-day-btn"
            onClick={onNextDay}
            aria-label={t('header_next_day')}
          >
            ⏭️ <span className="header-next-day-btn__text">{t('header_next_day')}</span>
          </button>
        )}
      </div>

      <div className="header-actions">
        {onOpenWorldMap && (
          <button
            type="button"
            className={`header-action-btn${worldMapOpen ? ' header-action-btn--active' : ''}`}
            onClick={onOpenWorldMap}
            title={t('header_world_map_title')}
            aria-label={t('header_world_map_title')}
            aria-pressed={worldMapOpen}
            data-tour="world"
          >
            <span className="header-action-btn__icon" aria-hidden><IconWorld /></span>
            <span className="header-action-btn__label">{t('header_world_short')}</span>
          </button>
        )}

        {onOpenSocialMenu && (
          <button
            type="button"
            className={`header-action-btn header-action-btn--badge-wrap${socialOpen ? ' header-action-btn--active' : ''}`}
            onClick={onOpenSocialMenu}
            title={t('header_menu_social')}
            aria-label={t('header_menu_social')}
            aria-pressed={socialOpen}
            data-social-toggle
            data-tour="chat-toggle"
          >
            <span className="header-action-btn__icon" aria-hidden><IconChat /></span>
            <span className="header-action-btn__label">{t('chat')}</span>
            {socialBadge > 0 && (
              <span className="header-action-btn__badge" aria-hidden>
                {socialBadge > 99 ? '99+' : socialBadge}
              </span>
            )}
          </button>
        )}

        {onOpenNotifications && (
          <button
            type="button"
            className={`header-action-btn header-action-btn--badge-wrap${notificationsOpen ? ' header-action-btn--active' : ''}`}
            onClick={onOpenNotifications}
            title={t('header_notifications_title')}
            aria-label={t('header_notifications_title')}
            aria-pressed={notificationsOpen}
            data-notifications-toggle
            data-tour="notifications"
          >
            <span className="header-action-btn__icon" aria-hidden><IconBell /></span>
            <span className="header-action-btn__label">{t('header_notifications_short')}</span>
            {notificationsBadge > 0 && (
              <span className="header-action-btn__badge" aria-label={t('header_notifications_badge', { count: notificationsBadge, defaultValue: `${notificationsBadge} new` })}>
                {notificationsBadge > 99 ? '99+' : notificationsBadge}
              </span>
            )}
          </button>
        )}

        <div className="header-more" ref={profileWrapRef}>
          <button
            type="button"
            className="header-action-btn header-action-btn--profile"
            aria-expanded={profileOpen}
            aria-haspopup="menu"
            aria-controls="header-profile-menu"
            id="header-profile-btn"
            onClick={(e) => {
              e.stopPropagation();
              onProfileMenuToggle?.();
              setProfileOpen((o) => !o);
            }}
            title={username ? `${t('header_profile_title')} — ${username}` : t('header_profile_title')}
          >
            <span className="header-action-btn__icon" aria-hidden><IconProfile /></span>
            <span className="header-action-btn__label header-action-btn__label--profile">
              {t('header_profile_title')}
            </span>
          </button>
          {profileOpen && (
            <div
              id="header-profile-menu"
              role="menu"
              aria-labelledby="header-profile-btn"
              className="header-more-dropdown"
            >
              {onOpenProfile && (
                <button
                  type="button"
                  role="menuitem"
                  className="header-more-item"
                  onClick={() => { setProfileOpen(false); onOpenProfile(); }}
                >
                  👤 {t('header_profile_title')}
                </button>
              )}
              {onOpenGradendex && (
                <button
                  type="button"
                  role="menuitem"
                  className="header-more-item"
                  onClick={() => { setProfileOpen(false); onOpenGradendex(); }}
                >
                  📖 {t('header_menu_gradendex')}
                </button>
              )}
              {onOpenPlugins && (
                <button
                  type="button"
                  role="menuitem"
                  className="header-more-item"
                  onClick={() => { setProfileOpen(false); onOpenPlugins(); }}
                >
                  🔌 {t('header_menu_plugins')}
                </button>
              )}
              {isAdmin && onOpenAdmin && (
                <button
                  type="button"
                  role="menuitem"
                  className="header-more-item"
                  onClick={() => { setProfileOpen(false); onOpenAdmin(); }}
                >
                  <span className="header-more-item__icon" aria-hidden><IconAdmin /></span>
                  {t('header_menu_admin', { defaultValue: 'Admin' })}
                </button>
              )}
              {onToggleDark && (
                <button
                  type="button"
                  role="menuitem"
                  className="header-more-item"
                  onClick={() => { setProfileOpen(false); onToggleDark(); }}
                >
                  {darkMode ? '☀️' : '🌙'}{' '}
                  {darkMode ? t('theme_light', { defaultValue: 'Light mode' }) : t('theme_dark', { defaultValue: 'Dark mode' })}
                </button>
              )}
              {onLogout && (
                <>
                  <div className="header-more-divider" aria-hidden="true" />
                  {onOpenHelp && (
                    <button
                      type="button"
                      role="menuitem"
                      className="header-more-item"
                      onClick={() => { setProfileOpen(false); onOpenHelp(); }}
                    >
                      ❓ {t('help')}
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className="header-more-item"
                    onClick={() => { setProfileOpen(false); onLogout(); }}
                  >
                    🚪 {t('header_logout_short')}
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
