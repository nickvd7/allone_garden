/**
 * PluginConfigurator — no-code plugin settings editor.
 *
 * For each loaded plugin the admin can view and edit its JSON configuration.
 * Config is persisted to the server (DB if available, otherwise in-memory).
 * If the plugin has no configSchema the editor shows a raw JSON textarea.
 */
import React, { useState, useEffect, useCallback } from 'react';
import api from '../hooks/useApi';

// ── Per-plugin editor ─────────────────────────────────────────────────────────
function PluginEditor({ plugin, onSaved }) {
  const [raw,     setRaw]     = useState('{}');
  const [error,   setError]   = useState('');
  const [status,  setStatus]  = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const cfg = await api.get(`/api/admin/plugins/${plugin.name}/config`);
      setRaw(JSON.stringify(cfg || {}, null, 2));
    } catch (err) {
      setError(`Load failed: ${err.message}`);
      setRaw('{}');
    } finally {
      setLoading(false);
    }
  }, [plugin.name]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setError('');
    setStatus('');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setError('Invalid JSON — please fix before saving.');
      return;
    }
    setLoading(true);
    try {
      await api.put(`/api/admin/plugins/${plugin.name}/config`, parsed);
      setStatus('✅ Saved!');
      if (onSaved) onSaved(plugin.name, parsed);
    } catch (err) {
      setError(`Save failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Format helper — pretty-print the textarea content
  const handleFormat = () => {
    try {
      setRaw(JSON.stringify(JSON.parse(raw), null, 2));
      setError('');
    } catch {
      setError('Cannot format: invalid JSON.');
    }
  };

  return (
    <div style={cardStyles.card}>
      <div style={cardStyles.cardHeader}>
        <span style={cardStyles.pluginName}>{plugin.name}</span>
        <span style={cardStyles.pluginVersion}>v{plugin.version}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem' }}>
          <button style={cardStyles.btnSmall} onClick={load}       disabled={loading}>↻</button>
          <button style={cardStyles.btnSmall} onClick={handleFormat} disabled={loading}>{ }</button>
          <button style={{ ...cardStyles.btnSmall, ...cardStyles.btnSave }}
                  onClick={handleSave} disabled={loading}>
            {loading ? '…' : '💾 Save'}
          </button>
        </div>
      </div>

      {error  && <div style={cardStyles.error}>{error}</div>}
      {status && <div style={cardStyles.success}>{status}</div>}

      <textarea
        aria-label={`config-${plugin.name}`}
        style={cardStyles.textarea}
        value={raw}
        onChange={(e) => { setRaw(e.target.value); setStatus(''); }}
        spellCheck={false}
        rows={8}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function PluginConfigurator() {
  const [plugins, setPlugins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const loadPlugins = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const stats = await api.get('/api/admin/stats');
      setPlugins(stats.plugins || []);
    } catch (err) {
      setError(`Could not load plugins: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPlugins(); }, [loadPlugins]);

  if (loading) return <div style={styles.empty}>Loading plugins…</div>;
  if (error)   return <div style={styles.errBox}>{error}</div>;

  if (plugins.length === 0) {
    return (
      <div style={styles.empty}>
        No plugins loaded on this server.
        <br />
        <span style={{ fontSize: '0.85rem' }}>
          Drop plugin folders into the <code>plugins/community/</code> directory and restart.
        </span>
      </div>
    );
  }

  return (
    <div style={styles.list}>
      <p style={styles.hint}>
        Each plugin&apos;s configuration is stored as JSON. Changes take effect immediately
        (plugins read config on the next request, or after a hot-reload).
      </p>
      {plugins.map((p) => (
        <PluginEditor key={p.name} plugin={p} />
      ))}
    </div>
  );
}

const styles = {
  list:   { display: 'flex', flexDirection: 'column', gap: '1rem' },
  empty:  { color: '#aaa', textAlign: 'center', padding: '2.5rem 1rem', fontSize: '0.95rem', lineHeight: '1.8' },
  errBox: { background: '#ffebee', color: '#c62828', padding: '0.7rem 1rem', borderRadius: '6px', fontSize: '0.9rem' },
  hint:   { fontSize: '0.83rem', color: '#888', margin: '0 0 0.5rem' },
};

const cardStyles = {
  card: {
    background: '#fafafa', border: '1px solid #eee',
    borderRadius: '10px', padding: '0.9rem 1rem',
    display: 'flex', flexDirection: 'column', gap: '0.5rem',
  },
  cardHeader: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
  },
  pluginName:    { fontWeight: '700', color: '#2e7d32', fontSize: '0.92rem' },
  pluginVersion: { color: '#aaa', fontSize: '0.8rem' },
  btnSmall: {
    padding: '0.25rem 0.55rem', border: '1px solid #ddd',
    background: 'white', borderRadius: '5px', cursor: 'pointer',
    fontSize: '0.8rem', color: '#555',
  },
  btnSave: {
    background: '#e8f5e9', borderColor: '#a5d6a7', color: '#2e7d32', fontWeight: '600',
  },
  textarea: {
    width: '100%', fontFamily: 'monospace', fontSize: '0.83rem',
    border: '1px solid #ddd', borderRadius: '6px',
    padding: '0.6rem', resize: 'vertical',
    background: '#f8fff8', color: '#1a2a1a',
    boxSizing: 'border-box',
  },
  error:   { background: '#ffebee', color: '#c62828', padding: '0.35rem 0.6rem', borderRadius: '5px', fontSize: '0.82rem' },
  success: { background: '#e8f5e9', color: '#2e7d32', padding: '0.35rem 0.6rem', borderRadius: '5px', fontSize: '0.82rem' },
};

export default PluginConfigurator;
