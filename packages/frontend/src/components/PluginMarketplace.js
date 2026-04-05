import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../hooks/useApi';

/**
 * Plugin Marketplace
 *
 * Installed tab  — plugins currently running on this server.
 * Community tab  — registry catalogue (served by backend, falls back to bundled list).
 *
 * Admins (user.isAdmin) can install plugins from the registry and unload running ones.
 * isAdmin mirrors the server (safeUser); real authorization is enforced in /api/plugins.
 */

// Bundled fallback catalogue — shown when the backend registry is unreachable.
const CATALOGUE_FALLBACK = [
  {
    name:        'achievements',
    version:     '1.0.0',
    author:      'AllOne Garden',
    description: 'Unlockable badges for in-game milestones (first harvest, 100 coins, etc.)',
    tags:        ['gameplay', 'progression'],
    installed:   true,
    downloadUrl: null,
  },
  {
    name:        'weather-forecast',
    version:     '1.0.0',
    author:      'AllOne Garden',
    description: 'Shows a 5-day weather forecast generated each new in-game day.',
    tags:        ['weather', 'ui'],
    installed:   true,
    downloadUrl: null,
  },
  {
    name:        'daily-bonus',
    version:     '1.0.0',
    author:      'AllOne Garden',
    description: 'Awards coins and XP on first login each in-game day. Streak multiplier up to 3×.',
    tags:        ['gameplay', 'progression'],
    installed:   true,
    downloadUrl: null,
  },
  {
    name:        'crop-prices',
    version:     '1.0.0',
    author:      'AllOne Garden',
    description: 'Dynamic market prices for every crop type — fluctuate daily with mean reversion.',
    tags:        ['economy', 'trade'],
    installed:   true,
    downloadUrl: null,
  },
  {
    name:        'server-motd',
    version:     '1.0.0',
    author:      'AllOne Garden',
    description: 'Message of the Day shown to players on connect. Admins can update it in-game.',
    tags:        ['admin', 'social'],
    installed:   true,
    downloadUrl: null,
  },
  {
    name:        'leaderboard',
    version:     '1.0.0',
    author:      'AllOne Garden',
    description: 'Live top-10 leaderboards for coins, level, and crops harvested. Updates each in-game day.',
    tags:        ['social', 'gameplay'],
    installed:   true,
    downloadUrl: null,
  },
  {
    name:        'seasons',
    version:     '1.0.0',
    author:      'AllOne Garden',
    description: '4-season calendar (Spring/Summer/Autumn/Winter, 28 days each). Bonus and penalty yields per crop.',
    tags:        ['gameplay', 'weather'],
    installed:   true,
    downloadUrl: null,
  },
];

// ── Tag badge ─────────────────────────────────────────────────────────────────

const TAG_COLORS = {
  weather:      '#e3f2fd',
  gameplay:     '#e8f5e9',
  progression:  '#fff8e1',
  analytics:    '#f3e5f5',
  social:       '#fce4ec',
  webrtc:       '#e0f7fa',
  customisation:'#fff3e0',
  ai:           '#e8eaf6',
  premium:      '#fff9c4',
  ui:           '#f1f8e9',
  economy:      '#fff3e0',
  trade:        '#e8f5e9',
  admin:        '#fce4ec',
};

function TagBadge({ tag }) {
  return (
    <span style={{
      padding: '0.15rem 0.5rem', borderRadius: '10px',
      background: TAG_COLORS[tag] || '#f5f5f5',
      fontSize: '0.72rem', fontWeight: '600', color: '#555',
    }}>
      {tag}
    </span>
  );
}

// ── Plugin card ───────────────────────────────────────────────────────────────

