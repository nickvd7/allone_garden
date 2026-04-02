/**
 * SetupWizard — Electron first-run configuration wizard
 *
 * Shown when the desktop app starts for the first time (no config.json yet).
 * Three steps:
 *   1. Welcome
 *   2. Mode — Local server OR Connect to existing server
 *   3. Configure — server name + port (local) OR server URL (remote)
 *
 * On completion calls window.electronAPI.completeSetup(config).
 */
import React, { useState } from 'react';

const STEP_WELCOME   = 0;
const STEP_MODE      = 1;
const STEP_CONFIGURE = 2;
const STEP_STARTING  = 3;

// ── Shared styles ─────────────────────────────────────────────────────────────
const W = {
  overlay: {
    position:        'fixed',
    inset:           0,
    background:      'linear-gradient(160deg, #1b5e20 0%, #2e7d32 50%, #388e3c 100%)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    fontFamily:      "'Segoe UI', system-ui, sans-serif",
    color:           '#fff',
    padding:         '1.5rem',
  },
  card: {
    background:    'rgba(255,255,255,0.08)',
    backdropFilter:'blur(12px)',
    border:        '1px solid rgba(255,255,255,0.18)',
    borderRadius:  '20px',
    padding:       '2.5rem 2rem',
    maxWidth:      '480px',
    width:         '100%',
    boxShadow:     '0 20px 60px rgba(0,0,0,0.3)',
    textAlign:     'center',
  },
  h1: {
    fontSize:    '1.5rem',
    fontWeight:  800,
    margin:      '0 0 0.4rem',
    letterSpacing: '-0.02em',
  },
  sub: {
    fontSize:    '0.9rem',
    opacity:     0.75,
    margin:      '0 0 2rem',
    lineHeight:  1.5,
  },
  btnPrimary: {
    background:    '#4caf50',
    color:         '#fff',
    border:        'none',
    borderRadius:  '10px',
    padding:       '0.75rem 2rem',
    fontSize:      '1rem',
    fontWeight:    700,
    cursor:        'pointer',
    width:         '100%',
    marginTop:     '0.5rem',
    transition:    'background 0.15s',
  },
  btnSecondary: {
    background:    'rgba(255,255,255,0.12)',
    color:         '#fff',
    border:        '1.5px solid rgba(255,255,255,0.3)',
    borderRadius:  '10px',
    padding:       '0.6rem 1.5rem',
    fontSize:      '0.9rem',
    fontWeight:    600,
    cursor:        'pointer',
    marginTop:     '0.5rem',
    transition:    'background 0.15s',
  },
  input: {
    width:          '100%',
    padding:        '0.65rem 0.9rem',
    borderRadius:   '8px',
    border:         '1.5px solid rgba(255,255,255,0.3)',
    background:     'rgba(255,255,255,0.1)',
    color:          '#fff',
    fontSize:       '0.95rem',
    outline:        'none',
    boxSizing:      'border-box',
  },
  label: {
    display:     'block',
    textAlign:   'left',
    fontSize:    '0.78rem',
    fontWeight:  700,
    opacity:     0.75,
    marginBottom:'0.3rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  fieldGroup: {
    marginBottom: '1rem',
    textAlign:    'left',
  },
  error: {
    color:       '#ffcdd2',
    fontSize:    '0.82rem',
    marginTop:   '0.5rem',
    textAlign:   'left',
  },
  modeCard: {
    background:    'rgba(255,255,255,0.08)',
    border:        '2px solid rgba(255,255,255,0.2)',
    borderRadius:  '14px',
    padding:       '1.2rem 1rem',
    cursor:        'pointer',
    textAlign:     'left',
    flex:          1,
    transition:    'border-color 0.15s, background 0.15s',
  },
  modeCardActive: {
    border:     '2px solid #a5d6a7',
    background: 'rgba(165,214,167,0.15)',
  },
  modeRow: {
    display:        'flex',
    gap:            '1rem',
    marginBottom:   '1.5rem',
  },
  modeEmoji: { fontSize: '2rem', lineHeight: 1, marginBottom: '0.5rem' },
  modeTitle: { fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.25rem' },
  modeDesc:  { fontSize: '0.78rem', opacity: 0.7, lineHeight: 1.45 },
  dots: {
    display:        'flex',
    justifyContent: 'center',
    gap:            '6px',
    marginBottom:   '1.75rem',
  },
  dot: {
    width:  8, height: 8,
    borderRadius: '50%',
    background:   'rgba(255,255,255,0.3)',
    transition:   'background 0.2s',
  },
  dotActive: { background: '#a5d6a7' },
};

// ── Step 0: Welcome ──────────────────────────────────────────────────────────
function StepWelcome({ onNext }) {
  return (
    <>
      <div style={{ fontSize: '3.5rem', lineHeight: 1, marginBottom: '1rem' }}>🌱</div>
      <h1 style={W.h1}>Welcome to AllOne Garden!</h1>
      <p style={W.sub}>
        Open-source, community-owned gardening game.<br />
        Let&apos;s get you set up in just a few seconds.
      </p>
      <button style={W.btnPrimary} onClick={onNext}>
        Get Started →
      </button>
    </>
  );
}

// ── Step 1: Mode selection ───────────────────────────────────────────────────
function StepMode({ mode, onSelectMode, onNext, onBack }) {
  return (
    <>
      <h1 style={{ ...W.h1, fontSize: '1.2rem' }}>How do you want to play?</h1>
      <p style={{ ...W.sub, margin: '0 0 1.5rem' }}>
        You can always change this later.
      </p>

      <div style={W.modeRow}>
        <button
          style={{ ...W.modeCard, ...(mode === 'local' ? W.modeCardActive : {}), border: mode === 'local' ? '2px solid #a5d6a7' : '2px solid rgba(255,255,255,0.2)', background: mode === 'local' ? 'rgba(165,214,167,0.15)' : 'rgba(255,255,255,0.08)' }}
          onClick={() => onSelectMode('local')}
          aria-pressed={mode === 'local'}
        >
          <div style={W.modeEmoji}>🌱</div>
          <div style={W.modeTitle}>Local server</div>
          <div style={W.modeDesc}>
            Runs entirely on your computer. No internet required.
            Perfect for solo play or LAN parties.
          </div>
        </button>

        <button
          style={{ ...W.modeCard, border: mode === 'remote' ? '2px solid #a5d6a7' : '2px solid rgba(255,255,255,0.2)', background: mode === 'remote' ? 'rgba(165,214,167,0.15)' : 'rgba(255,255,255,0.08)' }}
          onClick={() => onSelectMode('remote')}
          aria-pressed={mode === 'remote'}
        >
          <div style={W.modeEmoji}>🌍</div>
          <div style={W.modeTitle}>Join a server</div>
          <div style={W.modeDesc}>
            Connect to a community-hosted server.
            Play with friends across the internet.
          </div>
        </button>
      </div>

      <button style={W.btnPrimary} onClick={onNext} disabled={!mode}>
        Next →
      </button>
      <br />
      <button style={W.btnSecondary} onClick={onBack}>
        ← Back
      </button>
    </>
  );
}

// ── Step 2: Configure ────────────────────────────────────────────────────────
function StepConfigure({ mode, localConfig, remoteConfig, onLocalChange, onRemoteChange, onFinish, onBack, error, saving }) {
  if (mode === 'local') {
    return (
      <>
        <h1 style={{ ...W.h1, fontSize: '1.15rem' }}>Configure your local server</h1>
        <p style={{ ...W.sub, margin: '0 0 1.5rem' }}>
          The server runs silently in the background on your computer.
        </p>

        <div style={W.fieldGroup}>
          <label style={W.label} htmlFor="serverName">Server name (shown to other players)</label>
          <input
            id="serverName"
            style={W.input}
            value={localConfig.serverName}
            onChange={(e) => onLocalChange('serverName', e.target.value)}
            placeholder="My Garden"
            maxLength={50}
          />
        </div>

        <div style={W.fieldGroup}>
          <label style={W.label} htmlFor="port">Port (default: 5000)</label>
          <input
            id="port"
            style={W.input}
            type="number"
            min={1024}
            max={65535}
            value={localConfig.port}
            onChange={(e) => onLocalChange('port', Number(e.target.value))}
          />
          <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '0.3rem', textAlign: 'left' }}>
            Only change this if port 5000 is already in use on your system.
          </div>
        </div>

        {error && <div style={W.error}>{error}</div>}

        <button style={W.btnPrimary} onClick={onFinish} disabled={saving}>
          {saving ? '🌱 Starting…' : '🌱 Start playing!'}
        </button>
        <br />
        <button style={W.btnSecondary} onClick={onBack} disabled={saving}>
          ← Back
        </button>
      </>
    );
  }

  // Remote mode
  return (
    <>
      <h1 style={{ ...W.h1, fontSize: '1.15rem' }}>Connect to a server</h1>
      <p style={{ ...W.sub, margin: '0 0 1.5rem' }}>
        Enter the address of the AllOne Garden server you want to join.
      </p>

      <div style={W.fieldGroup}>
        <label style={W.label} htmlFor="serverUrl">Server URL</label>
        <input
          id="serverUrl"
          style={W.input}
          type="url"
          value={remoteConfig.serverUrl}
          onChange={(e) => onRemoteChange('serverUrl', e.target.value)}
          placeholder="https://garden.example.com"
        />
        <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '0.3rem', textAlign: 'left' }}>
          Ask the server admin for the address, or find community servers at{' '}
          <button
            style={{ background: 'none', border: 'none', color: '#a5d6a7', cursor: 'pointer', padding: 0, fontSize: '0.75rem', textDecoration: 'underline' }}
            onClick={() => window.electronAPI?.openExternal('https://github.com/allone-garden/community')}
          >
            github.com/allone-garden/community
          </button>.
        </div>
      </div>

      {error && <div style={W.error}>{error}</div>}

      <button
        style={W.btnPrimary}
        onClick={onFinish}
        disabled={saving || !remoteConfig.serverUrl.trim()}
      >
        {saving ? 'Connecting…' : '🌍 Connect!'}
      </button>
      <br />
      <button style={W.btnSecondary} onClick={onBack} disabled={saving}>
        ← Back
      </button>
    </>
  );
}

