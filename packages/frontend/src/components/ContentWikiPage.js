/**
 * ContentWikiPage — public game-content encyclopedia.
 *
 * Accessible without login at /content-wiki.
 * Logged-in users can:
 *   • Propose new content items (plants, structures, tools, weather).
 *   • See their own proposals and their current status.
 *   • Re-submit a proposal that an admin has sent back for revision.
 *
 * Proposals go to an admin approval queue before going live.
 */
import React, { useState, useEffect, useCallback } from 'react';
import api from '../hooks/useApi';
import { BLANK, ItemForm, formStyles } from './ContentForms';

const BACKEND_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function getStoredToken() {
  try { return localStorage.getItem('garden_token') || null; } catch { return null; }
}

// ── Content type tabs ─────────────────────────────────────────────────────────
const CONTENT_TABS = [
  { id: 'plants',     label: '🌱 Plants' },
  { id: 'structures', label: '🏗️ Structures' },
  { id: 'tools',      label: '🔧 Tools' },
  { id: 'weather',    label: '☁️ Weather' },
];

const ID_FIELD = { plants: 'slug', structures: 'id', tools: 'id', weather: 'id' };

const STATUS_META = {
  pending:            { icon: '⏳', label: 'Pending review',     color: '#90caf9' },
  revision_requested: { icon: '🔄', label: 'Needs revision',     color: '#ffcc02' },
  approved:           { icon: '✅', label: 'Approved & live',    color: '#81c784' },
  rejected:           { icon: '❌', label: 'Rejected',           color: '#ef9a9a' },
};

// ── Single content card (browse view) ─────────────────────────────────────────
function ContentCard({ item, type }) {
  const emoji = item.harvestEmoji || item.emoji || '❓';
  return (
    <div style={S.card}>
      <div style={S.cardEmoji}>{emoji}</div>
      <div style={S.cardName}>{item.name}</div>
      {type === 'plants' && (
        <div style={S.cardMeta}>
          <span style={S.badge}>🌱 {item.growthDays}d</span>
          <span style={S.badge}>🪙 {item.baseCoins}</span>
          {(item.companionGood || []).length > 0 && (
            <span style={{ ...S.badge, background: 'rgba(76,175,80,0.25)', color: '#a5d6a7' }}>
              💚 {item.companionGood.map((c) => c.slug).join(', ')}
            </span>
          )}
          {(item.companionBad || []).length > 0 && (
            <span style={{ ...S.badge, background: 'rgba(198,40,40,0.2)', color: '#ef9a9a' }}>
              ⚠️ {item.companionBad.map((c) => c.slug).join(', ')}
            </span>
          )}
        </div>
      )}
      {type === 'structures' && (
        <div style={S.cardMeta}>
          <span style={S.badge}>🔨 {item.buildCost} coins</span>
          {item.chargesPerDay > 0 && <span style={S.badge}>⚡ {item.chargesPerDay}/day</span>}
          {item.description && <div style={S.cardDesc}>{item.description}</div>}
        </div>
      )}
      {type === 'tools' && item.description && (
        <div style={S.cardDesc}>{item.description}</div>
      )}
      {type === 'weather' && (
        <div style={S.cardMeta}>
          {item.waterBonus > 0 && <span style={S.badge}>💧 +{item.waterBonus}</span>}
          <span style={S.badge}>🐛 {Math.round(item.pestChance * 100)}%</span>
          {item.stormRollback && <span style={{ ...S.badge, color: '#ef9a9a' }}>⚠️ rollback</span>}
        </div>
      )}
    </div>
  );
}

