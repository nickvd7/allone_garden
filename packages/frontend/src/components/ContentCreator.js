/**
 * ContentCreator — admin UI for customising game content.
 *
 * Four tabs:
 *   🌱 Plants     — add/edit/delete custom plants with growth stats & companions
 *   🏗️ Structures — add/edit/delete custom structures
 *   🔧 Tools       — add/edit/delete custom tools
 *   ☁️ Weather     — add/edit/delete custom weather conditions
 *
 * Custom items are stored server-side via PUT /api/admin/content/:type.
 * After saving, the page reload (or a context refresh) will pick up changes.
 *
 * All form components are shared with ContentWikiPage via ContentForms.js.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../hooks/useApi';
import { PLANTS, STRUCTURES, TOOLS, WEATHER } from '../data/defaultContent';
import { BLANK, ItemForm, formStyles } from './ContentForms';

// ── Constants ─────────────────────────────────────────────────────────────────
const TABS = ['plants', 'structures', 'tools', 'weather'];
const TAB_LABELS = {
  plants:     '🌱 Plants',
  structures: '🏗️ Structures',
  tools:      '🔧 Tools',
  weather:    '☁️ Weather',
};

const DEFAULT_IDS = {
  plants:     new Set(PLANTS.map((p) => p.slug)),
  structures: new Set(STRUCTURES.map((s) => s.id)),
  tools:      new Set(TOOLS.map((t) => t.id)),
  weather:    new Set(WEATHER.map((w) => w.id)),
};

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  wrap:    { fontFamily: 'inherit', color: '#f0f4e8', minHeight: '400px' },
  tabs:    { display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' },
  dragHandle: {
    cursor: 'grab', fontSize: '0.75rem', color: '#555', padding: '0 4px',
    userSelect: 'none', flexShrink: 0,
  },
  tab: (active) => ({
    padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem',
    fontWeight: active ? '700' : '500',
    background: active ? '#2e7d32' : 'rgba(255,255,255,0.08)',
    color: active ? '#fff' : '#aaa',
    border: `1.5px solid ${active ? '#4caf50' : 'rgba(255,255,255,0.15)'}`,
  }),
  row:  { display: 'flex', gap: '1rem', alignItems: 'flex-start' },
  list: { flex: '0 0 220px', display: 'flex', flexDirection: 'column', gap: '0.35rem' },
  listItem: (active, isDragTarget) => ({
    padding: '0.45rem 0.75rem', borderRadius: '6px', cursor: 'pointer',
    background: active ? 'rgba(76,175,80,0.2)' : 'rgba(255,255,255,0.05)',
    border: `1px solid ${active ? '#4caf50' : isDragTarget ? '#4caf50' : 'rgba(255,255,255,0.1)'}`,
    borderLeft: isDragTarget ? '3px solid #4caf50' : undefined,
    fontSize: '0.85rem', color: active ? '#a5d6a7' : '#ccc',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    opacity: isDragTarget ? 0.75 : 1,
    transition: 'border 0.1s, opacity 0.1s',
  }),
  defaultBadge: {
    fontSize: '0.65rem', color: '#888',
    border: '1px solid #444', borderRadius: '4px', padding: '0 4px',
  },
  form:   { flex: 1, background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '1rem' },
  btnRow: { display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' },
  status: (ok) => ({
    marginTop: '0.6rem', fontSize: '0.82rem', fontWeight: '500',
    color: ok ? '#81c784' : '#ef5350',
  }),
};

// ── Main component ────────────────────────────────────────────────────────────
function ContentCreator() {
  const [activeTab,   setActiveTab]   = useState('plants');
  const [customs,     setCustoms]     = useState({ plants: [], structures: [], tools: [], weather: [] });
  const [selected,    setSelected]    = useState(null);   // { type, key } | null
  const [editItem,    setEditItem]    = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [status,      setStatus]      = useState('');
  const [statusOk,    setStatusOk]    = useState(true);
  const dragIndex          = useRef(null);
  const dragOverIndex      = useRef(null);
  const [dropTarget, setDropTarget]   = useState(null);

  // ── Load custom items from server ─────────────────────────────────────────
  const loadType = useCallback(async (type) => {
    setLoading(true);
    setStatus('');
    try {
      const data = await api.get(`/api/admin/content/${type}`);
      setCustoms((prev) => ({ ...prev, [type]: Array.isArray(data) ? data : [] }));
    } catch {
      setStatus(`Could not load ${type}`);
      setStatusOk(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    TABS.forEach((t) => loadType(t));
  }, [loadType]);

  // When tab changes, clear editor
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelected(null);
    setEditItem(null);
    setStatus('');
  };

  // ── Select an item ───────────────────────────────────────────────────────
  const idField      = activeTab === 'plants' ? 'slug' : 'id';
  const defaultItems = { plants: PLANTS, structures: STRUCTURES, tools: TOOLS, weather: WEATHER }[activeTab];
  const customItems  = customs[activeTab];

  const customMap = new Map(customItems.map((c) => [c[idField], c]));
  const allItems  = [
    ...defaultItems.map((d) => customMap.get(d[idField]) || d),
    ...customItems.filter((c) => !DEFAULT_IDS[activeTab].has(c[idField]) && !c._deleted),
  ].filter((item) => !item._deleted);

  const handleSelect = (item) => {
    setSelected({ type: activeTab, key: item[idField] });
    setEditItem({ ...item });
    setStatus('');
  };

  const handleNew = () => {
    setSelected(null);
    setEditItem(BLANK[activeTab]());
    setStatus('');
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!editItem) return;
    const key = editItem[idField];
    if (!key)          { setStatus('ID / slug is required'); setStatusOk(false); return; }
    if (!editItem.name){ setStatus('Name is required');       setStatusOk(false); return; }

    setSaving(true);
    setStatus('');
    try {
      const existing = customs[activeTab].filter((c) => c[idField] !== key);
      const updated  = [...existing, editItem];
      await api.put(`/api/admin/content/${activeTab}`, updated);
      setCustoms((prev) => ({ ...prev, [activeTab]: updated }));
      setSelected({ type: activeTab, key });
      setStatus('✅ Saved!');
      setStatusOk(true);
    } catch (err) {
      setStatus(`❌ Save failed: ${err.message}`);
      setStatusOk(false);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!editItem) return;
    const key       = editItem[idField];
    const isDefault = DEFAULT_IDS[activeTab].has(key);

    setSaving(true);
    setStatus('');
    try {
      let updated;
      if (isDefault) {
        const existing = customs[activeTab].filter((c) => c[idField] !== key);
        updated = [...existing, { [idField]: key, _deleted: true }];
      } else {
        updated = customs[activeTab].filter((c) => c[idField] !== key);
      }
      await api.put(`/api/admin/content/${activeTab}`, updated);
      setCustoms((prev) => ({ ...prev, [activeTab]: updated }));
      setSelected(null);
      setEditItem(null);
      setStatus(`Deleted "${editItem.name || key}"`);
      setStatusOk(true);
    } catch (err) {
      setStatus(`❌ Delete failed: ${err.message}`);
      setStatusOk(false);
    } finally {
      setSaving(false);
    }
  };

  // ── Drag-and-drop reordering ──────────────────────────────────────────────
  const handleDragStart = (index) => { dragIndex.current = index; };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    dragOverIndex.current = index;
    setDropTarget(index);
  };

  const handleDrop = async () => {
    const from = dragIndex.current;
    const to   = dragOverIndex.current;
    if (from === null || to === null || from === to) {
      dragIndex.current = dragOverIndex.current = null;
      setDropTarget(null);
      return;
    }

    const reordered = [...allItems];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);

    const newCustom = reordered.map((item) => {
      const key = item[idField];
      const existing = customs[activeTab].find((c) => c[idField] === key);
      return existing || item;
    });

    dragIndex.current = dragOverIndex.current = null;
    setDropTarget(null);

    setSaving(true);
    setStatus('');
    try {
      await api.put(`/api/admin/content/${activeTab}`, newCustom);
      setCustoms((prev) => ({ ...prev, [activeTab]: newCustom }));
      setStatus('✅ Order saved!');
      setStatusOk(true);
    } catch (err) {
      setStatus(`❌ Reorder failed: ${err.message}`);
      setStatusOk(false);
    } finally {
      setSaving(false);
    }
  };

  const selectedKey   = selected?.key;
  const isDefaultItem = editItem && DEFAULT_IDS[activeTab].has(editItem[idField]);

  return (
    <div style={S.wrap}>
      {/* Tab bar */}
      <div style={S.tabs}>
        {TABS.map((tab) => (
          <button key={tab} style={S.tab(activeTab === tab)} onClick={() => handleTabChange(tab)}>
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Main layout: list + form */}
      <div style={S.row}>
        {/* Item list */}
        <div style={S.list}>
          <button style={{ ...formStyles.btn('new'), marginBottom: '0.5rem', textAlign: 'center' }} onClick={handleNew}>
            + New {activeTab.slice(0, -1)}
          </button>
          {loading ? (
            <div style={{ color: '#888', fontSize: '0.85rem' }}>Loading…</div>
          ) : (
            allItems.map((item, index) => {
              const key         = item[idField];
              const isCustomised = customMap.has(key);
              return (
                <div
                  key={key}
                  style={S.listItem(selectedKey === key, dropTarget === index && dragIndex.current !== index)}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={handleDrop}
                  onDragEnd={() => { dragIndex.current = null; dragOverIndex.current = null; setDropTarget(null); }}
                  onDragLeave={() => { if (dragOverIndex.current === index) { dragOverIndex.current = null; setDropTarget(null); } }}
                  onClick={() => handleSelect(item)}
                >
                  <span style={S.dragHandle} title="Drag to reorder">⠿</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.emoji || item.harvestEmoji || ''} {item.name || key}
                  </span>
                  {isCustomised && !DEFAULT_IDS[activeTab].has(key) && (
                    <span style={{ ...S.defaultBadge, color: '#a5d6a7', borderColor: '#4caf50' }}>custom</span>
                  )}
                  {isCustomised && DEFAULT_IDS[activeTab].has(key) && (
                    <span style={{ ...S.defaultBadge, color: '#ffcc02', borderColor: '#ffcc02' }}>edited</span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Editor form — uses shared ItemForm from ContentForms.js */}
        <div style={S.form}>
          {editItem ? (
            <>
              <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.75rem' }}>
                {isDefaultItem
                  ? '📝 Editing a built-in item — changes override the default.'
                  : '✨ New custom item'}
              </div>
              <ItemForm type={activeTab} item={editItem} onChange={setEditItem} />
              <div style={S.btnRow}>
                <button style={formStyles.btn('save')} onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : '💾 Save'}
                </button>
                {editItem[idField] && (
                  <button style={formStyles.btn('delete')} onClick={handleDelete} disabled={saving}>
                    🗑️ {isDefaultItem ? 'Hide from game' : 'Delete'}
                  </button>
                )}
                <button style={formStyles.btn()} onClick={() => { setEditItem(null); setSelected(null); setStatus(''); }}>
                  Cancel
                </button>
              </div>
              {status && <div style={S.status(statusOk)}>{status}</div>}
            </>
          ) : (
            <div style={{ color: '#666', fontSize: '0.9rem', padding: '1rem 0' }}>
              Select an item from the list to edit, or click <strong>+ New</strong> to create one.
              {status && <div style={{ ...S.status(statusOk), marginTop: '0.5rem' }}>{status}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ContentCreator;
