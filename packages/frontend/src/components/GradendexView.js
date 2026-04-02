/**
 * GradendexView — shared plant/structure encyclopedia UI
 *
 * Used by:
 *  • GradendexPage.js   (standalone public page at /gradendex)
 *  • GradendexPanel.js  (in-game modal overlay)
 *
 * Props:
 *  token     {string|null}  JWT — if present, can-edit is probed
 *  compact   {bool}    true = narrower modal layout, false = full page
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { localizeGradendexEntry, categoryLabel, companionDisplayName } from '../utils/gradendexI18n';
import i18n from '../i18n/config';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// ── Simple Markdown renderer (bold, italic, newlines, bullet lists) ─────────
function renderMarkdown(text) {
  if (!text) return null;
  return text.split('\n').map((line, li) => {
    const isBullet = /^[-*•] /.test(line.trimStart());
    const content  = line.replace(/^[-*•] /, '');
    const parts    = content.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
      if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('*'))  return <em key={i}>{part.slice(1, -1)}</em>;
      return part;
    });
    if (isBullet) return <li key={li} style={{ marginBottom: 4 }}>{parts}</li>;
    if (!content.trim()) return <br key={li} />;
    return <p key={li} style={{ margin: '0 0 0.5rem' }}>{parts}</p>;
  });
}

// ── Edit form (admin edits raw API fields) ─────────────────────────────────
function EditForm({ entry, token, onSave, onCancel }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name:          entry.name        || '',
    emoji:         entry.emoji       || '',
    category:      entry.category    || 'plant',
    short_desc:    entry.short_desc  || '',
    long_desc:     entry.long_desc   || '',
    growth_days:   entry.growth_days ?? '',
    base_coins:    entry.base_coins  ?? '',
    tips:          (entry.tips || []).join('\n'),
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        growth_days: form.growth_days !== '' ? Number(form.growth_days) : null,
        base_coins:  form.base_coins  !== '' ? Number(form.base_coins)  : null,
        tips: form.tips.split('\n').map((x) => x.trim()).filter(Boolean),
      };
      const { data } = await axios.put(
        `${API}/api/gradendex/${entry.slug}`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      onSave(data.entry);
    } catch (err) {
      setError(err.response?.data?.error || t('gradendex.ui.load_error_detail', { defaultValue: 'Could not save changes' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={EF.row}>
        <div style={EF.field}>
          <label style={EF.label}>{t('gradendex.ui.form_emoji', { defaultValue: 'Emoji' })}</label>
          <input style={{ ...EF.input, width: 60 }} value={form.emoji} onChange={update('emoji')} maxLength={10} />
        </div>
        <div style={{ ...EF.field, flex: 1 }}>
          <label style={EF.label}>{t('gradendex.ui.form_name', { defaultValue: 'Name' })}</label>
          <input style={EF.input} value={form.name} onChange={update('name')} required maxLength={100} />
        </div>
        <div style={EF.field}>
          <label style={EF.label}>{t('gradendex.ui.form_category', { defaultValue: 'Category' })}</label>
          <select style={EF.input} value={form.category} onChange={update('category')}>
            <option value="plant">{t('gradendex.ui.cat_plant', { defaultValue: 'Plant' })}</option>
            <option value="structure">{t('gradendex.ui.cat_structure', { defaultValue: 'Structure' })}</option>
            <option value="tool">{t('gradendex.ui.cat_tool', { defaultValue: 'Tool' })}</option>
            <option value="other">{t('gradendex.ui.cat_other', { defaultValue: 'Other' })}</option>
          </select>
        </div>
      </div>

      <div style={EF.field}>
        <label style={EF.label}>{t('gradendex.ui.form_short', { defaultValue: 'Short description (max 300 chars)' })}</label>
        <input style={EF.input} value={form.short_desc} onChange={update('short_desc')} maxLength={300} />
      </div>

      <div style={EF.field}>
        <label style={EF.label}>{t('gradendex.ui.form_long', { defaultValue: 'Long description (Markdown: **bold**, *italic*, newlines)' })}</label>
        <textarea style={{ ...EF.input, minHeight: 120, resize: 'vertical' }}
          value={form.long_desc} onChange={update('long_desc')} maxLength={8000} />
      </div>

      <div style={EF.row}>
        <div style={EF.field}>
          <label style={EF.label}>{t('gradendex.ui.form_growth', { defaultValue: 'Growth days' })}</label>
          <input style={{ ...EF.input, width: 80 }} type="number" min="0" max="365"
            value={form.growth_days} onChange={update('growth_days')} placeholder="—" />
        </div>
        <div style={EF.field}>
          <label style={EF.label}>{t('gradendex.ui.form_coins', { defaultValue: 'Base coins 🪙' })}</label>
          <input style={{ ...EF.input, width: 80 }} type="number" min="0" max="9999"
            value={form.base_coins} onChange={update('base_coins')} placeholder="—" />
        </div>
      </div>

      <div style={EF.field}>
        <label style={EF.label}>{t('gradendex.ui.form_tips', { defaultValue: 'Tips (one per line)' })}</label>
        <textarea style={{ ...EF.input, minHeight: 80, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.82rem' }}
          value={form.tips} onChange={update('tips')} />
      </div>

      {error && <div style={{ color: '#c62828', fontSize: '0.85rem' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={EF.btnSecondary}>{t('gradendex.ui.cancel', { defaultValue: 'Cancel' })}</button>
        <button type="submit" style={EF.btnPrimary} disabled={saving}>
          {saving
            ? t('gradendex.ui.saving', { defaultValue: 'Saving…' })
            : t('gradendex.ui.save_changes', { defaultValue: '💾 Save changes' })}
        </button>
      </div>
    </form>
  );
}

const EF = {
  row:         { display: 'flex', gap: 10, flexWrap: 'wrap' },
  field:       { display: 'flex', flexDirection: 'column', gap: 3 },
  label:       { fontSize: '0.75rem', color: '#888', fontWeight: 600 },
  input:       { padding: '0.45rem 0.6rem', border: '1.5px solid #ddd', borderRadius: 6, fontSize: '0.88rem', outline: 'none', background: 'white' },
  btnPrimary:  { padding: '0.45rem 1rem', background: '#4caf50', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem' },
  btnSecondary:{ padding: '0.45rem 0.9rem', background: 'white', color: '#4caf50', border: '1.5px solid #4caf50', borderRadius: 7, cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' },
};

// ── Entry detail view ─────────────────────────────────────────────────────────
function EntryDetail({ entry, canEdit, token, onUpdate, onClose }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const loc = useMemo(() => localizeGradendexEntry(entry, t), [entry, t]);

  const handleSave = (updated) => {
    setEditing(false);
    onUpdate(updated);
  };

  if (editing) {
    return (
      <div>
        <button type="button" onClick={() => setEditing(false)} style={S.backBtn}>
          {t('gradendex.ui.back', { defaultValue: '← Back' })}
        </button>
        <h3 style={S.detailTitle}>
          {entry.emoji} {loc.name} {t('gradendex.ui.edit_title_suffix', { defaultValue: '— Edit' })}
        </h3>
        <EditForm entry={entry} token={token} onSave={handleSave} onCancel={() => setEditing(false)} />
      </div>
    );
  }

  const good = entry.companion_good || [];
  const bad  = entry.companion_bad  || [];
  const tips = loc.tips           || [];

  const dayLabel = (entry.growth_days ?? null) !== null
    ? (entry.growth_days === 1
        ? t('gradendex.ui.stats_days', { count: 1, defaultValue: '1 day' })
        : t('gradendex.ui.stats_days_plural', { count: entry.growth_days, defaultValue: `${entry.growth_days} days` }))
    : '';

  const coinsLabel = (entry.base_coins ?? null) !== null
    ? t('gradendex.ui.stats_coins', {
      count: entry.base_coins,
      defaultValue: `${entry.base_coins} coins`,
    })
    : '';

  return (
    <div>
      <button type="button" onClick={onClose} style={S.backBtn}>
        {t('gradendex.ui.back_to_list', { defaultValue: '← Back to list' })}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '2.5rem' }}>{entry.emoji}</span>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#2e7d32' }}>{loc.name}</h2>
          <span style={S.categoryBadge}>{categoryLabel(entry.category, t)}</span>
        </div>
        {canEdit && (
          <button type="button" onClick={() => setEditing(true)} style={{ ...EF.btnSecondary, marginLeft: 'auto' }}>
            {t('gradendex.ui.edit', { defaultValue: '✏️ Edit' })}
          </button>
        )}
      </div>

      {loc.short_desc && (
        <p style={{ color: '#555', margin: '0 0 1rem', fontStyle: 'italic', fontSize: '0.92rem' }}>
          {loc.short_desc}
        </p>
      )}

      {(((entry.growth_days ?? null) !== null) || ((entry.base_coins ?? null) !== null)) && (
        <div style={S.statsRow}>
          {(entry.growth_days ?? null) !== null && (
            <div style={S.stat}><span style={S.statIcon}>📅</span> {dayLabel}</div>
          )}
          {(entry.base_coins ?? null) !== null && (
            <div style={S.stat}><span style={S.statIcon}>🪙</span> {coinsLabel}</div>
          )}
        </div>
      )}

      {loc.long_desc && (
        <div style={{ marginBottom: '1rem', fontSize: '0.88rem', color: '#444', lineHeight: 1.65 }}>
          {renderMarkdown(loc.long_desc)}
        </div>
      )}

      {(good.length > 0 || bad.length > 0) && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={S.sectionLabel}>{t('gradendex.ui.companion_planting', { defaultValue: 'Companion planting' })}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {good.map((c) => (
              <span key={c.slug} style={S.companionGood}>
                💚 {companionDisplayName(c.slug, t)} +{c.bonus}%
              </span>
            ))}
            {bad.map((c) => (
              <span key={c.slug} style={S.companionBad}>
                ⚠️ {companionDisplayName(c.slug, t)} −{c.penalty}%
              </span>
            ))}
          </div>
        </div>
      )}

      {tips.length > 0 && (
        <div>
          <div style={S.sectionLabel}>{t('gradendex.ui.tips', { defaultValue: 'Tips' })}</div>
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            {tips.map((tip, i) => (
              <li key={i} style={{ fontSize: '0.86rem', color: '#555', lineHeight: 1.7 }}>
                {renderMarkdown(tip)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {entry.updated_by && (
        <p style={{ marginTop: '1rem', fontSize: '0.72rem', color: '#bbb' }}>
          {t('gradendex.ui.last_edited', {
            user: entry.updated_by,
            date: new Date(entry.updated_at).toLocaleDateString(),
            defaultValue: `Last edited by ${entry.updated_by} · ${new Date(entry.updated_at).toLocaleDateString()}`,
          })}
        </p>
      )}
    </div>
  );
}

// ── Main GradendexView ────────────────────────────────────────────────────────
function GradendexView({ token = null, compact = false }) {
  const { t } = useTranslation();
  const [entries,  setEntries]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [category, setCategory] = useState('all');
  const [search,   setSearch]   = useState('');
  const [selected, setSelected] = useState(null);
  const [canEdit,  setCanEdit]  = useState(false);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/api/gradendex`)
      .then(({ data }) => setEntries(data.entries || []))
      .catch(() => setError(
        i18n.t('gradendex.ui.error_load', { defaultValue: 'Could not load Gradendex. Is the server running?' })
      ))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!token) return;
    axios.get(`${API}/api/gradendex/can-edit`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(() => setCanEdit(true))
      .catch(() => setCanEdit(false));
  }, [token]);

  const localizedEntries = useMemo(
    () => entries.map((e) => localizeGradendexEntry(e, t)),
    [entries, t]
  );

  const filteredEntries = useMemo(() => {
    const q = search.toLowerCase();
    return localizedEntries.filter((e) => {
      const matchCat = category === 'all' || e.category === category;
      const matchSearch = !q
        || e.name.toLowerCase().includes(q)
        || (e.short_desc && e.short_desc.toLowerCase().includes(q));
      return matchCat && matchSearch;
    });
  }, [localizedEntries, category, search]);

  const selectedRaw = entries.find((e) => e.slug === selected);

  const handleUpdate = useCallback((updated) => {
    setEntries((prev) => prev.map((e) => (e.slug === updated.slug ? updated : e)));
  }, []);

  const categoryTabs = useMemo(() => ([
    { id: 'all',       label: t('gradendex.ui.tab_all', { defaultValue: '🌍 All' }) },
    { id: 'plant',     label: t('gradendex.ui.tab_plants', { defaultValue: '🌱 Plants' }) },
    { id: 'structure', label: t('gradendex.ui.tab_structures', { defaultValue: '🏗️ Structures' }) },
  ]), [t]);

  if (loading) {
    return <div style={S.loading}>{t('gradendex.ui.loading', { defaultValue: 'Loading Gradendex…' })}</div>;
  }
  if (error)   return <div style={S.error}>{error}</div>;

  if (selectedRaw) {
    return (
      <EntryDetail
        entry={selectedRaw}
        canEdit={canEdit}
        token={token}
        onUpdate={handleUpdate}
        onClose={() => setSelected(null)}
      />
    );
  }

  return (
    <div>
      <div style={S.toolbar}>
        <input
          style={S.searchInput}
          placeholder={t('gradendex.ui.search_placeholder', { defaultValue: '🔍 Search plants or structures…' })}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('gradendex.ui.aria_search', { defaultValue: 'Search Gradendex' })}
        />
        <div style={S.categoryBar}>
          {categoryTabs.map((cat) => (
            <button
              key={cat.id}
              type="button"
              style={{ ...S.catBtn, ...(category === cat.id ? S.catBtnActive : {}) }}
              onClick={() => setCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {filteredEntries.length === 0 && (
        <p style={{ color: '#aaa', textAlign: 'center', padding: '2rem' }}>
          {t('gradendex.ui.no_results', { search, defaultValue: `No entries found for "${search}".` })}
        </p>
      )}

      <div style={{ ...S.grid, gridTemplateColumns: compact ? 'repeat(auto-fill, minmax(180px, 1fr))' : 'repeat(auto-fill, minmax(210px, 1fr))' }}>
        {filteredEntries.map((entry) => (
          <button
            key={entry.slug}
            type="button"
            style={S.card}
            onClick={() => setSelected(entry.slug)}
            aria-label={t('gradendex.ui.aria_view', { name: entry.name, defaultValue: `View ${entry.name}` })}
          >
            <div style={S.cardEmoji}>{entry.emoji}</div>
            <div style={S.cardName}>{entry.name}</div>
            <div style={S.cardDesc}>{entry.short_desc}</div>
            {(entry.growth_days ?? null) !== null && (
              <div style={S.cardStat}>📅 {entry.growth_days}d · 🪙{entry.base_coins}</div>
            )}
            <span style={S.categoryBadge}>{categoryLabel(entry.category, t)}</span>
          </button>
        ))}
      </div>

      {canEdit && (
        <p style={{ fontSize: '0.76rem', color: '#aaa', textAlign: 'right', marginTop: '0.75rem' }}>
          {t('gradendex.ui.admin_hint', { defaultValue: '✏️ Admin mode — click any entry to edit' })}
        </p>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  loading:      { textAlign: 'center', padding: '3rem', color: '#888' },
  error:        { textAlign: 'center', padding: '2rem', color: '#c62828' },
  toolbar:      { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: '1rem', alignItems: 'center' },
  searchInput:  { flex: 1, minWidth: 180, padding: '0.5rem 0.8rem', border: '1.5px solid #ddd', borderRadius: 8, fontSize: '0.88rem', outline: 'none' },
  categoryBar:  { display: 'flex', gap: 4 },
  catBtn:       { padding: '0.4rem 0.8rem', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: '2px solid transparent', background: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#777' },
  catBtnActive: { borderBottom: '2px solid #4caf50', color: '#2e7d32', background: '#f1f8f1' },
  grid:         { display: 'grid', gap: 12 },
  card:         { background: 'white', border: '1.5px solid #e8f5e9', borderRadius: 12, padding: '1rem', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4, transition: 'box-shadow 0.15s, border-color 0.15s', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  cardEmoji:    { fontSize: '2rem', lineHeight: 1.2 },
  cardName:     { fontWeight: 700, fontSize: '0.95rem', color: '#2e7d32' },
  cardDesc:     { fontSize: '0.78rem', color: '#666', lineHeight: 1.4, flex: 1 },
  cardStat:     { fontSize: '0.75rem', color: '#888', marginTop: 2 },
  categoryBadge:{ display: 'inline-block', background: '#e8f5e9', color: '#388e3c', fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', borderRadius: 12, marginTop: 4 },
  statsRow:     { display: 'flex', gap: 12, marginBottom: '0.75rem' },
  stat:         { background: '#f5f5f5', borderRadius: 8, padding: '0.35rem 0.75rem', fontSize: '0.85rem', display: 'flex', gap: 4, alignItems: 'center' },
  statIcon:     { fontSize: '1rem' },
  sectionLabel: { fontSize: '0.75rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' },
  companionGood:{ background: '#e8f5e9', color: '#2e7d32', padding: '0.2rem 0.55rem', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600 },
  companionBad: { background: '#fff3e0', color: '#e65100', padding: '0.2rem 0.55rem', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600 },
  detailTitle:  { fontSize: '1.1rem', color: '#2e7d32', margin: '0 0 1rem' },
  backBtn:      { border: 'none', background: 'none', color: '#4caf50', cursor: 'pointer', fontSize: '0.85rem', padding: '0 0 0.75rem', fontWeight: 600 },
};

export default GradendexView;
