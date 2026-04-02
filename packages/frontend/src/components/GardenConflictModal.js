/**
 * Shown when POST /api/garden returns 409 — user picks server state or forces local overwrite.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';

const OVERLAY = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 800, padding: '1rem',
};
const BOX = {
  background: 'var(--panel-bg, #fff)', color: 'var(--text, #222)',
  borderRadius: '14px', maxWidth: '420px', width: '100%', padding: '1.5rem',
  boxShadow: '0 16px 48px rgba(0,0,0,0.25)',
};

export default function GardenConflictModal({ onUseServer, onForceLocal, onDismiss }) {
  const { t } = useTranslation();

  return (
    <div style={OVERLAY} role="dialog" aria-modal="true" aria-labelledby="garden-conflict-title">
      <div style={BOX}>
        <h2 id="garden-conflict-title" style={{ margin: '0 0 0.75rem', fontSize: '1.15rem' }}>
          {t('gardenConflict.title')}
        </h2>
        <p style={{ margin: '0 0 1.25rem', fontSize: '0.92rem', lineHeight: 1.5, opacity: 0.9 }}>
          {t('gardenConflict.body')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={onUseServer}
            style={{
              padding: '0.65rem 1rem', borderRadius: '10px', border: 'none',
              background: '#2e7d32', color: '#fff', fontWeight: 600, cursor: 'pointer',
            }}
          >
            {t('gardenConflict.use_server')}
          </button>
          <button
            type="button"
            onClick={onForceLocal}
            style={{
              padding: '0.65rem 1rem', borderRadius: '10px', border: '1px solid #ccc',
              background: 'transparent', cursor: 'pointer', fontWeight: 600,
            }}
          >
            {t('gardenConflict.force_local')}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            style={{
              padding: '0.4rem', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '0.85rem', opacity: 0.7,
            }}
          >
            {t('gardenConflict.dismiss')}
          </button>
        </div>
      </div>
    </div>
  );
}