// ── Step 3: Starting ─────────────────────────────────────────────────────────
function StepStarting({ mode }) {
  return (
    <>
      <div style={{ fontSize: '3rem', lineHeight: 1, marginBottom: '1rem', animation: 'spin 2s linear infinite' }}>🌱</div>
      <h1 style={W.h1}>
        {mode === 'local' ? 'Starting your garden…' : 'Connecting…'}
      </h1>
      <p style={W.sub}>
        {mode === 'local'
          ? 'Setting up the local server. This takes just a moment.'
          : 'Connecting to the server. The game will open shortly.'}
      </p>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

// ── Progress dots ─────────────────────────────────────────────────────────────
function ProgressDots({ step, total }) {
  return (
    <div style={W.dots}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ ...W.dot, ...(i === step ? W.dotActive : {}) }} />
      ))}
    </div>
  );
}

// ── Main SetupWizard ──────────────────────────────────────────────────────────
function SetupWizard() {
  const [step,   setStep]  = useState(STEP_WELCOME);
  const [mode,   setMode]  = useState('');
  const [error,  setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [localConfig, setLocalConfig]   = useState({ serverName: 'My Garden', port: 5000 });
  const [remoteConfig, setRemoteConfig] = useState({ serverUrl: '' });

  const handleLocalChange  = (k, v) => setLocalConfig((p) => ({ ...p, [k]: v }));
  const handleRemoteChange = (k, v) => setRemoteConfig((p) => ({ ...p, [k]: v }));

  const handleFinish = async () => {
    setError('');
    setSaving(true);

    let config;
    if (mode === 'local') {
      if (!localConfig.serverName.trim()) {
        setError('Please enter a server name.');
        setSaving(false);
        return;
      }
      config = { mode: 'local', serverName: localConfig.serverName.trim(), port: localConfig.port || 5000 };
    } else {
      const url = remoteConfig.serverUrl.trim();
      if (!url) {
        setError('Please enter a server URL.');
        setSaving(false);
        return;
      }
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        setError('URL must start with http:// or https://');
        setSaving(false);
        return;
      }
      config = { mode: 'remote', serverUrl: url };
    }

    setStep(STEP_STARTING);

    try {
      // Pass config to main process — it will save and launch the game
      if (window.electronAPI) {
        await window.electronAPI.completeSetup(config);
        // Main process will close this window and open the game window — no return expected
      } else {
        // Non-electron dev fallback: just reload
        console.log('Setup complete (non-electron):', config);
        window.location.hash = '';
        window.location.reload();
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setSaving(false);
      setStep(STEP_CONFIGURE);
    }
  };

  const TOTAL_DOTS = 3; // welcome, mode, configure

  return (
    <div style={W.overlay} role="main" aria-label="Setup wizard">
      <div style={W.card}>
        {step < TOTAL_DOTS && (
          <ProgressDots step={step} total={TOTAL_DOTS} />
        )}

        {step === STEP_WELCOME && (
          <StepWelcome onNext={() => setStep(STEP_MODE)} />
        )}

        {step === STEP_MODE && (
          <StepMode
            mode={mode}
            onSelectMode={setMode}
            onNext={() => setStep(STEP_CONFIGURE)}
            onBack={() => setStep(STEP_WELCOME)}
          />
        )}

        {step === STEP_CONFIGURE && (
          <StepConfigure
            mode={mode}
            localConfig={localConfig}
            remoteConfig={remoteConfig}
            onLocalChange={handleLocalChange}
            onRemoteChange={handleRemoteChange}
            onFinish={handleFinish}
            onBack={() => setStep(STEP_MODE)}
            error={error}
            saving={saving}
          />
        )}

        {step === STEP_STARTING && (
          <StepStarting mode={mode} />
        )}
      </div>
    </div>
  );
}

export default SetupWizard;