// ── Proposal modal (new proposal) ─────────────────────────────────────────────
function ProposalModal({ type, onClose, onSuccess }) {
  const [item,   setItem]   = useState(() => BLANK[type]());
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [ok,     setOk]     = useState(true);
  const idField = ID_FIELD[type];

  const handleSubmit = async () => {
    if (!item[idField]) { setStatus(`${idField} is required`); setOk(false); return; }
    if (!item.name)     { setStatus('Name is required');        setOk(false); return; }
    setSaving(true); setStatus('');
    try {
      await api.post('/api/content/propose', { type, item });
      setStatus('✅ Proposal submitted! Admins will review it shortly.');
      setOk(true);
      setTimeout(onSuccess, 1800);
    } catch (err) {
      setStatus(`❌ Failed: ${err.message}`);
      setOk(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.modalHeader}>
          <h3 style={{ margin: 0, color: '#a5d6a7' }}>✏️ Propose new {type.slice(0, -1)}</h3>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.modalBody}>
          <div style={S.modalHint}>
            Fill in the details below. Your proposal will be reviewed by an admin before it goes live.
          </div>
          <ItemForm type={type} item={item} onChange={setItem} />
          {status && <div style={S.formStatus(ok)}>{status}</div>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button style={formStyles.btn('save')} onClick={handleSubmit} disabled={saving}>
              {saving ? 'Submitting…' : '📬 Submit proposal'}
            </button>
            <button style={formStyles.btn()} onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Re-submit modal (after revision_requested) ────────────────────────────────
function ResubmitModal({ proposal, onClose, onSuccess }) {
  const [item,   setItem]   = useState(() => ({ ...proposal.item }));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [ok,     setOk]     = useState(true);

  const handleSubmit = async () => {
    setSaving(true); setStatus('');
    try {
      await api.post(`/api/content/proposals/${proposal.id}/resubmit`, { item });
      setStatus('✅ Re-submitted! Admins will review your changes.');
      setOk(true);
      setTimeout(onSuccess, 1800);
    } catch (err) {
      setStatus(`❌ ${err.message}`);
      setOk(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.modalHeader}>
          <h3 style={{ margin: 0, color: '#ffcc02' }}>🔄 Re-submit proposal</h3>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.modalBody}>
          {/* Admin note */}
          {proposal.note && (
            <div style={S.revisionNote}>
              <div style={{ fontWeight: '700', marginBottom: '0.3rem', color: '#ffcc02' }}>
                📝 Admin note:
              </div>
              <div style={{ color: '#f0f4e8' }}>{proposal.note}</div>
            </div>
          )}
          <div style={S.modalHint}>
            Apply the requested changes below, then re-submit.
          </div>
          <ItemForm type={proposal.type} item={item} onChange={setItem} />
          {status && <div style={S.formStatus(ok)}>{status}</div>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button style={formStyles.btn('save')} onClick={handleSubmit} disabled={saving}>
              {saving ? 'Submitting…' : '📬 Re-submit'}
            </button>
            <button style={formStyles.btn()} onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Single "My Proposal" card ─────────────────────────────────────────────────
function MyProposalCard({ proposal, onResubmit }) {
  const meta    = STATUS_META[proposal.status] || STATUS_META.pending;
  const emoji   = proposal.item?.harvestEmoji || proposal.item?.emoji || '❓';
  const idField = ID_FIELD[proposal.type] || 'id';
  const itemId  = proposal.item?.[idField] || '—';

  return (
    <div style={{ ...S.myCard, borderColor: meta.color + '55' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '1.8rem' }}>{emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: '700', color: '#f0f4e8' }}>{proposal.item?.name || itemId}</div>
          <div style={{ fontSize: '0.75rem', color: '#888' }}>
            {proposal.type} · {itemId}
            {proposal.revisionCount > 0 && (
              <span style={{ marginLeft: '0.5rem', color: '#ffcc02' }}>
                · revision #{proposal.revisionCount}
              </span>
            )}
          </div>
        </div>
        <div style={{ ...S.statusPill, color: meta.color, borderColor: meta.color + '66' }}>
          {meta.icon} {meta.label}
        </div>
      </div>

      {/* Admin note (shown for all statuses that have one) */}
      {proposal.note && (
        <div style={{ ...S.revisionNote, margin: '0.5rem 0' }}>
          <span style={{ fontWeight: '700', color: meta.color }}>
            {proposal.status === 'revision_requested' ? '📝 Admin asks: ' : '💬 Note: '}
          </span>
          {proposal.note}
        </div>
      )}

      <div style={{ fontSize: '0.72rem', color: '#555', marginTop: '0.4rem' }}>
        Submitted {new Date(proposal.createdAt).toLocaleDateString()}
        {proposal.reviewedAt && ` · Reviewed ${new Date(proposal.reviewedAt).toLocaleDateString()}`}
      </div>

      {/* Re-submit button for revision_requested */}
      {proposal.status === 'revision_requested' && (
        <button
          style={{ ...formStyles.btn('save'), marginTop: '0.75rem', width: '100%' }}
          onClick={() => onResubmit(proposal)}
        >
          🔄 Apply changes & re-submit
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function ContentWikiPage() {
  const [pageTab,    setPageTab]    = useState('browse');
  const [activeTab,  setActiveTab]  = useState('plants');
  const [search,     setSearch]     = useState('');
  const [content,    setContent]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);
  const [resubmitProposal, setResubmitProposal] = useState(null);
  const [toast,      setToast]      = useState('');
  const [darkMode,   setDarkMode]   = useState(
    () => { try { return localStorage.getItem('garden_dark') === 'true'; } catch { return false; } }
  );

  // "My Proposals" state
  const [myProposals,      setMyProposals]      = useState([]);
  const [myProposalsLoading, setMyProposalsLoading] = useState(false);
  const [myProposalsFilter, setMyProposalsFilter]   = useState('all');

  const token = getStoredToken();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    try { localStorage.setItem('garden_dark', String(darkMode)); } catch {}
  }, [darkMode]);

  // Load game content
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/content`)
      .then((r) => r.json())
      .then((data) => { setContent(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Load user's proposals whenever the Mine tab is opened
  const loadMyProposals = useCallback(async () => {
    if (!token) return;
    setMyProposalsLoading(true);
    try {
      const data = await api.get('/api/content/proposals/mine');
      setMyProposals(data.proposals || []);
    } catch {
      setMyProposals([]);
    } finally {
      setMyProposalsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (pageTab === 'mine') loadMyProposals();
  }, [pageTab, loadMyProposals]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const allTabItems   = content ? (content[activeTab] || []) : [];
  const searchLower   = search.trim().toLowerCase();
  const currentItems  = searchLower
    ? allTabItems.filter((item) =>
        (item.name  || '').toLowerCase().includes(searchLower) ||
        (item.slug  || item.id || '').toLowerCase().includes(searchLower) ||
        (item.description || '').toLowerCase().includes(searchLower)
      )
    : allTabItems;

  // Count of user proposals needing action
  const revisionCount = myProposals.filter((p) => p.status === 'revision_requested').length;

  // Filter "My Proposals" list
  const filteredMine = myProposalsFilter === 'all'
    ? myProposals
    : myProposals.filter((p) => p.status === myProposalsFilter);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #f1f8e9)', color: 'var(--text, #1b5e20)' }}>

      {/* ── Header ── */}
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <a href="/" style={S.backLink}>← 🌱 AllOne Garden</a>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>·</span>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700' }}>📖 Content Wiki</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {token && pageTab === 'browse' && (
            <button
              style={S.proposeBtn}
              onClick={() => setShowModal(true)}
              aria-label={`Propose ${activeTab.slice(0, -1)}`}
            >
              ✏️ Propose {activeTab.slice(0, -1)}
            </button>
          )}
          <button style={S.darkBtn} onClick={() => setDarkMode((d) => !d)} title="Toggle dark mode">
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* ── Intro ── */}
      <div style={S.intro}>
        <p style={{ margin: 0, fontSize: '0.95rem', color: 'rgba(255,255,255,0.8)' }}>
          Browse all plants, structures, tools and weather in the game.
          {token
            ? ' Logged in? Use the Propose button to suggest new content — admins will review it.'
            : ' Log in to propose new items.'}
        </p>
      </div>

      {/* ── Page-level tabs (Browse / My Proposals) ── */}
      <div style={S.pageTabs}>
        <button
          style={{ ...S.pageTab, ...(pageTab === 'browse' ? S.pageTabActive : {}) }}
          onClick={() => setPageTab('browse')}
        >
          📖 Browse
        </button>
        {token && (
          <button
            style={{ ...S.pageTab, ...(pageTab === 'mine' ? S.pageTabActive : {}) }}
            onClick={() => setPageTab('mine')}
          >
            📬 My Proposals
            {revisionCount > 0 && (
              <span style={S.revisionBadge}>{revisionCount}</span>
            )}
          </button>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          BROWSE TAB
      ═══════════════════════════════════════════════════════════════════════ */}
      {pageTab === 'browse' && (
        <>
          {/* Content type tabs */}
          <div style={S.tabs}>
            {CONTENT_TABS.map((t) => (
              <button
                key={t.id}
                style={{ ...S.tab, ...(activeTab === t.id ? S.tabActive : {}) }}
                onClick={() => { setActiveTab(t.id); setSearch(''); }}
              >
                {t.label} {content && <span style={S.tabCount}>({(content[t.id] || []).length})</span>}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div style={S.searchBar}>
            <input
              style={S.searchInput}
              type="text"
              placeholder={`Search ${activeTab}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search content"
            />
            {search && (
              <button style={S.searchClear} onClick={() => setSearch('')} title="Clear">✕</button>
            )}
            {content && search && (
              <span style={{ fontSize: '0.8rem', color: '#888', marginLeft: '0.5rem' }}>
                {currentItems.length} result{currentItems.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Content grid */}
          <div style={S.grid}>
            {loading ? (
              <div style={S.empty}>Loading…</div>
            ) : currentItems.length === 0 ? (
              <div style={S.empty}>No {activeTab} defined yet.</div>
            ) : (
              currentItems.map((item) => (
                <ContentCard key={item.slug || item.id} item={item} type={activeTab} />
              ))
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MY PROPOSALS TAB
      ═══════════════════════════════════════════════════════════════════════ */}
      {pageTab === 'mine' && token && (
        <div style={S.mineWrap}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: '#888', marginRight: '0.25rem' }}>Show:</span>
            {[
              { key: 'all',                label: 'All' },
              { key: 'pending',            label: '⏳ Pending' },
              { key: 'revision_requested', label: '🔄 Needs revision' },
              { key: 'approved',           label: '✅ Approved' },
              { key: 'rejected',           label: '❌ Rejected' },
            ].map(({ key, label }) => (
              <button
                key={key}
                style={{
                  ...S.filterBtn,
                  ...(myProposalsFilter === key ? S.filterBtnActive : {}),
                }}
                onClick={() => setMyProposalsFilter(key)}
              >
                {label}
              </button>
            ))}
            <button
              style={{ ...S.filterBtn, marginLeft: 'auto' }}
              onClick={loadMyProposals}
              title="Refresh"
            >
              🔃 Refresh
            </button>
          </div>

          {myProposalsLoading ? (
            <div style={{ color: '#888', padding: '2rem', textAlign: 'center' }}>Loading…</div>
          ) : filteredMine.length === 0 ? (
            <div style={{ color: '#888', padding: '2rem', textAlign: 'center' }}>
              {myProposals.length === 0
                ? 'You haven\'t submitted any proposals yet.'
                : 'No proposals match this filter.'}
            </div>
          ) : (
            <div style={S.mineGrid}>
              {filteredMine.map((p) => (
                <MyProposalCard
                  key={p.id}
                  proposal={p}
                  onResubmit={(proposal) => setResubmitProposal(proposal)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Proposal modal (new) ── */}
      {showModal && token && (
        <ProposalModal
          type={activeTab}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            showToast('📬 Proposal submitted — thanks! Admins will review it.');
          }}
        />
      )}

      {/* ── Re-submit modal ── */}
      {resubmitProposal && (
        <ResubmitModal
          proposal={resubmitProposal}
          onClose={() => setResubmitProposal(null)}
          onSuccess={() => {
            setResubmitProposal(null);
            showToast('📬 Re-submitted — admins will review your changes.');
            loadMyProposals();
          }}
        />
      )}

      {/* ── Toast ── */}
      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  header: {
    background: 'linear-gradient(135deg, #2e7d32, #1b5e20)',
    color: '#fff', padding: '0.75rem 1.5rem',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
  },
  backLink: { color: 'rgba(255,255,255,0.75)', textDecoration: 'none', fontSize: '0.85rem' },
  proposeBtn: {
    padding: '0.4rem 0.9rem', borderRadius: '6px', cursor: 'pointer',
    background: '#4caf50', border: '1px solid #81c784', color: '#fff',
    fontSize: '0.85rem', fontWeight: '600',
  },
  darkBtn: {
    padding: '0.35rem 0.7rem', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem',
    background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
  },
  intro: { background: '#1b5e20', padding: '0.75rem 1.5rem' },

  // Page-level tabs (Browse / My Proposals)
  pageTabs: {
    display: 'flex', gap: '0', padding: '0 1.5rem',
    borderBottom: '2px solid rgba(0,0,0,0.12)',
    background: '#fff',
  },
  pageTab: {
    padding: '0.6rem 1.25rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500',
    background: 'none', border: 'none', borderBottom: '3px solid transparent',
    color: '#888', position: 'relative', gap: '0.4rem', display: 'inline-flex', alignItems: 'center',
  },
  pageTabActive: {
    color: '#2e7d32', fontWeight: '700', borderBottom: '3px solid #4caf50',
  },
  revisionBadge: {
    marginLeft: '0.4rem', background: '#c62828', color: '#fff',
    borderRadius: '10px', fontSize: '0.7rem', fontWeight: '700',
    padding: '0 0.4rem', minWidth: '1.2em', textAlign: 'center',
    display: 'inline-block',
  },

  // Search bar
  searchBar: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    padding: '0.75rem 1.5rem 0',
  },
  searchInput: {
    padding: '0.4rem 0.75rem', borderRadius: '20px',
    border: '1.5px solid rgba(0,0,0,0.15)', fontSize: '0.9rem',
    outline: 'none', width: '240px', background: '#fff', color: '#1b5e20',
  },
  searchClear: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#999', fontSize: '0.85rem', padding: '0.1rem 0.3rem',
  },

  // Browse: content type tabs
  tabs: {
    display: 'flex', gap: '0.5rem', padding: '1rem 1.5rem 0',
    borderBottom: '2px solid rgba(0,0,0,0.08)', flexWrap: 'wrap',
  },
  tab: {
    padding: '0.5rem 1.1rem', borderRadius: '6px 6px 0 0', cursor: 'pointer',
    background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.12)',
    borderBottom: 'none', fontSize: '0.9rem', fontWeight: '500', color: 'inherit',
  },
  tabActive: {
    background: '#fff', borderColor: 'rgba(0,0,0,0.12)',
    fontWeight: '700', color: '#2e7d32', boxShadow: '0 -2px 6px rgba(0,0,0,0.06)',
  },
  tabCount: { fontSize: '0.75rem', color: '#888' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '1rem', padding: '1.5rem',
    maxWidth: '1200px', margin: '0 auto',
  },
  empty: { gridColumn: '1 / -1', color: '#888', textAlign: 'center', padding: '2rem' },
  card: {
    background: '#fff', borderRadius: '10px', padding: '1rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.06)',
    display: 'flex', flexDirection: 'column', gap: '0.5rem',
  },
  cardEmoji: { fontSize: '2rem', textAlign: 'center' },
  cardName:  { fontWeight: '700', textAlign: 'center', color: '#1b5e20', fontSize: '1rem' },
  cardMeta:  { display: 'flex', flexWrap: 'wrap', gap: '0.3rem', justifyContent: 'center' },
  cardDesc:  { fontSize: '0.78rem', color: '#666', textAlign: 'center', lineHeight: '1.4' },
  badge: {
    fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '10px',
    background: 'rgba(46,125,50,0.1)', color: '#2e7d50',
  },

  // My Proposals section
  mineWrap: { padding: '1.5rem', maxWidth: '900px', margin: '0 auto' },
  mineGrid: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  myCard: {
    background: '#1a2a1a', borderRadius: '10px', padding: '1rem',
    border: '1px solid', color: '#f0f4e8',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
  },
  statusPill: {
    fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '20px',
    border: '1px solid', fontWeight: '600', flexShrink: 0,
  },
  filterBtn: {
    padding: '0.3rem 0.7rem', borderRadius: '20px', cursor: 'pointer', fontSize: '0.8rem',
    background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.12)', color: '#666',
  },
  filterBtnActive: {
    background: '#2e7d32', color: '#fff', borderColor: '#4caf50',
  },
  revisionNote: {
    background: 'rgba(255,204,2,0.08)', border: '1px solid rgba(255,204,2,0.3)',
    borderRadius: '6px', padding: '0.6rem 0.8rem', fontSize: '0.85rem',
    lineHeight: '1.5',
  },

  // Modal shared
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 800, padding: '1rem',
  },
  modal: {
    background: '#1a2a1a', borderRadius: '12px', width: '100%', maxWidth: '700px',
    maxHeight: '90vh', overflow: 'auto', color: '#f0f4e8',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(0,0,0,0.2)',
  },
  modalBody:  { padding: '1.25rem' },
  modalHint:  { marginBottom: '0.75rem', fontSize: '0.82rem', color: '#888' },
  closeBtn:   { background: 'none', border: 'none', color: '#aaa', fontSize: '1.2rem', cursor: 'pointer' },
  formStatus: (ok) => ({
    marginTop: '0.75rem', fontSize: '0.85rem', fontWeight: '500',
    color: ok ? '#81c784' : '#ef5350',
  }),
  toast: {
    position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
    background: '#2e7d32', color: '#fff', padding: '0.6rem 1.5rem',
    borderRadius: '20px', fontSize: '0.9rem', fontWeight: '600',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 1000,
    animation: 'fadeIn 0.2s ease',
  },
};

export default ContentWikiPage;