function PluginCard({ plugin, isInstalled, isAdmin, busy, onInstall, onUnload, error }) {
  const { t } = useTranslation();
  const tags    = plugin.tags || [];
  const canInstall = isAdmin && !isInstalled && !!plugin.downloadUrl;
  const canUnload  = isAdmin && isInstalled;

  return (
    <div style={{
      ...styles.card,
      borderLeft: isInstalled ? '4px solid #4caf50' : '4px solid transparent',
    }}>
      <div style={styles.cardHeader}>
        <div>
          <strong style={{ fontSize: '1rem', color: '#2e7d32' }}>{plugin.name}</strong>
          <span style={{ color: '#aaa', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
            v{plugin.version}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isInstalled && <span style={styles.badgeInstalled}>{t('marketplace.badge_installed', { defaultValue: '✓ Installed' })}</span>}
          {!isInstalled && <span style={styles.badgeFree}>{t('marketplace.badge_free', { defaultValue: 'Free' })}</span>}

          {canInstall && (
            <button
              style={{ ...styles.actionBtn, ...(busy ? styles.actionBtnBusy : {}) }}
              onClick={() => onInstall(plugin.name)}
              disabled={busy}
            >
              {busy ? t('marketplace.installing', { defaultValue: '⏳ Installing…' }) : t('marketplace.install', { defaultValue: '⬇ Install' })}
            </button>
          )}
          {canUnload && (
            <button
              style={{ ...styles.actionBtn, ...styles.actionBtnDanger, ...(busy ? styles.actionBtnBusy : {}) }}
              onClick={() => onUnload(plugin.name)}
              disabled={busy}
            >
              {busy ? t('marketplace.unloading', { defaultValue: '⏳ Unloading…' }) : t('marketplace.unload', { defaultValue: '✕ Unload' })}
            </button>
          )}
        </div>
      </div>

      <p style={styles.desc}>{plugin.description}</p>

      {error && (
        <p style={{ color: '#c62828', fontSize: '0.8rem', margin: '0.25rem 0 0.5rem' }}>
          ⚠ {error}
        </p>
      )}

      <div style={styles.cardFooter}>
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {tags.map((t) => <TagBadge key={t} tag={t} />)}
        </div>
        {plugin.author && (
          <span style={{ fontSize: '0.75rem', color: '#aaa' }}>
            {t('marketplace.by_author', { author: plugin.author, defaultValue: 'by {{author}}' })}
            {plugin.license ? ` · ${plugin.license}` : ''}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function PluginMarketplace({ user, onClose, embedded = false }) {
  const { t } = useTranslation();
  const isAdmin = user?.isAdmin || false;

  const [tab,       setTab]       = useState('installed');
  const [installed, setInstalled] = useState([]);
  const [catalogue, setCatalogue] = useState(CATALOGUE_FALLBACK);
  const [loading,   setLoading]   = useState(false);
  // Map: pluginName -> 'installing' | 'unloading'
  const [busy,      setBusy]      = useState({});
  // Map: pluginName -> error string
  const [errors,    setErrors]    = useState({});

  const loadInstalled = useCallback(() => {
    api.get('/api/plugins')
      .then(setInstalled)
      .catch(() => setInstalled([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    if (tab === 'installed') {
      api.get('/api/plugins')
        .then(setInstalled)
        .catch(() => setInstalled([]))
        .finally(() => setLoading(false));
    } else {
      api.get('/api/plugins/registry')
        .then((data) => setCatalogue(Array.isArray(data) ? data : CATALOGUE_FALLBACK))
        .catch(() => setCatalogue(CATALOGUE_FALLBACK))
        .finally(() => setLoading(false));
    }
  }, [tab]);

  const handleInstall = useCallback(async (name) => {
    setBusy((b) => ({ ...b, [name]: 'installing' }));
    setErrors((e) => { const next = { ...e }; delete next[name]; return next; });
    try {
      await api.post(`/api/plugins/${name}/install`, {});
      loadInstalled();
      // Mark as installed in catalogue
      setCatalogue((c) => c.map((p) => p.name === name ? { ...p, installed: true } : p));
    } catch (err) {
      setErrors((e) => ({ ...e, [name]: err.message }));
    } finally {
      setBusy((b) => { const next = { ...b }; delete next[name]; return next; });
    }
  }, [loadInstalled]);

  const handleUnload = useCallback(async (name) => {
    setBusy((b) => ({ ...b, [name]: 'unloading' }));
    setErrors((e) => { const next = { ...e }; delete next[name]; return next; });
    try {
      await api.post(`/api/plugins/${name}/unload`, {});
      setInstalled((prev) => prev.filter((p) => p.name !== name));
    } catch (err) {
      setErrors((e) => ({ ...e, [name]: err.message }));
    } finally {
      setBusy((b) => { const next = { ...b }; delete next[name]; return next; });
    }
  }, []);

  const installedNames = new Set(installed.map((p) => p.name));

  const [filter, setFilter] = useState('');
  const filteredCatalogue = catalogue.filter((p) =>
    !filter ||
    p.name.toLowerCase().includes(filter.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(filter.toLowerCase()) ||
    (p.tags || []).some((t) => t.toLowerCase().includes(filter.toLowerCase()))
  );

  const shellStyle = embedded ? styles.pageShell : styles.overlay;
  const containerStyle = embedded ? styles.pageContainer : styles.modal;
  const handleShellClick = embedded ? undefined : (e) => e.target === e.currentTarget && onClose();

  return (
    <div style={shellStyle} onClick={handleShellClick}>
      <div style={containerStyle}>
        {/* Header */}
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{t('marketplace.modal_title', { defaultValue: '🔌 Plugin Marketplace' })}</h2>
          {!embedded && <button style={styles.closeBtn} onClick={onClose}>✕</button>}
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          {['installed', 'community'].map((tabKey) => (
            <button
              key={tabKey}
              style={{ ...styles.tab, ...(tab === tabKey ? styles.tabActive : {}) }}
              onClick={() => setTab(tabKey)}
            >
              {tabKey === 'installed'
                ? t('marketplace.tab_installed', { count: installed.length, defaultValue: '✓ Installed ({{count}})' })
                : t('marketplace.tab_community', { defaultValue: '🌐 Community' })}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={styles.body}>

          {/* Installed tab */}
          {tab === 'installed' && (
            loading ? (
              <div style={styles.empty}>{t('marketplace.loading', { defaultValue: 'Loading…' })}</div>
            ) : installed.length === 0 ? (
              <div style={styles.empty}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔌</div>
                {t('marketplace.empty_installed', { defaultValue: 'No plugins installed on this server yet.' })}
                <br />
                <span style={{ fontSize: '0.85rem', color: '#aaa' }}>
                  {isAdmin
                    ? t('marketplace.empty_installed_admin', { defaultValue: 'Browse the Community tab to install plugins.' })
                    : t('marketplace.empty_installed_user', { defaultValue: 'Ask your server admin to install plugins from the Community tab.' })}
                </span>
              </div>
            ) : (
              <div style={styles.grid}>
                {installed.map((p) => (
                  <PluginCard
                    key={p.name}
                    plugin={p}
                    isInstalled
                    isAdmin={isAdmin}
                    busy={!!busy[p.name]}
                    error={errors[p.name]}
                    onUnload={handleUnload}
                    onInstall={handleInstall}
                  />
                ))}
              </div>
            )
          )}

          {/* Community tab */}
          {tab === 'community' && (
            <>
              <input
                style={styles.search}
                type="text"
                placeholder={t('marketplace.search_placeholder', { defaultValue: 'Search plugins…' })}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              {loading ? (
                <div style={styles.empty}>{t('marketplace.loading_registry', { defaultValue: 'Loading registry…' })}</div>
              ) : (
                <div style={styles.grid}>
                  {filteredCatalogue.map((p) => (
                    <PluginCard
                      key={p.name}
                      plugin={p}
                      isInstalled={installedNames.has(p.name) || !!p.installed}
                      isAdmin={isAdmin}
                      busy={!!busy[p.name]}
                      error={errors[p.name]}
                      onInstall={handleInstall}
                      onUnload={handleUnload}
                    />
                  ))}
                </div>
              )}
              <div style={styles.helpNote}>
                {t('marketplace.help_note', {
                  defaultValue:
                    'How to install: Admins can click Install above (requires downloadUrl in registry), or manually place a plugin folder in plugins/community/ and restart the server. All plugins run in a sandboxed VM with limited API access.',
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 500, padding: '1rem',
  },
  modal: {
    background: 'white', borderRadius: '14px',
    width: '100%', maxWidth: '700px', maxHeight: '85vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
  },
  pageShell: {
    minHeight: 'calc(100vh - 58px)',
    padding: '1rem',
    display: 'block',
  },
  pageContainer: {
    background: 'white',
    borderRadius: '14px',
    width: '100%',
    maxWidth: '980px',
    margin: '0 auto',
    minHeight: 'calc(100vh - 110px)',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 10px 32px rgba(0,0,0,0.12)',
  },
  modalHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '1.25rem 1.5rem', borderBottom: '1px solid #eee',
  },
  modalTitle: { margin: 0, color: '#2e7d32', fontSize: '1.3rem' },
  closeBtn: {
    border: 'none', background: 'none', fontSize: '1.2rem',
    cursor: 'pointer', color: '#aaa',
  },
  tabs: {
    display: 'flex', borderBottom: '1px solid #eee',
    padding: '0 1.5rem', gap: '0.5rem',
  },
  tab: {
    padding: '0.6rem 1rem', border: 'none', background: 'none',
    cursor: 'pointer', fontWeight: '600', color: '#888',
    borderBottom: '3px solid transparent', fontSize: '0.95rem',
  },
  tabActive:  { color: '#4caf50', borderBottomColor: '#4caf50' },
  body:       { padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 },
  search: {
    width: '100%', padding: '0.6rem 1rem',
    border: '1.5px solid #ddd', borderRadius: '8px',
    fontSize: '0.95rem', marginBottom: '1rem', outline: 'none',
    boxSizing: 'border-box',
  },
  grid:  { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  card: {
    border: '1px solid #eee', borderRadius: '10px',
    padding: '1rem 1.1rem', background: '#fafafa',
  },
  cardHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.5rem',
  },
  desc: { margin: '0 0 0.6rem', fontSize: '0.88rem', color: '#555', lineHeight: '1.45' },
  cardFooter: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    flexWrap: 'wrap', gap: '0.4rem',
  },
  badgeInstalled: {
    background: '#e8f5e9', color: '#2e7d32',
    padding: '0.2rem 0.6rem', borderRadius: '12px',
    fontSize: '0.78rem', fontWeight: '700', whiteSpace: 'nowrap',
  },
  badgeFree: {
    background: '#f1f8e9', color: '#558b2f',
    padding: '0.2rem 0.6rem', borderRadius: '12px',
    fontSize: '0.78rem', fontWeight: '700',
  },
  actionBtn: {
    padding: '0.25rem 0.7rem', borderRadius: '8px',
    border: '1.5px solid #4caf50', background: '#f1f8e9',
    color: '#2e7d32', fontSize: '0.78rem', fontWeight: '700',
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  actionBtnDanger: {
    border: '1.5px solid #e57373', background: '#fce4ec', color: '#c62828',
  },
  actionBtnBusy: {
    opacity: 0.6, cursor: 'not-allowed',
  },
  empty: {
    color: '#aaa', textAlign: 'center', padding: '2.5rem 1rem',
    fontSize: '0.95rem', lineHeight: '1.8',
  },
  helpNote: {
    marginTop: '1rem', padding: '0.75rem 1rem',
    background: '#f1f8e9', borderRadius: '8px',
    fontSize: '0.83rem', color: '#555', lineHeight: '1.6',
  },
};

export default PluginMarketplace;
