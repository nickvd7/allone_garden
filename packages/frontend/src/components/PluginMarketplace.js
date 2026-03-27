import React, { useState, useEffect } from 'react';
import api from '../hooks/useApi';

/**
 * Plugin Marketplace
 *
 * Shows plugins currently installed on the connected server.
 * In the future this will also list community plugins available for download.
 */

// Hard-coded community plugin catalogue (in a real deployment this comes from
// a decentralised package registry served by trusted community mirrors)
const CATALOGUE = [
  {
    id: 'weather-forecast',
    name: 'weather-forecast',
    version: '1.0.0',
    author: 'AllOne Community',
    description: 'Shows a 5-day weather forecast for your garden.',
    license: 'MIT',
    tags: ['weather', 'gameplay'],
    free: true,
  },
  {
    id: 'achievements',
    name: 'achievements',
    version: '0.9.0',
    author: 'AllOne Community',
    description: 'Unlockable badges for planting milestones, trade records, and more.',
    license: 'MIT',
    tags: ['progression', 'gameplay'],
    free: true,
  },
  {
    id: 'garden-analytics',
    name: 'garden-analytics',
    version: '1.1.0',
    author: 'AllOne Community',
    description: 'Graphs your harvest rate, XP gains, and coin flow over time.',
    license: 'MIT',
    tags: ['analytics'],
    free: true,
  },
  {
    id: 'voice-chat',
    name: 'voice-chat',
    version: '0.5.0',
    author: 'AllOne Community',
    description: 'WebRTC voice chat for players on the same server.',
    license: 'MIT',
    tags: ['social', 'webrtc'],
    free: true,
  },
  {
    id: 'custom-plants',
    name: 'custom-plants',
    version: '2.0.0',
    author: 'AllOne Community',
    description: 'Add your own plant types with custom growth stages and artwork.',
    license: 'MIT',
    tags: ['customisation'],
    free: true,
  },
  {
    id: 'ai-assistant',
    name: 'ai-assistant',
    version: '1.0.0',
    author: 'AllOne Official',
    description: 'An AI garden advisor that suggests what to plant and when to water.',
    license: 'Proprietary',
    tags: ['ai', 'premium'],
    free: false,
    price: '🪙 99 / month',
  },
];

function TagBadge({ tag }) {
  const tagColors = {
    weather: '#e3f2fd',
    gameplay: '#e8f5e9',
    progression: '#fff8e1',
    analytics: '#f3e5f5',
    social: '#fce4ec',
    webrtc: '#e0f7fa',
    customisation: '#fff3e0',
    ai: '#e8eaf6',
    premium: '#fff9c4',
  };
  return (
    <span style={{
      padding: '0.15rem 0.5rem', borderRadius: '10px',
      background: tagColors[tag] || '#f5f5f5',
      fontSize: '0.72rem', fontWeight: '600', color: '#555',
    }}>
      {tag}
    </span>
  );
}

function PluginCard({ plugin, isInstalled }) {
  return (
    <div style={{
      ...styles.card,
      borderLeft: isInstalled ? '4px solid #4caf50' : '4px solid transparent',
    }}>
      <div style={styles.cardHeader}>
        <div>
          <strong style={{ fontSize: '1rem', color: '#2e7d32' }}>{plugin.name}</strong>
          <span style={{ color: '#aaa', fontSize: '0.8rem', marginLeft: '0.5rem' }}>v{plugin.version}</span>
        </div>
        {isInstalled ? (
          <span style={styles.badgeInstalled}>✓ Installed</span>
        ) : plugin.free ? (
          <span style={styles.badgeFree}>Free</span>
        ) : (
          <span style={styles.badgePaid}>{plugin.price}</span>
        )}
      </div>

      <p style={styles.desc}>{plugin.description}</p>

      <div style={styles.cardFooter}>
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {plugin.tags.map((t) => <TagBadge key={t} tag={t} />)}
        </div>
        <span style={{ fontSize: '0.75rem', color: '#aaa' }}>
          by {plugin.author} · {plugin.license}
        </span>
      </div>
    </div>
  );
}

function PluginMarketplace({ onClose }) {
  const [tab,       setTab]       = useState('installed');
  const [installed, setInstalled] = useState([]);
  const [catalogue, setCatalogue] = useState(CATALOGUE);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState('');

  useEffect(() => {
    setLoading(true);
    if (tab === 'installed') {
      api.get('/api/plugins')
        .then(setInstalled)
        .catch(() => setInstalled([]))
        .finally(() => setLoading(false));
    } else {
      api.get('/api/plugins/registry')
        .then((data) => setCatalogue(Array.isArray(data) ? data : CATALOGUE))
        .catch(() => setCatalogue(CATALOGUE))   // fall back to bundled list
        .finally(() => setLoading(false));
    }
  }, [tab]);

  const installedNames = new Set(installed.map((p) => p.name));

  const filteredCatalogue = catalogue.filter((p) =>
    !filter ||
    p.name.includes(filter.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(filter.toLowerCase()) ||
    (p.tags || []).some((t) => t.includes(filter.toLowerCase()))
  );

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>🔌 Plugin Marketplace</h2>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.tabs}>
          {['installed', 'community'].map((t) => (
            <button
              key={t}
              style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
              onClick={() => setTab(t)}
            >
              {t === 'installed' ? `✓ Installed (${installed.length})` : '🌐 Community'}
            </button>
          ))}
        </div>

        <div style={styles.body}>
          {/* Installed tab */}
          {tab === 'installed' && (
            loading ? (
              <div style={styles.empty}>Loading…</div>
            ) : installed.length === 0 ? (
              <div style={styles.empty}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔌</div>
                No plugins installed on this server yet.
                <br />
                <span style={{ fontSize: '0.85rem', color: '#aaa' }}>
                  Ask your server admin to install community plugins from the directory.
                </span>
              </div>
            ) : (
              <div style={styles.grid}>
                {installed.map((p) => <PluginCard key={p.name} plugin={p} isInstalled />)}
              </div>
            )
          )}

          {/* Community tab */}
          {tab === 'community' && (
            <>
              <input
                style={styles.search}
                type="text"
                placeholder="Search plugins…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <div style={styles.grid}>
                {filteredCatalogue.map((p) => (
                  <PluginCard
                    key={p.id}
                    plugin={p}
                    isInstalled={installedNames.has(p.name)}
                  />
                ))}
              </div>
              <div style={styles.helpNote}>
                <strong>How to install:</strong> Place plugin folder in{' '}
                <code>plugins/community/</code> on your server, then restart.
                All plugins run in a sandboxed environment with limited API access.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
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
    width: '100%', maxWidth: '700px', maxHeight: '85vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
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
  tabActive: { color: '#4caf50', borderBottomColor: '#4caf50' },
  body: { padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 },
  search: {
    width: '100%', padding: '0.6rem 1rem',
    border: '1.5px solid #ddd', borderRadius: '8px',
    fontSize: '0.95rem', marginBottom: '1rem', outline: 'none',
  },
  grid: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  card: {
    border: '1px solid #eee', borderRadius: '10px',
    padding: '1rem 1.1rem', background: '#fafafa',
    transition: 'box-shadow 0.15s',
  },
  cardHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: '0.4rem',
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
  badgePaid: {
    background: '#fff9c4', color: '#f57f17',
    padding: '0.2rem 0.6rem', borderRadius: '12px',
    fontSize: '0.78rem', fontWeight: '700',
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
