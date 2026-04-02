/**
 * GradendexPanel — in-game modal overlay for the Gradendex wiki
 *
 * Wraps GradendexView in a full-screen modal with a close button.
 * Passes the player's JWT so admins get edit controls inline.
 */
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import GradendexView from './GradendexView';

const OVERLAY = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  zIndex: 1300,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '2vh 1rem',
  overflowY: 'auto',
};

const PANEL = {
  background: 'var(--card-bg, #fff)',
  borderRadius: '14px',
  boxShadow: '0 8px 48px rgba(0,0,0,0.3)',
  width: '100%',
  maxWidth: '960px',
  maxHeight: '94vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const PANEL_HEADER = {
  background: 'linear-gradient(135deg, #2e7d32, #1b5e20)',
  color: '#fff',
  padding: '0.85rem 1.25rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexShrink: 0,
};

const CLOSE_BTN = {
  background: 'rgba(255,255,255,0.15)',
  border: 'none',
  color: '#fff',
  borderRadius: '6px',
  padding: '0.3rem 0.65rem',
  cursor: 'pointer',
  fontSize: '1rem',
  lineHeight: 1,
};

function GradendexPanel({ token = null, onClose }) {
  const { t } = useTranslation();
  // Close on Escape key
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Close when clicking on the dark backdrop (not the panel itself)
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      style={OVERLAY}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={t('gradendex.page.aria_dialog', { defaultValue: 'Gradendex' })}
    >
      <div style={PANEL}>
        {/* ── Panel header ── */}
        <div style={PANEL_HEADER}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.3rem' }}>📖</span>
            <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>
              {t('gradendex.page.title', { defaultValue: '📖 Gradendex' })}
            </span>
            <span style={{ fontSize: '0.8rem', opacity: 0.7, marginLeft: '0.3rem' }}>
              {t('gradendex.page.subtitle', { defaultValue: '— crop & structure reference' })}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {/* Open in full page */}
            <a
              href="/gradendex"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                ...CLOSE_BTN,
                textDecoration: 'none',
                fontSize: '0.82rem',
                padding: '0.3rem 0.7rem',
              }}
              title={t('gradendex.page.open_full_title', { defaultValue: 'Open Gradendex in full page' })}
            >
              {t('gradendex.page.open_full', { defaultValue: '↗ Full page' })}
            </a>
            <button type="button" onClick={onClose} style={CLOSE_BTN} title={t('gradendex.page.close', { defaultValue: 'Close Gradendex' })}>
              ✕
            </button>
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
          <GradendexView token={token} compact={true} />
        </div>
      </div>
    </div>
  );
}

export default GradendexPanel;
