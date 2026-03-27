import React, { useState, useEffect, useCallback } from 'react';
import api from '../hooks/useApi';

function StatCard({ label, value, sub, color = '#4caf50' }) {
  return (
    <div style={{ ...styles.statCard, borderTop: `4px solid ${color}` }}>
      <div style={{ ...styles.statValue, color }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
      {sub && <div style={styles.statSub}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <h3 style={styles.sectionTitle}>{title}</h3>
      {children}
    </div>
  );
}

function AdminPanel({ onClose }) {
  const [stats,   setStats]   = useState(null);
  const [players, setPlayers] = useState([]);
  const [peers,   setPeers]   = useState([]);
  const [tab,     setTab]     = useState('overview');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, p, pe] = await Promise.all([
        api.get('/api/admin/stats'),
        api.get('/api/admin/players'),
        api.get('/api/admin/peers'),
      ]);
      setStats(s);
      setPlayers(p.players || []);
      setPeers(pe);
    } catch (err) {
      setError(err.message || 'Could not load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const TABS = ['overview', 'players', 'plugins', 'peers'];

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>⚙️ Admin Panel</h2>
          <button style={styles.refreshBtn} onClick={load} disabled={loading}>↻ Refresh</button>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t}
              style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
              onClick={() => setTab(t)}
            >
              {{ overview: '📊 Overview', players: '👥 Players', plugins: '🔌 Plugins', peers: '🌍 Peers' }[t]}
            </button>
          ))}
        </div>

        <div style={styles.body}>
          {error  && <div style={styles.error}>{error}</div>}
          {loading && <div style={styles.empty}>Loading…</div>}

          {/* ── Overview ──────────────────────────────────────────────────── */}
          {tab === 'overview' && stats && (
            <>
              <Section title="Server">
                <div style={styles.statGrid}>
                  <StatCard label="Uptime"     value={stats.server.uptimeFormatted} color="#4caf50" />
                  <StatCard label="Node.js"    value={stats.server.nodeVersion}     color="#388e3c" />
                  <StatCard label="Heap used"  value={`${stats.memory.heapUsedMB} MB`}
                            sub={`of ${stats.memory.heapTotalMB} MB`} color="#8bc34a" />
                  <StatCard label="RSS"        value={`${stats.memory.rssMB} MB`}   color="#cddc39" />
                  <StatCard label="CPU load"   value={stats.cpu.load1}
                            sub={`5m: ${stats.cpu.load5} · ${stats.cpu.cores} cores`} color="#ff9800" />
                  <StatCard label="Platform"   value={`${stats.server.platform}/${stats.server.arch}`} color="#9e9e9e" />
                </div>
              </Section>

              {stats.database && (
                <Section title="Database">
                  <div style={styles.statGrid}>
                    <StatCard label="Players"         value={stats.database.totalUsers}    color="#4caf50" />
                    <StatCard label="Gardens"         value={stats.database.totalGardens}  color="#8bc34a" />
                    <StatCard label="Active listings" value={stats.database.activeListings} color="#ff9800" />
                    <StatCard label="Chat messages"   value={stats.database.chatMessages}  color="#2196f3" />
                  </div>
                </Section>
              )}

              <Section title="Plugins">
                <div style={{ color: stats.plugins.length ? '#2e7d32' : '#aaa', fontSize: '0.9rem' }}>
                  {stats.plugins.length === 0
                    ? 'No plugins loaded'
                    : stats.plugins.map((p) => (
                      <div key={p.name} style={styles.pluginRow}>
                        <span style={styles.pluginName}>{p.name}</span>
                        <span style={styles.pluginVersion}>v{p.version}</span>
                        <span style={styles.pluginHash}>{p.hash?.slice(0, 8)}</span>
                      </div>
                    ))
                  }
                </div>
              </Section>
            </>
          )}

          {/* ── Players ───────────────────────────────────────────────────── */}
          {tab === 'players' && (
            <div style={{ overflowX: 'auto' }}>
              {players.length === 0 ? (
                <div style={styles.empty}>No players found</div>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {['ID', 'Username', 'Level', 'XP', 'Coins', 'Plants', 'Last login'].map((h) => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <td style={styles.td}>{p.id}</td>
                        <td style={{ ...styles.td, fontWeight: '600', color: '#2e7d32' }}>{p.username}</td>
                        <td style={styles.td}>⭐ {p.level}</td>
                        <td style={styles.td}>{p.xp}</td>
                        <td style={styles.td}>🪙 {p.coins}</td>
                        <td style={styles.td}>🌿 {p.plants_grown}</td>
                        <td style={{ ...styles.td, fontSize: '0.8rem', color: '#aaa' }}>
                          {p.last_login ? new Date(p.last_login).toLocaleDateString() : 'Never'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Plugins ───────────────────────────────────────────────────── */}
          {tab === 'plugins' && stats && (
            stats.plugins.length === 0 ? (
              <div style={styles.empty}>No plugins loaded on this server</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {stats.plugins.map((p) => (
                  <div key={p.name} style={styles.pluginCard}>
                    <div>
                      <strong style={{ color: '#2e7d32' }}>{p.name}</strong>
                      <span style={{ color: '#aaa', marginLeft: '0.5rem', fontSize: '0.85rem' }}>v{p.version}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#aaa', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                      SHA-256: {p.hash}
                    </div>
                    <button
                      style={styles.unloadBtn}
                      onClick={async () => {
                        await api.post(`/api/admin/plugins/${p.name}/reload`);
                        load();
                      }}
                    >
                      Unload
                    </button>
                  </div>
                ))}
              </div>
            )
          )}

          {/* ── Peers ─────────────────────────────────────────────────────── */}
          {tab === 'peers' && (
            peers.length === 0 ? (
              <div style={styles.empty}>
                No federation peers known yet.
                <br />
                <span style={{ fontSize: '0.85rem' }}>Enable P2P_ENABLED=true to join the global network.</span>
              </div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    {['Server', 'Peer ID', 'Players', 'Last seen'].map((h) => (
                      <th key={h} style={styles.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {peers.map((p) => (
                    <tr key={p.peer_id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ ...styles.td, fontWeight: '600', color: '#2e7d32' }}>{p.server_name}</td>
                      <td style={{ ...styles.td, fontFamily: 'monospace', fontSize: '0.8rem', color: '#aaa' }}>
                        {p.peer_id.slice(0, 16)}…
                      </td>
                      <td style={styles.td}>👥 {p.player_count}</td>
                      <td style={{ ...styles.td, fontSize: '0.8rem', color: '#aaa' }}>
                        {new Date(p.last_seen).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 600, padding: '1rem',
  },
  modal: {
    background: 'white', borderRadius: '14px',
    width: '100%', maxWidth: '860px', maxHeight: '88vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '1.25rem 1.5rem', borderBottom: '1px solid #eee',
    background: '#f9fbe7',
  },
  title: { margin: 0, color: '#2e7d32', fontSize: '1.3rem', flex: 1 },
  refreshBtn: {
    padding: '0.35rem 0.9rem', border: '1.5px solid #4caf50',
    background: 'white', borderRadius: '6px', cursor: 'pointer',
    fontWeight: '600', color: '#4caf50', fontSize: '0.85rem',
  },
  closeBtn: {
    border: 'none', background: 'none',
    fontSize: '1.2rem', cursor: 'pointer', color: '#aaa',
  },
  tabs: {
    display: 'flex', borderBottom: '1px solid #eee',
    padding: '0 1.5rem', gap: '0.25rem',
  },
  tab: {
    padding: '0.6rem 0.9rem', border: 'none', background: 'none',
    cursor: 'pointer', fontWeight: '600', color: '#888',
    borderBottom: '3px solid transparent', fontSize: '0.88rem',
    whiteSpace: 'nowrap',
  },
  tabActive: { color: '#4caf50', borderBottomColor: '#4caf50' },
  body: { padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 },
  error: {
    background: '#ffebee', color: '#c62828',
    padding: '0.7rem 1rem', borderRadius: '6px',
    marginBottom: '1rem', fontSize: '0.9rem',
  },
  empty: {
    color: '#aaa', textAlign: 'center',
    padding: '2.5rem 1rem', fontSize: '0.95rem', lineHeight: '1.8',
  },
  section: { marginBottom: '1.5rem' },
  sectionTitle: {
    fontSize: '0.85rem', fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    color: '#888', marginBottom: '0.75rem',
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '0.75rem',
  },
  statCard: {
    background: '#fafafa', borderRadius: '10px',
    padding: '0.9rem 1rem', border: '1px solid #eee',
  },
  statValue: { fontSize: '1.3rem', fontWeight: '700', lineHeight: 1 },
  statLabel: { fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' },
  statSub:   { fontSize: '0.72rem', color: '#aaa', marginTop: '0.1rem' },
  pluginRow: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '0.4rem 0', borderBottom: '1px solid #f5f5f5',
  },
  pluginName:    { fontWeight: '600', color: '#2e7d32', fontSize: '0.9rem' },
  pluginVersion: { color: '#aaa', fontSize: '0.8rem' },
  pluginHash:    { fontFamily: 'monospace', color: '#bbb', fontSize: '0.78rem', marginLeft: 'auto' },
  pluginCard: {
    background: '#fafafa', border: '1px solid #eee',
    borderRadius: '10px', padding: '0.9rem 1rem',
    position: 'relative',
  },
  unloadBtn: {
    position: 'absolute', top: '0.9rem', right: '1rem',
    padding: '0.3rem 0.7rem', border: '1px solid #ef9a9a',
    background: 'white', color: '#e53935', borderRadius: '6px',
    cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' },
  th: {
    textAlign: 'left', padding: '0.6rem 0.75rem',
    background: '#f9fbe7', color: '#558b2f',
    fontWeight: '700', fontSize: '0.78rem', textTransform: 'uppercase',
  },
  td: { padding: '0.55rem 0.75rem', verticalAlign: 'middle' },
};

export default AdminPanel;
