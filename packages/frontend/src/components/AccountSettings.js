/**
 * AccountSettings — GDPR data export and account deletion.
 *
 * Accessible from the header menu (logged-in users only).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api, { RateLimitError } from '../hooks/useApi';
import {
  clearGardenToken,
  getBearerAuthHeader,
  getFetchCredentials,
} from '../auth/session';

const OVERLAY = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const MODAL = {
  background: '#fff', borderRadius: '12px', padding: '32px',
  width: '100%', maxWidth: '420px', maxHeight: '90vh', overflowY: 'auto',
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
};
const SECTION = { marginBottom: '28px' };
const BTN_BASE = {
  padding: '10px 20px', borderRadius: '8px', border: 'none',
  cursor: 'pointer', fontWeight: 600, fontSize: '14px',
};
const BTN_PRIMARY  = { ...BTN_BASE, background: '#388e3c', color: '#fff' };
const BTN_DANGER   = { ...BTN_BASE, background: '#c62828', color: '#fff' };
const BTN_CANCEL   = { ...BTN_BASE, background: '#eee',    color: '#333' };
const INPUT_STYLE  = {
  width: '100%', padding: '10px 12px', borderRadius: '8px',
  border: '1px solid #ccc', fontSize: '14px', boxSizing: 'border-box',
  marginTop: '8px',
};

const AI_PROVIDERS = [
  { id: 'openai',    label: 'OpenAI',    storageKey: 'garden_apikey_openai',    placeholder: 'sk-…',        docsUrl: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', label: 'Anthropic', storageKey: 'garden_apikey_anthropic', placeholder: 'sk-ant-…',   docsUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'gemini',    label: 'Gemini',    storageKey: 'garden_apikey_gemini',    placeholder: 'AIza…',      docsUrl: 'https://aistudio.google.com/app/apikey' },
];

export default function AccountSettings({ onClose, onDeleted }) {
  const { t } = useTranslation();
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm,  setDeleteConfirm]  = useState(false);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState(null);
  const [pwSuccess,      setPwSuccess]      = useState(false);
  const [emailDailyDigestEnabled, setEmailDailyDigestEnabled] = useState(true);
  const [emailWeeklyDigestEnabled, setEmailWeeklyDigestEnabled] = useState(true);
  const [prefsLoading, setPrefsLoading] = useState(true);

  useEffect(() => {
    api.get('/api/account/preferences')
      .then((data) => {
        setEmailDailyDigestEnabled(data?.emailDailyDigestEnabled !== false);
        setEmailWeeklyDigestEnabled(data?.emailWeeklyDigestEnabled !== false);
      })
      .catch(() => {})
      .finally(() => setPrefsLoading(false));
  }, []);

  const patchPrefs = useCallback((patch) => {
    api.patch('/api/account/preferences', patch).catch(() => {
      setError(t('account_prefs_save_failed', { defaultValue: 'Kon voorkeur niet opslaan' }));
      throw new Error('save failed');
    });
  }, [t]);

  const handleDailyDigestToggle = useCallback((enabled) => {
    setEmailDailyDigestEnabled(enabled);
    patchPrefs({ emailDailyDigestEnabled: enabled }).catch(() => {
      setEmailDailyDigestEnabled(!enabled);
    });
  }, [patchPrefs]);

  const handleWeeklyDigestToggle = useCallback((enabled) => {
    setEmailWeeklyDigestEnabled(enabled);
    patchPrefs({ emailWeeklyDigestEnabled: enabled }).catch(() => {
      setEmailWeeklyDigestEnabled(!enabled);
    });
  }, [patchPrefs]);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw,     setNewPw]     = useState('');
  const [newPw2,    setNewPw2]    = useState('');

  // ── AI API keys (sessionStorage — cleared when tab closes, never sent to server) ──
  const [apiKeys, setApiKeys] = useState(() =>
    Object.fromEntries(AI_PROVIDERS.map((p) => [p.id, sessionStorage.getItem(p.storageKey) || '']))
  );
  const [keySaved, setKeySaved] = useState(null); // provider id that was last saved

  const handleSaveKey = (providerId) => {
    const p = AI_PROVIDERS.find((x) => x.id === providerId);
    if (!p) return;
    const val = apiKeys[providerId].trim();
    if (val) {
      sessionStorage.setItem(p.storageKey, val);
    } else {
      sessionStorage.removeItem(p.storageKey);
    }
    setKeySaved(providerId);
    setTimeout(() => setKeySaved(null), 2000);
  };

  // ── Change password ─────────────────────────────────────────────────────────
  const handleChangePassword = async () => {
    setError(null);
    setPwSuccess(false);
    if (newPw !== newPw2) { setError('New passwords do not match.'); return; }
    setLoading(true);
    // Use native fetch for PATCH (api helper only covers get/post/delete)
    try {
      const res = await fetch(
        `${process.env.REACT_APP_API_URL || ''}/api/account/password`,
        {
          method:      'PATCH',
          credentials: getFetchCredentials(),
          headers:     {
            'Content-Type': 'application/json',
            ...getBearerAuthHeader(),
          },
          body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
        }
      );
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Password change failed.'); }
      else { setPwSuccess(true); setCurrentPw(''); setNewPw(''); setNewPw2(''); }
    } catch {
      setError('Password change failed — are you online?');
    } finally {
      setLoading(false);
    }
  };

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setError(null);
    setLoading(true);
    try {
      // Use raw fetch so we can handle the blob download
      const res = await fetch(
        `${process.env.REACT_APP_API_URL || ''}/api/account/export`,
        {
          credentials: getFetchCredentials(),
          headers:     { ...getBearerAuthHeader() },
        }
      );
      if (res.status === 429) { setError('Too many requests — please wait.'); return; }
      if (!res.ok) { setError('Export failed.'); return; }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'allone-garden-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Export failed — are you online?');
    } finally {
      setLoading(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deletePassword) { setError('Enter your password to confirm.'); return; }
    setError(null);
    setLoading(true);
    try {
      await api.delete('/api/account', { password: deletePassword });
      try {
        await fetch(
          `${process.env.REACT_APP_API_URL || ''}/api/auth/logout`,
          { method: 'POST', credentials: getFetchCredentials() }
        );
      } catch { /* ignore */ }
      clearGardenToken();
      onDeleted();
    } catch (err) {
      if (err instanceof RateLimitError) {
        setError('Too many requests — please wait.');
      } else {
        setError(err.message || 'Deletion failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={OVERLAY}>
      <div style={MODAL}>
        <h2 style={{ marginTop: 0, marginBottom: '24px' }}>{t('account_settings', { defaultValue: 'Account Settings' })}</h2>

        {/* E-mailnotificaties */}
        <div style={SECTION}>
          <h3 style={{ marginTop: 0 }}>📬 {t('account_email_notifications', { defaultValue: 'E-mailnotificaties' })}</h3>
          <p style={{ color: '#555', fontSize: '14px', margin: '0 0 12px' }}>
            {t('account_email_notifications_help', {
              defaultValue: 'Alleen mail als er iets te melden valt. Dagelijks: berichten, ruilvoorstellen, samenwerking en markt. Wekelijks: tuinoverzicht met je resultaten.',
            })}
          </p>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px', cursor: prefsLoading ? 'wait' : 'pointer' }}>
            <input
              type="checkbox"
              checked={emailDailyDigestEnabled}
              disabled={prefsLoading}
              onChange={(e) => handleDailyDigestToggle(e.target.checked)}
              style={{ marginTop: '3px' }}
            />
            <span style={{ fontSize: '14px', lineHeight: 1.45 }}>
              {t('account_email_daily_toggle', { defaultValue: 'Dagelijkse samenvatting (max. 1× per dag)' })}
            </span>
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: prefsLoading ? 'wait' : 'pointer' }}>
            <input
              type="checkbox"
              checked={emailWeeklyDigestEnabled}
              disabled={prefsLoading}
              onChange={(e) => handleWeeklyDigestToggle(e.target.checked)}
              style={{ marginTop: '3px' }}
            />
            <span style={{ fontSize: '14px', lineHeight: 1.45 }}>
              {t('account_email_weekly_toggle', { defaultValue: 'Wekelijks tuinoverzicht' })}
            </span>
          </label>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '0 0 24px' }} />

        {/* AI API keys */}
        <div style={SECTION}>
          <h3 style={{ marginTop: 0 }}>🌿 Plant Recognition API keys</h3>
          <p style={{ color: '#555', fontSize: '14px', margin: '0 0 12px' }}>
            Used only for the Plant Recognition feature. Keys are stored in your browser session only (cleared when you close the tab) — never sent to our server.
          </p>
          {AI_PROVIDERS.map((p) => (
            <div key={p.id} style={{ marginBottom: '10px' }}>
              <label style={{ fontWeight: 600, fontSize: '13px', color: '#444', display: 'block', marginBottom: '4px' }}>
                {p.label}{' '}
                <a href={p.docsUrl} target="_blank" rel="noreferrer" style={{ color: '#388e3c', fontWeight: 400, fontSize: '12px' }}>
                  Get key ↗
                </a>
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="password"
                  style={{ ...INPUT_STYLE, marginTop: 0, flex: 1 }}
                  placeholder={p.placeholder}
                  value={apiKeys[p.id]}
                  onChange={(e) => setApiKeys((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  autoComplete="off"
                />
                <button
                  style={{ ...BTN_PRIMARY, padding: '8px 14px', fontSize: '13px', whiteSpace: 'nowrap' }}
                  onClick={() => handleSaveKey(p.id)}
                >
                  {keySaved === p.id ? '✓ Saved' : 'Save'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '0 0 24px' }} />

        {/* Change password */}
        <div style={SECTION}>
          <h3 style={{ marginTop: 0 }}>Change password</h3>
          <input type="password" style={INPUT_STYLE} placeholder="Current password"
            value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
          <input type="password" style={INPUT_STYLE} placeholder="New password (min 8 chars, 1 uppercase, 1 number)"
            value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          <input type="password" style={INPUT_STYLE} placeholder="Repeat new password"
            value={newPw2} onChange={(e) => setNewPw2(e.target.value)} />
          <button style={{ ...BTN_PRIMARY, marginTop: '10px' }} onClick={handleChangePassword} disabled={loading}>
            {loading ? 'Saving…' : 'Update password'}
          </button>
          {pwSuccess && <p style={{ color: '#388e3c', fontSize: '14px', marginTop: '8px' }}>Password updated successfully.</p>}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '0 0 24px' }} />

        {/* Export */}
        <div style={SECTION}>
          <h3 style={{ marginTop: 0 }}>Download your data</h3>
          <p style={{ color: '#555', fontSize: '14px', margin: '0 0 12px' }}>
            Download a JSON file with all your garden data, inventory, trade history,
            and chat messages (GDPR Article 20).
          </p>
          <button style={BTN_PRIMARY} onClick={handleExport} disabled={loading}>
            {loading ? 'Preparing…' : 'Export my data'}
          </button>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '0 0 24px' }} />

        {/* Delete */}
        <div style={SECTION}>
          <h3 style={{ marginTop: 0, color: '#c62828' }}>Delete account</h3>
          <p style={{ color: '#555', fontSize: '14px', margin: '0 0 12px' }}>
            This permanently deletes your account and all associated data.
            This action cannot be undone (GDPR Article 17).
          </p>

          {!deleteConfirm ? (
            <button style={BTN_DANGER} onClick={() => setDeleteConfirm(true)}>
              Delete my account
            </button>
          ) : (
            <>
              <label style={{ fontSize: '14px', fontWeight: 600 }}>
                Enter your password to confirm:
              </label>
              <input
                type="password"
                style={INPUT_STYLE}
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Your current password"
                autoFocus
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button style={BTN_DANGER} onClick={handleDelete} disabled={loading}>
                  {loading ? 'Deleting…' : 'Yes, delete everything'}
                </button>
                <button style={BTN_CANCEL} onClick={() => { setDeleteConfirm(false); setDeletePassword(''); }}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>

        {error && (
          <p style={{ color: '#c62828', fontSize: '14px', margin: '0 0 16px' }}>{error}</p>
        )}

        <button style={BTN_CANCEL} onClick={onClose} disabled={loading}>
          Close
        </button>
      </div>
    </div>
  );
}
