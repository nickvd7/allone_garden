/**
 * PlantRecognitionModal — AI-powered plant photo identification.
 *
 * User uploads or captures a photo → backend calls their chosen AI provider
 * (OpenAI / Anthropic / Gemini) → identified plant is offered for auto-planting.
 *
 * API keys are read from localStorage (stored by AccountSettings) and are
 * NEVER persisted server-side.
 */
import React, { useState, useRef } from 'react';

const BASE = process.env.REACT_APP_API_URL || '';

const PROVIDERS = [
  { id: 'openai',    label: 'OpenAI (GPT-4o mini)',     storageKey: 'garden_apikey_openai',    docsUrl: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', label: 'Anthropic (Claude Haiku)', storageKey: 'garden_apikey_anthropic', docsUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'gemini',    label: 'Google Gemini Flash',       storageKey: 'garden_apikey_gemini',    docsUrl: 'https://aistudio.google.com/app/apikey' },
];

function getStoredKey(providerId) {
  const p = PROVIDERS.find((x) => x.id === providerId);
  return p ? (localStorage.getItem(p.storageKey) || '') : '';
}

export default function PlantRecognitionModal({ onClose, onPlantIdentified, embedded = false }) {
  const [provider,    setProvider]    = useState('openai');
  const [apiKey,      setApiKey]      = useState(() => getStoredKey('openai'));
  const [imageData,   setImageData]   = useState(null);  // base64 string
  const [mimeType,    setMimeType]    = useState('image/jpeg');
  const [preview,     setPreview]     = useState(null);  // data URL for <img>
  const [status,      setStatus]      = useState('idle'); // idle|loading|success|error
  const [result,      setResult]      = useState(null);
  const [errorMsg,    setErrorMsg]    = useState('');
  const [saveKey,     setSaveKey]     = useState(false);
  const fileRef = useRef();
  const cameraRef = useRef();

  const handleProviderChange = (id) => {
    setProvider(id);
    setApiKey(getStoredKey(id));
  };

  const loadImageFile = (file) => {
    if (!file) return;
    const mime = file.type || 'image/jpeg';
    setMimeType(mime);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      setPreview(dataUrl);
      // Extract base64 portion only (strip data:image/...;base64,)
      setImageData(dataUrl.split(',')[1]);
    };
    reader.readAsDataURL(file);
  };

  const handleIdentify = async () => {
    if (!imageData) { setErrorMsg('Please select or capture a photo first.'); return; }
    if (!apiKey.trim()) { setErrorMsg('Please enter your API key.'); return; }

    if (saveKey) {
      const p = PROVIDERS.find((x) => x.id === provider);
      if (p) localStorage.setItem(p.storageKey, apiKey.trim());
    }

    setStatus('loading');
    setErrorMsg('');
    setResult(null);

    try {
      const res = await fetch(`${BASE}/api/recognize/plant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData, mimeType, provider, apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Recognition failed');
      setResult(data);
      setStatus('success');
    } catch (err) {
      setErrorMsg(err.message);
      setStatus('error');
    }
  };

  const handleUsePlant = () => {
    if (result?.slug) {
      onPlantIdentified(result.slug);
      onClose();
    }
  };

  const currentProvider = PROVIDERS.find((p) => p.id === provider);

  const inner = (
    <>
        {!embedded && (
        <div style={s.header}>
          <h2 style={s.title}>🌿 Plant Recognition</h2>
          <button type="button" style={s.closeBtn} onClick={onClose}>✕</button>
        </div>
        )}

        <div style={embedded ? s.embeddedBody : s.body}>
          {/* Provider + API key */}
          <div style={s.section}>
            <label style={s.label}>AI Provider</label>
            <select
              style={s.select}
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value)}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>

            <label style={{ ...s.label, marginTop: '0.75rem' }}>
              API Key
              {' '}
              <a href={currentProvider?.docsUrl} target="_blank" rel="noreferrer" style={s.link}>
                Get key ↗
              </a>
            </label>
            <input
              type="password"
              placeholder="sk-... / sk-ant-... / AIza..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={s.input}
              autoComplete="off"
            />
            <label style={s.checkLabel}>
              <input
                type="checkbox"
                checked={saveKey}
                onChange={(e) => setSaveKey(e.target.checked)}
              />
              {' '}Save key locally (localStorage only, never sent to our server except this request)
            </label>
          </div>

          {/* Photo input */}
          <div style={s.section}>
            <label style={s.label}>Photo</label>
            <div style={s.photoRow}>
              <button style={s.secondaryBtn} onClick={() => fileRef.current?.click()}>
                📁 Choose file
              </button>
              <button style={s.secondaryBtn} onClick={() => cameraRef.current?.click()}>
                📷 Take photo
              </button>
            </div>
            <input ref={fileRef}   type="file" accept="image/*"          style={{ display: 'none' }} onChange={(e) => loadImageFile(e.target.files[0])} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => loadImageFile(e.target.files[0])} />

            {preview && (
              <img src={preview} alt="Plant to identify" style={s.preview} />
            )}
          </div>

          {/* Error */}
          {(status === 'error' || errorMsg) && (
            <p style={s.errorText}>{errorMsg}</p>
          )}

          {/* Result */}
          {status === 'success' && result && (
            <div style={s.result}>
              <div style={s.resultTitle}>
                {result.confidence >= 70 ? '✅' : '⚠️'} {result.plant}
                <span style={s.confidence}>{result.confidence}%</span>
              </div>
              {result.description && <p style={s.resultDesc}>{result.description}</p>}
              {result.slug ? (
                <div style={s.btnRow}>
                  <button style={s.primaryBtn} onClick={handleUsePlant}>
                    🌱 Plant <strong>{result.slug}</strong> in garden
                  </button>
                  <button style={s.secondaryBtn} onClick={() => setStatus('idle')}>
                    Try again
                  </button>
                </div>
              ) : (
                <p style={{ color: '#888', fontSize: '0.85rem' }}>
                  Plant not in the game catalogue — try a different photo or crop type.
                </p>
              )}
            </div>
          )}

          {/* Identify button */}
          {status !== 'success' && (
            <button
              style={{ ...s.primaryBtn, width: '100%', marginTop: '0.5rem' }}
              onClick={handleIdentify}
              disabled={status === 'loading' || !imageData}
            >
              {status === 'loading' ? '🔍 Identifying…' : '🔍 Identify Plant'}
            </button>
          )}

          <p style={s.privacyNote}>
            🔒 Your API key is sent only to the selected provider via our server proxy. It is never stored or logged.
          </p>
        </div>
    </>
  );

  if (embedded) {
    return <div className="plant-recognition-embedded">{inner}</div>;
  }

  return (
    <div style={s.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>
        {inner}
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 750, padding: '1rem',
  },
  modal: {
    background: 'white', borderRadius: '14px',
    width: '100%', maxWidth: '500px', maxHeight: '90vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '1.25rem 1.5rem', borderBottom: '1px solid #eee',
    background: '#f9fbe7',
  },
  title:   { margin: 0, color: '#2e7d32', fontSize: '1.2rem', flex: 1 },
  closeBtn:{ border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#555' },
  body:    { flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  embeddedBody: { padding: '0.5rem 0.25rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  section: { marginBottom: '0.75rem' },
  label:   { display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#444', marginBottom: '0.35rem' },
  select:  { width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #ccc', fontSize: '0.9rem' },
  input:   { width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #ccc', fontSize: '0.9rem', boxSizing: 'border-box' },
  checkLabel: { display: 'flex', alignItems: 'flex-start', gap: '0.4rem', fontSize: '0.78rem', color: '#666', marginTop: '0.4rem', lineHeight: 1.4 },
  link:    { color: '#388e3c', fontSize: '0.78rem' },
  photoRow:{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' },
  preview: { width: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #eee', marginTop: '0.5rem' },
  primaryBtn: {
    padding: '0.6rem 1.25rem', background: '#4caf50', color: 'white',
    border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem',
  },
  secondaryBtn: {
    padding: '0.55rem 1rem', background: 'white', color: '#555',
    border: '1.5px solid #ccc', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem',
  },
  errorText:   { color: '#c62828', fontWeight: 600, fontSize: '0.88rem', margin: '0.5rem 0' },
  result:      { background: '#f9fbe7', borderRadius: '10px', padding: '1rem', marginBottom: '0.5rem' },
  resultTitle: { fontWeight: 700, fontSize: '1.05rem', color: '#2e7d32', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' },
  confidence:  { fontSize: '0.8rem', color: '#888', background: '#e8f5e9', padding: '0.1rem 0.4rem', borderRadius: '4px' },
  resultDesc:  { fontSize: '0.85rem', color: '#555', margin: '0.35rem 0 0.75rem' },
  btnRow:      { display: 'flex', gap: '0.75rem', flexWrap: 'wrap' },
  privacyNote: { fontSize: '0.75rem', color: '#aaa', marginTop: '0.75rem', lineHeight: 1.4 },
};
