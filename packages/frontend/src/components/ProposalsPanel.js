/**
 * ProposalsPanel — admin view for reviewing community content proposals.
 *
 * Actions per pending / revision_requested proposal:
 *  ✅ Approve          — publish as-is
 *  ✏️ Edit & Approve   — open inline form, tweak item, then approve with edits
 *  🔄 Request Revision — send back to proposer with a note (they can re-submit)
 *  ❌ Reject            — permanently reject with optional note
 *
 * Extra features:
 *  • Pagination — PAGE_SIZE cards per page, numbered navigation
 *  • Diff view  — if a proposal targets an existing item, show changed fields
 */
import React, { useState, useEffect, useCallback } from 'react';
import api from '../hooks/useApi';
import { ItemForm } from './ContentForms';

const PAGE_SIZE = 10;

const STATUS_COLORS = {
  pending:            { bg: 'rgba(255,193,7,0.15)',  text: '#f9a825', label: '⏳ Pending' },
  approved:           { bg: 'rgba(76,175,80,0.15)',  text: '#388e3c', label: '✅ Approved' },
  rejected:           { bg: 'rgba(198,40,40,0.15)',  text: '#c62828', label: '❌ Rejected' },
  revision_requested: { bg: 'rgba(33,150,243,0.15)', text: '#1976d2', label: '🔄 Revision requested' },
};

const TYPE_EMOJI = { plants: '🌱', structures: '🏗️', tools: '🔧', weather: '☁️' };

