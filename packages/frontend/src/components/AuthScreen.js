import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { AUTH_HTTPONLY, persistGardenToken } from '../auth/session';
import appLogo from '../assets/allone-garden-logo-transparent.png';

const API = process.env.REACT_APP_API_URL || '';

const AUTH_LANGUAGES = [
  { code: 'nl', label: 'Nederlands 🇳🇱' },
  { code: 'en', label: 'English 🇬🇧' },
  { code: 'de', label: 'Deutsch 🇩🇪' },
  { code: 'fr', label: 'Français 🇫🇷' },
  { code: 'es', label: 'Español 🇪🇸' },
];

function AuthScreen({ onLogin, allowGuest = true }) {
  const { t, i18n } = useTranslation();
  const [mode,    setMode]    = useState('login');
  const [form,    setForm]    = useState({
    username: '',
    email: '',
    password: '',
    passwordConfirm: '',
    language: typeof localStorage !== 'undefined' ? (localStorage.getItem('garden_lang') || 'nl') : 'nl',
    token: '',
    newPassword: '',
    setupSecret: '',
  });
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupSecretConfigured, setSetupSecretConfigured] = useState(true);
  const [setupChecked, setSetupChecked] = useState(!API);

  const update = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const switchMode = (m) => { setMode(m); setError(''); setSuccess(''); };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tok = params.get('token');
    if (tok) { setForm((prev) => ({ ...prev, token: tok })); switchMode('reset'); }
  }, []);

  useEffect(() => {
    if (!API) return undefined;
    let cancelled = false;
    axios.get(`${API}/api/auth/setup-status`)
      .then((res) => {
        if (cancelled) return;
        if (res.data?.needsSetup) {
          setNeedsSetup(true);
          setMode('setup');
        }
        setSetupSecretConfigured(res.data?.setupSecretConfigured !== false);
        setSetupChecked(true);
      })
      .catch(() => { if (!cancelled) setSetupChecked(true); });
    return () => { cancelled = true; };
  }, []);

  const applyLanguage = (code) => {
    localStorage.setItem('garden_lang', code);
    i18n.changeLanguage(code);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (mode === 'register' || mode === 'setup') {
      if (form.password !== form.passwordConfirm) {
        setError(t('auth.password_mismatch'));
        return;
      }
      applyLanguage(form.language);
    }

    setLoading(true);

    try {
      if (mode === 'login' || mode === 'register' || mode === 'setup') {
        const endpoint = mode === 'login'
          ? '/api/auth/login'
          : mode === 'setup'
            ? '/api/auth/setup-admin'
            : '/api/auth/register';
        const body = mode === 'login'
          ? { username: form.username, password: form.password }
          : mode === 'setup'
            ? {
              username: form.username,
              email: form.email,
              password: form.password,
              language: form.language,
              setupSecret: form.setupSecret,
            }
            : {
              username: form.username,
              email: form.email,
              password: form.password,
              language: form.language,
            };

        const { data } = await axios.post(`${API}${endpoint}`, body, {
          withCredentials: AUTH_HTTPONLY,
        });
        persistGardenToken(data.token);
        if (mode === 'register' || mode === 'setup') applyLanguage(form.language);
        onLogin(data.user, AUTH_HTTPONLY ? null : data.token);

      } else if (mode === 'forgot') {
        await axios.post(`${API}/api/auth/forgot-password`, { email: form.email });
        setSuccess(t('auth.forgot_success'));

      } else if (mode === 'forgot-username') {
        await axios.post(`${API}/api/auth/forgot-username`, { email: form.email });
        setSuccess(t('auth.forgot_username_success'));

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
          title={t('auth.open_home', { defaultValue: 'Open homepage' })}
        >
          <h1 className="auth-title">
            <img src={appLogo} alt={t('app_title')} className="auth-title-logo" />
          </h1>
        </button>
        <p className="auth-subtitle">{t('auth.tagline')}</p>

        {mode === 'setup' && (
          <h2 className="auth-mode-title">⚙️ {t('auth.setup_heading', { defaultValue: 'Admin-account aanmaken' })}</h2>
        )}

        {needsSetup && mode === 'setup' && (
          <p className="auth-setup-note">{t('auth.setup_note', { defaultValue: 'Maak het eerste beheerdersaccount aan met je eigen e-mail en wachtwoord.' })}</p>
        )}
        {needsSetup && mode === 'setup' && !setupSecretConfigured && (
          <p className="auth-alert auth-alert--error" role="alert">
            {t('auth.setup_secret_missing', { defaultValue: 'De server heeft nog geen SETUP_ADMIN_SECRET in .env. Vraag de beheerder dit eerst te configureren.' })}
          </p>
        )}

        {(mode === 'login' || mode === 'register') && !needsSetup && (
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

        {mode === 'forgot' && (
          <h2 className="auth-mode-title">🔑 {t('auth.forgot_heading')}</h2>
        )}
        {mode === 'forgot-username' && (
          <h2 className="auth-mode-title">👤 {t('auth.forgot_username_heading')}</h2>
        )}
        {mode === 'reset' && (
          <h2 className="auth-mode-title">🔐 {t('auth.new_password_heading')}</h2>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {(mode === 'login' || mode === 'register' || mode === 'setup') && (
            <input
              className="auth-input"
              type="text"
              placeholder={mode === 'login' ? t('auth.username_or_email', { defaultValue: 'Gebruikersnaam of e-mail' }) : t('username')}
              value={form.username}
              onChange={update('username')}
              required
              minLength={3}
              maxLength={50}
              autoComplete="username"
            />
          )}

          {(mode === 'register' || mode === 'setup' || mode === 'forgot' || mode === 'forgot-username') && (
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

          {(mode === 'login' || mode === 'register' || mode === 'setup') && (
            <input
              className="auth-input"
              type="password"
              placeholder={t('password')}
              value={form.password}
              onChange={update('password')}
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          )}

          {mode === 'setup' && (
            <input
              className="auth-input"
              type="password"
              placeholder={t('auth.setup_secret_placeholder')}
              value={form.setupSecret}
              onChange={update('setupSecret')}
              required
              autoComplete="off"
            />
          )}

          {(mode === 'register' || mode === 'setup') && (
            <>
              <input
                className="auth-input"
                type="password"
                placeholder={t('auth.password_confirm')}
                value={form.passwordConfirm}
                onChange={update('passwordConfirm')}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <label className="auth-lang-label" htmlFor="auth-language">
                {t('language', { defaultValue: 'Language' })}
              </label>
              <select
                id="auth-language"
                className="auth-input auth-lang-select"
                value={form.language}
                onChange={update('language')}
              >
                {AUTH_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>{lang.label}</option>
                ))}
              </select>
            </>
          )}

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

          <button
            className="auth-submit"
            type="submit"
            disabled={loading || (mode === 'setup' && !setupSecretConfigured)}
          >
            {loading ? '…' :
              mode === 'login'    ? t('auth.btn_login_submit') :
              mode === 'register' ? t('auth.btn_create_account') :
              mode === 'setup'    ? t('auth.btn_setup_admin', { defaultValue: '⚙️ Admin aanmaken' }) :
              mode === 'forgot'   ? t('auth.btn_send_reset') :
              mode === 'forgot-username' ? t('auth.btn_send_username') :
              t('auth.btn_save_password')}
          </button>

          {mode === 'login' && (
            <div className="auth-help-links">
              <button type="button" className="auth-link" onClick={() => switchMode('forgot')}>
                {t('auth.forgot_link')}
              </button>
              <button type="button" className="auth-link" onClick={() => switchMode('forgot-username')}>
                {t('auth.forgot_username_link')}
              </button>
            </div>
          )}

          {(mode === 'forgot' || mode === 'forgot-username' || mode === 'reset') && (
            <button type="button" className="auth-link" onClick={() => switchMode('login')}>
              {t('auth.back_to_login')}
            </button>
          )}
        </form>

        {!setupChecked && API && (
          <div className="auth-alert" role="status">…</div>
        )}

        {allowGuest && (mode === 'login' || mode === 'register') && !needsSetup && (
          <div className="auth-divider">{t('auth.divider_or')}</div>
        )}

        {allowGuest && (mode === 'login' || mode === 'register') && !needsSetup && (
          <>
            <button type="button" className="auth-btn-guest" onClick={handleGuest}>
              🌿 {t('play_as_guest')}
            </button>
            <p className="auth-note">{t('auth.guest_note')}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default AuthScreen;
