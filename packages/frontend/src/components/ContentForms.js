/**
 * ContentForms.js — shared field components for plant / structure / tool / weather editors.
 *
 * Exported and used by:
 *   ContentCreator.js  — admin edit UI
 *   ContentWikiPage.js — public proposal form
 */
import React from 'react';

// ── Common styles ─────────────────────────────────────────────────────────────
export const formStyles = {
  field:  { marginBottom: '0.8rem' },
  label:  { display: 'block', fontSize: '0.75rem', color: '#888', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input:  { width: '100%', boxSizing: 'border-box', padding: '0.4rem 0.6rem', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.25)', color: '#f0f4e8', fontSize: '0.9rem' },
  hint:   { fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' },
  section:{ fontSize: '0.8rem', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0.75rem 0 0.4rem' },
  btn:    (variant) => ({
    padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600',
    border: '1.5px solid',
    ...(variant === 'save'   ? { background: '#2e7d32', borderColor: '#4caf50', color: '#fff' } :
        variant === 'delete' ? { background: '#c62828', borderColor: '#ef5350', color: '#fff' } :
        variant === 'new'    ? { background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.25)', color: '#ccc' } :
                               { background: 'transparent', borderColor: 'rgba(255,255,255,0.25)', color: '#ccc' }),
  }),
};

// ── Generic field wrapper ─────────────────────────────────────────────────────
export function Field({ label, children, hint }) {
  return (
    <div style={formStyles.field}>
      <label style={formStyles.label}>{label}</label>
      {children}
      {hint && <div style={formStyles.hint}>{hint}</div>}
    </div>
  );
}

// ── Generic text / number input ───────────────────────────────────────────────
export function TextInput({ value, onChange, placeholder, type = 'text', min, max, step }) {
  return (
    <input
      style={formStyles.input}
      type={type}
      value={value}
      onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
    />
  );
}

// ── Blank item factories ──────────────────────────────────────────────────────
export function blankPlant() {
  return { slug: '', name: '', harvestEmoji: '🌱', growthEmojis: [], growthDays: 3, baseCoins: 10, companionGood: [], companionBad: [] };
}
export function blankStructure() {
  return { id: '', name: '', emoji: '🏗️', description: '', buildCost: 50, chargesPerDay: 1, usageLabel: 'Use' };
}
export function blankTool() {
  return { id: '', name: '', emoji: '🔧', description: '' };
}
export function blankWeather() {
  return { id: '', name: '', emoji: '🌤️', waterBonus: 0, pestChance: 0.05, stormRollback: false };
}

export const BLANK = { plants: blankPlant, structures: blankStructure, tools: blankTool, weather: blankWeather };

// ── Plant form ────────────────────────────────────────────────────────────────
export function PlantForm({ item, onChange }) {
  const updateCompanion = (kind, index, field, val) => {
    const list = [...(item[kind] || [])];
    list[index] = { ...list[index], [field]: (field === 'bonus' || field === 'penalty') ? Number(val) : val };
    onChange({ ...item, [kind]: list });
  };
  const addCompanion    = (kind) => onChange({ ...item, [kind]: [...(item[kind] || []), { slug: '', [kind === 'companionGood' ? 'bonus' : 'penalty']: 5 }] });
  const removeCompanion = (kind, i) => onChange({ ...item, [kind]: item[kind].filter((_, j) => j !== i) });

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <div style={{ flex: 2 }}>
          <Field label="Slug (unique ID, no spaces)" hint="Used in save files — must be unique.">
            <TextInput value={item.slug} onChange={(v) => onChange({ ...item, slug: v.toLowerCase().replace(/\s+/g, '_') })} placeholder="e.g. strawberry" />
          </Field>
        </div>
        <div style={{ flex: 2 }}>
          <Field label="Display name">
            <TextInput value={item.name} onChange={(v) => onChange({ ...item, name: v })} placeholder="Strawberry" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Harvest emoji">
            <TextInput value={item.harvestEmoji} onChange={(v) => onChange({ ...item, harvestEmoji: v })} placeholder="🍓" />
          </Field>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <Field label="Growth days" hint="Days to full maturity">
            <TextInput type="number" value={item.growthDays} onChange={(v) => onChange({ ...item, growthDays: v })} min={1} max={10} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Base coins">
            <TextInput type="number" value={item.baseCoins} onChange={(v) => onChange({ ...item, baseCoins: v })} min={1} max={999} />
          </Field>
        </div>
        <div style={{ flex: 2 }}>
          <Field label="Growth emojis (comma-separated)" hint="First=seedling, last=ready">
            <TextInput
              value={item.growthEmojis.join(', ')}
              onChange={(v) => onChange({ ...item, growthEmojis: v.split(',').map((s) => s.trim()).filter(Boolean) })}
              placeholder="🌱, 🌿, 🍓"
            />
          </Field>
        </div>
      </div>

      <div style={formStyles.section}>Good companions (+coins)</div>
      {(item.companionGood || []).map((c, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.3rem', alignItems: 'center' }}>
          <input style={{ ...formStyles.input, flex: 2 }} placeholder="plant slug" value={c.slug} onChange={(e) => updateCompanion('companionGood', i, 'slug', e.target.value)} />
          <input style={{ ...formStyles.input, flex: 1 }} type="number" min={1} max={50} value={c.bonus} onChange={(e) => updateCompanion('companionGood', i, 'bonus', e.target.value)} />
          <span style={{ color: '#888', fontSize: '0.75rem' }}>coins</span>
          <button style={{ ...formStyles.btn('delete'), padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => removeCompanion('companionGood', i)}>✕</button>
        </div>
      ))}
      <button style={formStyles.btn('new')} onClick={() => addCompanion('companionGood')}>+ Add</button>

      <div style={formStyles.section}>Bad companions (−coins)</div>
      {(item.companionBad || []).map((c, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.3rem', alignItems: 'center' }}>
          <input style={{ ...formStyles.input, flex: 2 }} placeholder="plant slug" value={c.slug} onChange={(e) => updateCompanion('companionBad', i, 'slug', e.target.value)} />
          <input style={{ ...formStyles.input, flex: 1 }} type="number" min={1} max={50} value={c.penalty} onChange={(e) => updateCompanion('companionBad', i, 'penalty', e.target.value)} />
          <span style={{ color: '#888', fontSize: '0.75rem' }}>coins</span>
          <button style={{ ...formStyles.btn('delete'), padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => removeCompanion('companionBad', i)}>✕</button>
        </div>
      ))}
      <button style={formStyles.btn('new')} onClick={() => addCompanion('companionBad')}>+ Add</button>
    </div>
  );
}

// ── Structure form ────────────────────────────────────────────────────────────
export function StructureForm({ item, onChange }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <Field label="ID (unique, no spaces)">
            <TextInput value={item.id} onChange={(v) => onChange({ ...item, id: v.toLowerCase().replace(/\s+/g, '_') })} placeholder="windmill" />
          </Field>
        </div>
        <div style={{ flex: 2 }}>
          <Field label="Name">
            <TextInput value={item.name} onChange={(v) => onChange({ ...item, name: v })} placeholder="Windmill" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Emoji">
            <TextInput value={item.emoji} onChange={(v) => onChange({ ...item, emoji: v })} placeholder="🏗️" />
          </Field>
        </div>
      </div>
      <Field label="Description">
        <TextInput value={item.description} onChange={(v) => onChange({ ...item, description: v })} placeholder="What does it do?" />
      </Field>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <Field label="Build cost">
            <TextInput type="number" value={item.buildCost} onChange={(v) => onChange({ ...item, buildCost: v })} min={0} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Charges/day" hint="0 = passive">
            <TextInput type="number" value={item.chargesPerDay} onChange={(v) => onChange({ ...item, chargesPerDay: v })} min={0} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Use button label">
            <TextInput value={item.usageLabel} onChange={(v) => onChange({ ...item, usageLabel: v })} placeholder="Use" />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ── Tool form ─────────────────────────────────────────────────────────────────
export function ToolForm({ item, onChange }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <Field label="ID (unique)">
            <TextInput value={item.id} onChange={(v) => onChange({ ...item, id: v.toLowerCase().replace(/\s+/g, '_') })} placeholder="shears" />
          </Field>
        </div>
        <div style={{ flex: 2 }}>
          <Field label="Name">
            <TextInput value={item.name} onChange={(v) => onChange({ ...item, name: v })} placeholder="Shears" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Emoji">
            <TextInput value={item.emoji} onChange={(v) => onChange({ ...item, emoji: v })} placeholder="✂️" />
          </Field>
        </div>
      </div>
      <Field label="Description">
        <TextInput value={item.description} onChange={(v) => onChange({ ...item, description: v })} placeholder="What does it do?" />
      </Field>
    </div>
  );
}

// ── Weather form ──────────────────────────────────────────────────────────────
export function WeatherForm({ item, onChange }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <Field label="ID (unique)">
            <TextInput value={item.id} onChange={(v) => onChange({ ...item, id: v.toLowerCase().replace(/\s+/g, '_') })} placeholder="heatwave" />
          </Field>
        </div>
        <div style={{ flex: 2 }}>
          <Field label="Name">
            <TextInput value={item.name} onChange={(v) => onChange({ ...item, name: v })} placeholder="Heat Wave" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Emoji">
            <TextInput value={item.emoji} onChange={(v) => onChange({ ...item, emoji: v })} placeholder="🌡️" />
          </Field>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <Field label="Water bonus (0–3)">
            <TextInput type="number" value={item.waterBonus} onChange={(v) => onChange({ ...item, waterBonus: v })} min={0} max={3} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Pest chance (0–1)">
            <TextInput type="number" value={item.pestChance} onChange={(v) => onChange({ ...item, pestChance: v })} min={0} max={1} step={0.01} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Storm rollback?">
            <select style={formStyles.input} value={item.stormRollback ? 'yes' : 'no'} onChange={(e) => onChange({ ...item, stormRollback: e.target.value === 'yes' })}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </Field>
        </div>
      </div>
    </div>
  );
}

// ── Form router ───────────────────────────────────────────────────────────────
export function ItemForm({ type, item, onChange }) {
  switch (type) {
    case 'plants':     return <PlantForm     item={item} onChange={onChange} />;
    case 'structures': return <StructureForm item={item} onChange={onChange} />;
    case 'tools':      return <ToolForm      item={item} onChange={onChange} />;
    case 'weather':    return <WeatherForm   item={item} onChange={onChange} />;
    default:           return null;
  }
}
