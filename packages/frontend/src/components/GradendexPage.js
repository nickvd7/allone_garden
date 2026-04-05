/**
 * GradendexPage — standalone public page at /gradendex
 *
 * Accessible without login. Renders GradendexView in a full-page layout with
 * a minimal header. Admins see edit controls (probed via /api/gradendex/can-edit).
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import GradendexView from './GradendexView';
import { readGardenToken } from '../auth/session';

const BACKEND_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function GradendexPage() {
  const { t } = useTranslation();
  const [darkMode, setDarkMode] = useState(
    () => {
      try { return localStorage.getItem('garden_dark') === 'true'; } catch { return false; }
    }
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    try { localStorage.setItem('garden_dark', String(darkMode)); } catch {}
  }, [darkMode]);

  const token = readGardenToken();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #f1f8e9)', color: 'var(--text, #1b5e20)' }}>
      <header style={{
        background: 'linear-gradient(135deg, #2e7d32, #1b5e20)',
        color: '#fff',
        padding: '0.75rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <a
            href="/"
            style={{
              color: 'rgba(255,255,255,0.75)',
              textDecoration: 'none',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            {t('gradendex.page.brand', { defaultValue: '🌱 AllOne Garden' })}
          </a>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>›</span>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
            {t('gradendex.page.title', { defaultValue: '📖 Gradendex' })}
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {token && (
            <a
              href="/"
              style={{
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                textDecoration: 'none',
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              {t('gradendex.page.back_game', { defaultValue: '🎮 Back to game' })}
            </a>
          )}

          <button
            type="button"
            onClick={() => setDarkMode((d) => !d)}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              color: '#fff',
              borderRadius: '6px',
              padding: '0.35rem 0.6rem',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem 1rem' }}>
        <p style={{
          fontSize: '0.9rem',
          color: 'var(--text-muted, #557a60)',
          marginBottom: '1.25rem',
        }}
        >
          {t('gradendex.page.intro', {
            defaultValue: 'Community-maintained reference for every crop and structure in AllOne Garden.',
          })}
          {' '}
          {token
            ? t('gradendex.page.intro_logged_in', {
              defaultValue: 'You are logged in — admin entries can be edited directly.',
            })
            : (
              <>
                <a href="/" style={{ color: 'var(--accent, #2e7d32)', textDecoration: 'underline' }}>
                  {t('gradendex.page.log_in', { defaultValue: 'Log in' })}
                </a>
                {' '}
                {t('gradendex.page.intro_guest_after', { defaultValue: 'to contribute as an admin.' })}
              </>
            )}
        </p>

        <GradendexView token={token} compact={false} />
      </main>

      <footer style={{
        textAlign: 'center',
        padding: '1.5rem',
        fontSize: '0.8rem',
        color: 'var(--text-muted, #888)',
        borderTop: '1px solid var(--border, #c8e6c9)',
        marginTop: '2rem',
      }}
      >
        {t('gradendex.page.footer', { defaultValue: 'AllOne Garden · Gradendex · Data loaded from' })}{' '}
        <code style={{ fontSize: '0.78rem' }}>{BACKEND_URL}/api/gradendex</code>
      </footer>
    </div>
  );
}

export default GradendexPage;