// ── Diff between current live item and proposed item ──────────────────────────
function ItemDiff({ currentItem, proposedItem }) {
  if (!currentItem) return null;

  const allKeys = [...new Set([...Object.keys(currentItem), ...Object.keys(proposedItem)])]
    .filter((k) => !['companionGood', 'companionBad', 'growthEmojis', '_deleted'].includes(k));

  const changed = allKeys.filter((k) => {
    const a = JSON.stringify(currentItem[k]);
    const b = JSON.stringify(proposedItem[k]);
    return a !== b;
  });

  if (changed.length === 0) return (
    <div style={SD.noChange}>No field changes detected — item already exists with these values.</div>
  );

  return (
    <div style={SD.diffBox}>
      <div style={SD.diffTitle}>📊 Changed fields vs. live version</div>
      <table style={SD.table}>
        <thead>
          <tr>
            <th style={SD.th}>Field</th>
            <th style={{ ...SD.th, color: '#ef9a9a' }}>Current</th>
            <th style={{ ...SD.th, color: '#a5d6a7' }}>Proposed</th>
          </tr>
        </thead>
        <tbody>
          {changed.map((k) => (
            <tr key={k}>
              <td style={SD.td}>{k}</td>
              <td style={{ ...SD.td, color: '#ef9a9a' }}>{JSON.stringify(currentItem[k])}</td>
              <td style={{ ...SD.td, color: '#a5d6a7' }}>{JSON.stringify(proposedItem[k])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Inline edit form ───────────────────────────────────────────────────────────
function EditApproveForm({ proposal, onApprove, onCancel }) {
  const [item,   setItem]   = useState({ ...proposal.item });
  const [note,   setNote]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const idField = proposal.type === 'plants' ? 'slug' : 'id';

  const handleSubmit = async () => {
    if (!item[idField]) { setError(`${idField} is required`); return; }
    if (!item.name)     { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      await onApprove(proposal.id, item, note);
    } catch (err) {
      setError(err.message || 'Failed to approve');
      setSaving(false);
    }
  };

  return (
    <div style={SE.editBox}>
      <div style={SE.editTitle}>✏️ Edit before approving</div>
      <ItemForm type={proposal.type} item={item} onChange={setItem} />
      <div style={{ marginTop: '0.75rem' }}>
        <label style={SE.smallLabel}>Approval note (optional)</label>
        <input
          style={SE.noteInput}
          placeholder="e.g. 'Minor balance tweaks applied'"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      {error && <div style={SE.errMsg}>{error}</div>}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button style={SE.approveBtn} onClick={handleSubmit} disabled={saving}>
          {saving ? 'Approving…' : '✅ Approve with edits'}
        </button>
        <button style={SE.cancelBtn} onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </div>
  );
}

// ── Single proposal card ──────────────────────────────────────────────────────
function ProposalCard({ proposal, currentContent, onApprove, onReject, onRequestRevision }) {
  const [mode,     setMode]     = useState('idle'); // idle | editing | rejecting | revising
  const [note,     setNote]     = useState('');
  const [expanded, setExpanded] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  const sc        = STATUS_COLORS[proposal.status] || STATUS_COLORS.pending;
  const isPending = proposal.status === 'pending' || proposal.status === 'revision_requested';
  const idField   = proposal.type === 'plants' ? 'slug' : 'id';

  // Find the current live item (if it's an override proposal)
  const currentItem = currentContent
    ? (currentContent[proposal.type] || []).find(
        (item) => (item.slug || item.id) === proposal.item[idField]
      )
    : null;
  const isOverride = !!currentItem;

  const itemPreview = Object.entries(proposal.item)
    .filter(([k]) => !['companionGood', 'companionBad', 'growthEmojis', '_deleted'].includes(k))
    .slice(0, 6)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(' · ');

  const resetMode = () => { setMode('idle'); setNote(''); };

  return (
    <div style={S.card}>
      {/* ── Header ── */}
      <div style={S.cardHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={S.typeTag}>
            {TYPE_EMOJI[proposal.type] || '📄'} {proposal.type.slice(0, -1)}
          </span>
          <strong style={{ color: '#f0f4e8' }}>
            {proposal.item.name || proposal.item.slug || proposal.item.id}
          </strong>
          {isOverride && (
            <span style={{ ...S.statusBadge, background: 'rgba(255,152,0,0.2)', color: '#ffcc80' }}>
              ✏️ override
            </span>
          )}
          <span style={{ ...S.statusBadge, background: sc.bg, color: sc.text }}>{sc.label}</span>
          {proposal.revisionCount > 0 && (
            <span style={{ ...S.statusBadge, background: 'rgba(255,255,255,0.08)', color: '#aaa' }}>
              rev #{proposal.revisionCount}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={S.meta}>by {proposal.submittedByName || `#${proposal.submittedBy}`}</span>
          <span style={S.meta}>{new Date(proposal.createdAt).toLocaleDateString()}</span>
          {isOverride && (
            <button style={S.diffBtn} onClick={() => setShowDiff((d) => !d)} title="Show diff vs. live item">
              {showDiff ? '▲ diff' : '▼ diff'}
            </button>
          )}
          <button style={S.expandBtn} onClick={() => setExpanded((e) => !e)}>
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* ── Item summary ── */}
      <div style={S.itemPreview}>{itemPreview}</div>

      {/* ── Diff view ── */}
      {showDiff && isOverride && (
        <ItemDiff currentItem={currentItem} proposedItem={proposal.item} />
      )}

      {/* ── Expanded JSON ── */}
      {expanded && (
        <pre style={S.pre}>{JSON.stringify(proposal.item, null, 2)}</pre>
      )}

      {/* ── Admin note ── */}
      {proposal.note && (
        <div style={S.noteBox}>
          <span style={{ opacity: 0.6, fontSize: '0.72rem' }}>Admin note: </span>
          {proposal.note}
        </div>
      )}

      {/* ── Actions (pending + revision_requested only) ── */}
      {isPending && mode === 'idle' && (
        <div style={S.actions}>
          <button style={S.approveBtn} onClick={() => onApprove(proposal.id, null, '')}>
            ✅ Approve
          </button>
          <button style={S.editBtn} onClick={() => setMode('editing')}>
            ✏️ Edit & Approve
          </button>
          <button style={S.reviseBtn} onClick={() => setMode('revising')}>
            🔄 Request revision
          </button>
          <button style={S.rejectBtn} onClick={() => setMode('rejecting')}>
            ❌ Reject
          </button>
        </div>
      )}

      {/* ── Rejection note ── */}
      {mode === 'rejecting' && (
        <div style={{ ...S.actions, flexDirection: 'column', alignItems: 'stretch', gap: '0.4rem' }}>
          <label style={S.smallLabel}>Rejection reason (optional)</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              style={S.noteInput}
              placeholder="e.g. 'Stats too powerful'"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { onReject(proposal.id, note); resetMode(); } }}
              autoFocus
            />
            <button style={S.rejectBtn} onClick={() => { onReject(proposal.id, note); resetMode(); }}>Confirm ❌</button>
            <button style={S.cancelBtn} onClick={resetMode}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Revision note ── */}
      {mode === 'revising' && (
        <div style={{ ...S.actions, flexDirection: 'column', alignItems: 'stretch', gap: '0.4rem' }}>
          <label style={S.smallLabel}>
            Revision note — tell the proposer what to fix{' '}
            <span style={{ color: '#ef5350' }}>*required</span>
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              style={S.noteInput}
              placeholder="e.g. 'Please lower baseCoins to max 20'"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && note.trim()) { onRequestRevision(proposal.id, note); resetMode(); } }}
              autoFocus
            />
            <button
              style={{ ...S.reviseBtn, opacity: note.trim() ? 1 : 0.5 }}
              disabled={!note.trim()}
              onClick={() => { onRequestRevision(proposal.id, note); resetMode(); }}
            >
              Send 🔄
            </button>
            <button style={S.cancelBtn} onClick={resetMode}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Inline edit form ── */}
      {mode === 'editing' && (
        <EditApproveForm
          proposal={proposal}
          onApprove={async (id, editedItem, approveNote) => {
            await onApprove(id, editedItem, approveNote);
            resetMode();
          }}
          onCancel={resetMode}
        />
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
function ProposalsPanel() {
  const [proposals,    setProposals]    = useState([]);
  const [filter,       setFilter]       = useState('pending');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [toast,        setToast]        = useState('');
  const [page,         setPage]         = useState(1);
  const [gameContent,  setGameContent]  = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // Fetch live game content once for diff view
  useEffect(() => {
    fetch('/api/content')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setGameContent(data))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(''); setPage(1);
    try {
      const data = await api.get(`/api/admin/content/proposals?status=${filter}`);
      setProposals(data.proposals || []);
    } catch (err) {
      setError(err.message || 'Could not load proposals');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id, editedItem, note) => {
    try {
      const body = { note: note || '' };
      if (editedItem) body.item = editedItem;
      await api.post(`/api/admin/content/proposals/${id}/approve`, body);
      showToast('✅ Proposal approved and published!');
      load();
    } catch (err) { setError(err.message || 'Approval failed'); }
  };

  const handleReject = async (id, note) => {
    try {
      await api.post(`/api/admin/content/proposals/${id}/reject`, { note });
      showToast('❌ Proposal rejected.');
      load();
    } catch (err) { setError(err.message || 'Rejection failed'); }
  };

  const handleRequestRevision = async (id, note) => {
    try {
      await api.post(`/api/admin/content/proposals/${id}/request-revision`, { note });
      showToast('🔄 Revision requested — proposer has been notified.');
      load();
    } catch (err) { setError(err.message || 'Request revision failed'); }
  };

  // Pagination
  const totalPages = Math.max(1, Math.ceil(proposals.length / PAGE_SIZE));
  const pageItems  = proposals.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const FILTERS = [
    { key: 'pending',            label: '⏳ Pending' },
    { key: 'revision_requested', label: '🔄 Needs revision' },
    { key: 'approved',           label: '✅ Approved' },
    { key: 'rejected',           label: '❌ Rejected' },
  ];

  return (
    <div style={S.root}>
      <div style={S.topBar}>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              style={{ ...S.filterBtn, ...(filter === key ? S.filterActive : {}) }}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {proposals.length > 0 && (
            <span style={{ fontSize: '0.78rem', color: '#888' }}>
              {proposals.length} proposal{proposals.length !== 1 ? 's' : ''}
            </span>
          )}
          <button style={S.refreshBtn} onClick={load} disabled={loading}>↻ Refresh</button>
        </div>
      </div>

      {error   && <div style={S.error}>{error}</div>}
      {loading && <div style={S.empty}>Loading proposals…</div>}

      {!loading && proposals.length === 0 && (
        <div style={S.empty}>
          No {filter.replace('_', ' ')} proposals.
          {filter === 'pending' && (
            <span style={{ display: 'block', marginTop: '0.4rem', fontSize: '0.82rem', color: '#666' }}>
              Logged-in players can submit proposals from the{' '}
              <a href="/content-wiki" target="_blank" rel="noreferrer" style={{ color: '#81c784' }}>
                Content Wiki
              </a>.
            </span>
          )}
        </div>
      )}

      <div style={S.list}>
        {pageItems.map((p) => (
          <ProposalCard
            key={p.id}
            proposal={p}
            currentContent={gameContent}
            onApprove={handleApprove}
            onReject={handleReject}
            onRequestRevision={handleRequestRevision}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={S.pagination}>
          <button style={S.pageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            ← Prev
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              style={{ ...S.pageBtn, ...(n === page ? S.pageBtnActive : {}) }}
              onClick={() => setPage(n)}
            >
              {n}
            </button>
          ))}
          <button style={S.pageBtn} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            Next →
          </button>
        </div>
      )}

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const S = {
  root: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  topBar: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '0.25rem', flexWrap: 'wrap', gap: '0.5rem',
  },
  filterBtn: {
    padding: '0.3rem 0.75rem', borderRadius: '6px', cursor: 'pointer',
    border: '1px solid rgba(0,0,0,0.15)', background: '#f5f5f5',
    fontSize: '0.8rem', fontWeight: '600', color: '#666',
  },
  filterActive: { background: '#2e7d32', color: '#fff', borderColor: '#2e7d32' },
  refreshBtn: {
    padding: '0.3rem 0.75rem', border: '1.5px solid #4caf50',
    background: 'white', borderRadius: '6px', cursor: 'pointer',
    fontWeight: '600', color: '#4caf50', fontSize: '0.8rem',
  },
  error: {
    background: '#ffebee', color: '#c62828', padding: '0.6rem 0.9rem',
    borderRadius: '6px', fontSize: '0.88rem',
  },
  empty: { color: '#aaa', textAlign: 'center', padding: '2rem 1rem', fontSize: '0.95rem' },
  list:  { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  card: {
    background: '#1a2a1a', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '10px', padding: '0.9rem 1rem',
    display: 'flex', flexDirection: 'column', gap: '0.5rem',
  },
  cardHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    flexWrap: 'wrap', gap: '0.4rem',
  },
  typeTag: {
    fontSize: '0.72rem', padding: '0.1rem 0.5rem', borderRadius: '10px',
    background: 'rgba(76,175,80,0.15)', color: '#81c784', textTransform: 'capitalize',
  },
  statusBadge: {
    fontSize: '0.72rem', padding: '0.1rem 0.5rem', borderRadius: '10px', fontWeight: '700',
  },
  meta:      { fontSize: '0.75rem', color: '#666' },
  expandBtn: {
    padding: '0.15rem 0.5rem', borderRadius: '4px', cursor: 'pointer',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    color: '#888', fontSize: '0.72rem',
  },
  diffBtn: {
    padding: '0.15rem 0.5rem', borderRadius: '4px', cursor: 'pointer',
    background: 'rgba(255,152,0,0.1)', border: '1px solid rgba(255,152,0,0.3)',
    color: '#ffcc80', fontSize: '0.72rem',
  },
  itemPreview: {
    fontSize: '0.78rem', color: '#888', fontFamily: 'monospace',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  pre: {
    background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '0.75rem',
    fontSize: '0.72rem', color: '#a5d6a7', overflowX: 'auto', margin: 0, lineHeight: '1.5',
  },
  noteBox: {
    fontSize: '0.8rem', color: '#ffcc80',
    background: 'rgba(255,160,0,0.08)', borderRadius: '5px', padding: '0.4rem 0.65rem',
  },
  actions: { display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.25rem', flexWrap: 'wrap' },
  approveBtn: {
    padding: '0.3rem 0.75rem', borderRadius: '6px', cursor: 'pointer',
    background: '#2e7d32', border: '1px solid #4caf50', color: '#fff',
    fontSize: '0.8rem', fontWeight: '600',
  },
  editBtn: {
    padding: '0.3rem 0.75rem', borderRadius: '6px', cursor: 'pointer',
    background: 'rgba(33,150,243,0.2)', border: '1px solid #1976d2', color: '#90caf9',
    fontSize: '0.8rem', fontWeight: '600',
  },
  reviseBtn: {
    padding: '0.3rem 0.75rem', borderRadius: '6px', cursor: 'pointer',
    background: 'rgba(255,152,0,0.2)', border: '1px solid #f57c00', color: '#ffcc80',
    fontSize: '0.8rem', fontWeight: '600',
  },
  rejectBtn: {
    padding: '0.3rem 0.75rem', borderRadius: '6px', cursor: 'pointer',
    background: '#c62828', border: '1px solid #ef5350', color: '#fff',
    fontSize: '0.8rem', fontWeight: '600',
  },
  cancelBtn: {
    padding: '0.3rem 0.75rem', borderRadius: '6px', cursor: 'pointer',
    background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#ccc',
    fontSize: '0.8rem',
  },
  noteInput: {
    flex: 1, padding: '0.3rem 0.6rem', borderRadius: '5px',
    border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.25)',
    color: '#f0f4e8', fontSize: '0.82rem', minWidth: '180px',
  },
  smallLabel: {
    fontSize: '0.72rem', color: '#888', display: 'block', marginBottom: '0.25rem',
    textTransform: 'uppercase', letterSpacing: '0.04em',
  },
  pagination: {
    display: 'flex', gap: '0.3rem', justifyContent: 'center',
    marginTop: '0.5rem', flexWrap: 'wrap',
  },
  pageBtn: {
    padding: '0.25rem 0.6rem', borderRadius: '5px', cursor: 'pointer',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
    color: '#ccc', fontSize: '0.8rem',
  },
  pageBtnActive: { background: '#2e7d32', borderColor: '#4caf50', color: '#fff', fontWeight: '700' },
  toast: {
    position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
    background: '#2e7d32', color: '#fff', padding: '0.55rem 1.3rem',
    borderRadius: '20px', fontSize: '0.88rem', fontWeight: '600',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 1000,
  },
};

// Edit form inner styles
const SE = {
  editBox: {
    background: 'rgba(0,0,0,0.25)', borderRadius: '8px', padding: '0.9rem',
    marginTop: '0.25rem', border: '1px solid rgba(33,150,243,0.3)',
  },
  editTitle: {
    fontSize: '0.82rem', fontWeight: '700', color: '#90caf9',
    marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  smallLabel: {
    fontSize: '0.72rem', color: '#888', display: 'block', marginBottom: '0.25rem',
    textTransform: 'uppercase', letterSpacing: '0.04em',
  },
  noteInput: {
    width: '100%', boxSizing: 'border-box', padding: '0.35rem 0.6rem', borderRadius: '5px',
    border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.25)',
    color: '#f0f4e8', fontSize: '0.82rem',
  },
  approveBtn: {
    padding: '0.35rem 0.9rem', borderRadius: '6px', cursor: 'pointer',
    background: '#2e7d32', border: '1px solid #4caf50', color: '#fff',
    fontSize: '0.82rem', fontWeight: '600',
  },
  cancelBtn: {
    padding: '0.35rem 0.9rem', borderRadius: '6px', cursor: 'pointer',
    background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#ccc',
    fontSize: '0.82rem',
  },
  errMsg: { marginTop: '0.5rem', fontSize: '0.82rem', color: '#ef5350', fontWeight: '500' },
};

// Diff styles
const SD = {
  diffBox: {
    background: 'rgba(255,152,0,0.05)', border: '1px solid rgba(255,152,0,0.2)',
    borderRadius: '6px', padding: '0.65rem 0.8rem', marginTop: '0.25rem',
  },
  diffTitle: {
    fontSize: '0.72rem', fontWeight: '700', color: '#ffcc80',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem',
  },
  noChange: { fontSize: '0.78rem', color: '#888', fontStyle: 'italic' },
  table:    { width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' },
  th: {
    textAlign: 'left', padding: '0.2rem 0.4rem',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    fontSize: '0.7rem', color: '#888', textTransform: 'uppercase',
  },
  td: { padding: '0.2rem 0.4rem', fontFamily: 'monospace', color: '#ccc', verticalAlign: 'top' },
};

export default ProposalsPanel;
