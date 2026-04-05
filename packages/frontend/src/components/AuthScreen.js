import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { AUTH_HTTPONLY, persistGardenToken } from '../auth/session';
import appLogo from '../assets/allone-garden-logo-transparent.png';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function AuthScreen({ onLogin }) {
  const { t } = useTranslation();
  // mode: 'login' | 'register' | 'forgot' | 'reset'
  const [mode,    setMode]    = useState('login');
  const [form,    setForm]    = useState({ username: '', email: '', password: '', token: '', newPassword: '' });
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const switchMode = (m) => { setMode(m); setError(''); setSuccess(''); };

  // Parse ?token=... from the URL for the reset-password deep-link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tok = params.get('token');
    if (tok) { setForm((prev) => ({ ...prev, token: tok })); switchMode('reset'); }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'login' || mode === 'register') {
        const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
        const body =
          mode === 'login'
            ? { username: form.username, password: form.password }
            : { username: form.username, email: form.email, password: form.password };

        const { data } = await axios.post(`${API}${endpoint}`, body, {
          withCredentials: AUTH_HTTPONLY,
        });
        persistGardenToken(data.token);
        onLogin(data.user, AUTH_HTTPONLY ? null : data.token);

      } else if (mode === 'forgot') {
        await axios.post(`${API}/api/auth/forgot-password`, { email: form.email });
        setSuccess(t('auth.forgot_success'));

      } else if (mode === 'reset') {
        await axios.post(`${API}/api/auth/reset-password`, {
          token:       form.token,
          newPassword: form.newPassword,
        });
        setSuccess(t('auth.reset_success'));
        setTimeout(() => switchMode('login'), 2000);
      }
    } catch (err) {
      setError(err.response?.data?.error || t('auth.error_generic'));
    } finally {
      setLoading(false);
    }
  };

  // Allow playing offline / as guest without a real account
  const handleGuest = () => {
    onLogin(
      { id: 0, username: 'Guest', email: '', level: 1, xp: 0, coins: 100, plantsGrown: 0 },
      null
    );
  };

  return (
    <div className="auth-backdrop">
      <div className="auth-card">
        <button
          type="button"
          className="auth-title-btn"
          id="auth-main-title"
          onClick={() => { window.location.href = '/home'; }}
          title="Open homepage"
        >
          <h1 className="auth-title">
            <img src={appLogo} alt={t('app_title')} className="auth-title-logo" />
          </h1>
        </button>
        <p className="auth-subtitle">{t('auth.tagline')}</p>

        {/* Tabs — only for login / register */}
        {(mode === 'login' || mode === 'register') && (
          <div className="auth-tabs" role="tablist" aria-labelledby="auth-main-title">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={`auth-tab ${mode === 'login' ? 'auth-tab--active' : ''}`}
              onClick={() => switchMode('login')}
            >
              {t('login')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={`auth-tab ${mode === 'register' ? 'auth-tab--active' : ''}`}
              onClick={() => switchMode('register')}
            >
              {t('register')}
            </button>
          </div>
        )}

        {/* Forgot / Reset heading */}
        {mode === 'forgot' && (
          <h2 className="auth-mode-title">
            🔑 {t('auth.forgot_heading')}
          </h2>
        )}
        {mode === 'reset' && (
          <h2 className="auth-mode-title">
            🔐 {t('auth.new_password_heading')}
          </h2>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {/* Username — login & register only */}
          {(mode === 'login' || mode === 'register') && (
            <input
              className="auth-input"
              type="text"
              placeholder={t('username')}
              value={form.username}
              onChange={update('username')}
              required
              minLength={3}
              maxLength={50}
              autoComplete="username"
            />
          )}

          {/* Email — register & forgot */}
          {(mode === 'register' || mode === 'forgot') && (
            <input
              className="auth-input"
              type="email"
              placeholder={t('email')}
              value={form.email}
              onChange={update('email')}
              required
              autoComplete="email"
            />
          )}

          {/* Password — login & register */}
          {(mode === 'login' || mode === 'register') && (
            <input
              className="auth-input"
              type="password"
              placeholder={t('password')}
              value={form.password}
              onChange={update('password')}
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          )}

          {/* Reset token (hidden when pre-filled from URL) */}
          {mode === 'reset' && !form.token && (
            <input
              className="auth-input"
              type="text"
              placeholder={t('auth.placeholder_reset_token')}
              value={form.token}
              onChange={update('token')}
              required
            />
          )}

          {/* New password — reset mode */}
          {mode === 'reset' && (
            <input
              className="auth-input"
              type="password"
              placeholder={t('auth.placeholder_new_password')}
              value={form.newPassword}
              onChange={update('newPassword')}
              required
              minLength={8}
              autoComplete="new-password"
            />
          )}

          {error   && <div className="auth-alert auth-alert--error" role="alert">{error}</div>}
          {success && <div className="auth-alert auth-alert--success" role="status">{success}</div>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? '…' :
              mode === 'login'    ? t('auth.btn_login_submit') :
              mode === 'register' ? t('auth.btn_create_account') :
              mode === 'forgot'   ? t('auth.btn_send_reset') :
              t('auth.btn_save_password')}
          </button>

          {/* Forgot link under login form */}
          {mode === 'login' && (
            <button
              type="button"
              className="auth-link"
              onClick={() => switchMode('forgot')}
            >
              {t('auth.forgot_link')}
            </button>
          )}

          {/* Back to login link for forgot/reset */}
          {(mode === 'forgot' || mode === 'reset') && (
            <button
              type="button"
              className="auth-link"
              onClick={() => switchMode('login')}
            >
              {t('auth.back_to_login')}
            </button>
          )}
        </form>

        {(mode === 'login' || mode === 'register') && (
        <div className="auth-divider">{t('auth.divider_or')}</div>
        )}

        {(mode === 'login' || mode === 'register') && (
          <>
            <button type="button" className="auth-btn-guest" onClick={handleGuest}>
              🌿 {t('play_as_guest')}
            </button>

            <p className="auth-note">
              {t('auth.guest_note')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default AuthScreen;
