/**
 * QRPanel — Offline garden seed-packet integration.
 *
 * Two tabs:
 *  • Scanner  — camera-based QR scan → auto-plant identified crop
 *  • Generator — printable QR sticker sheet for all plant types
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// ── QR Scanner (uses html5-qrcode) ────────────────────────────────────────────
function QRScanner({ onScanSuccess, onClose: _onClose }) {
  const containerRef = useRef(null);
  const scannerRef   = useRef(null);
  const [status, setStatus]   = useState('idle'); // idle | scanning | success | error
  const [message, setMessage] = useState('');
  const [result, setResult]   = useState(null);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      try { scannerRef.current.clear(); } catch {}
      scannerRef.current = null;
    }
  }, []);

  const startScanner = useCallback(async () => {
    setStatus('scanning');
    setMessage('');
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        async (decodedText) => {
          await stopScanner();
          // Send to backend for validation
          try {
            const res  = await fetch(`${BASE}/api/qr/scan`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ code: decodedText }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Unknown QR');
            setResult(data);
            setStatus('success');
          } catch (err) {
            setStatus('error');
            setMessage(err.message);
          }
        },
        () => { /* scan errors are normal — ignore frame failures */ }
      );
    } catch (err) {
      setStatus('error');
      setMessage(
        err.message?.includes('permission')
          ? 'Camera permission denied. Please allow camera access and try again.'
          : `Could not start camera: ${err.message}`
      );
    }
  }, [stopScanner]);

  // Cleanup on unmount
  useEffect(() => () => { stopScanner(); }, [stopScanner]);

  const handleUsePlant = () => {
    if (result) onScanSuccess(result.slug);
  };

  return (
    <div style={styles.scannerWrap}>
      {status === 'idle' && (
        <div style={styles.centerCol}>
          <div style={styles.bigEmoji}>📷</div>
          <p style={styles.hint}>
            Scan an AllOne Garden QR code from a seed packet to automatically plant that crop in your garden.
          </p>
          <button style={styles.primaryBtn} onClick={startScanner}>Start Camera</button>
        </div>
      )}

      {status === 'scanning' && (
        <div>
          <div id="qr-reader" ref={containerRef} style={styles.qrReader} />
          <p style={styles.hint}>📸 Point camera at the QR code on your seed packet</p>
          <button style={styles.secondaryBtn} onClick={async () => { await stopScanner(); setStatus('idle'); }}>
            Cancel
          </button>
        </div>
      )}

      {status === 'success' && result && (
        <div style={styles.centerCol}>
          <div style={styles.bigEmoji}>✅</div>
          <p style={{ fontWeight: 700, fontSize: '1.2rem', color: '#2e7d32', margin: '0.5rem 0' }}>
            {result.name} identified!
          </p>
          <p style={styles.hint}>
            This will plant <strong>{result.name}</strong> in the next available tilled plot.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button style={styles.primaryBtn} onClick={handleUsePlant}>🌱 Plant it!</button>
            <button style={styles.secondaryBtn} onClick={() => { setStatus('idle'); setResult(null); }}>
              Scan another
            </button>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div style={styles.centerCol}>
          <div style={styles.bigEmoji}>❌</div>
          <p style={{ color: '#c62828', fontWeight: 600 }}>{message || 'Scan failed'}</p>
          <button style={styles.primaryBtn} onClick={() => setStatus('idle')}>Try again</button>
        </div>
      )}
    </div>
  );
}

// ── QR Generator (printable sticker sheet) ───────────────────────────────────
function QRGenerator() {
  const [plants, setPlants]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    setLoading(true);
    const token = localStorage.getItem('garden_token');
    fetch(`${BASE}/api/qr/sheet`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((d) => setPlants(d.plants || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: '#888', padding: '1rem' }}>Loading sticker sheet…</p>;
  if (error)   return <p style={{ color: '#c62828', padding: '1rem' }}>Error: {error}</p>;

  return (
    <div>
      <p style={styles.hint}>
        Print these QR stickers and attach them to your real seed packets. When you plant IRL, scan the code to
        sync with your digital garden. 🌱
      </p>
      <div style={styles.stickerGrid}>
        {plants.map((p) => (
          <div key={p.slug} style={styles.stickerCard}>
            <img
              src={`${BASE}${p.qrUrl}`}
              alt={`QR for ${p.name}`}
              style={styles.qrImg}
              loading="lazy"
            />
            <div style={styles.stickerLabel}>{p.name}</div>
          </div>
        ))}
      </div>
      <button
        style={{ ...styles.secondaryBtn, marginTop: '1rem' }}
        onClick={() => window.print()}
      >
        🖨️ Print sticker sheet
      </button>
    </div>
  );
}

// ── QRPanel (modal wrapper with tabs) ────────────────────────────────────────
function QRPanel({ onClose, onPlantFromQR }) {
  const [tab, setTab] = useState('scan');

  const handleScanSuccess = (slug) => {
    onPlantFromQR(slug);
    onClose();
  };

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>🌿 Garden QR</h2>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.tabs}>
          {[['scan', '📷 Scan'], ['generate', '🖨️ Sticker Sheet']].map(([id, label]) => (
            <button
              key={id}
              style={{ ...styles.tab, ...(tab === id ? styles.tabActive : {}) }}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={styles.body}>
          {tab === 'scan'     && <QRScanner onScanSuccess={handleScanSuccess} onClose={onClose} />}
          {tab === 'generate' && <QRGenerator />}
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 700, padding: '1rem',
  },
  modal: {
    background: 'white', borderRadius: '14px',
    width: '100%', maxWidth: '540px', maxHeight: '88vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '1.25rem 1.5rem', borderBottom: '1px solid #eee',
    background: '#f9fbe7',
  },
  title:    { margin: 0, color: '#2e7d32', fontSize: '1.2rem', flex: 1 },
  closeBtn: { border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#555' },
  tabs: {
    display: 'flex', borderBottom: '1px solid #eee',
  },
  tab: {
    flex: 1, padding: '0.75rem 1rem', border: 'none',
    background: 'none', cursor: 'pointer', fontWeight: 600,
    color: '#888', fontSize: '0.9rem',
  },
  tabActive: {
    color: '#2e7d32', borderBottom: '2px solid #4caf50',
  },
  body: { flex: 1, overflowY: 'auto', padding: '1.5rem' },
  scannerWrap: { minHeight: '280px' },
  centerCol: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    textAlign: 'center', gap: '0.75rem',
  },
  bigEmoji:  { fontSize: '3rem' },
  hint:      { color: '#666', fontSize: '0.88rem', lineHeight: 1.5, margin: 0 },
  qrReader:  { width: '100%', maxWidth: '280px', margin: '0 auto' },
  primaryBtn: {
    padding: '0.6rem 1.4rem', background: '#4caf50', color: 'white',
    border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem',
  },
  secondaryBtn: {
    padding: '0.55rem 1.2rem', background: 'white', color: '#555',
    border: '1.5px solid #ccc', borderRadius: '8px', cursor: 'pointer', fontSize: '0.88rem',
  },
  stickerGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
    gap: '1rem', marginTop: '1rem',
  },
  stickerCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    border: '1px solid #e0e0e0', borderRadius: '8px', padding: '0.6rem',
    background: '#fafafa',
  },
  qrImg:        { width: '90px', height: '90px' },
  stickerLabel: { marginTop: '0.4rem', fontSize: '0.78rem', fontWeight: 600, color: '#333', textAlign: 'center' },
};

export default QRPanel;
