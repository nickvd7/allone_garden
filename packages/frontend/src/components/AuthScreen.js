import React, { useState } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function AuthScreen({ onLogin }) {
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
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (t) { setForm((prev) => ({ ...prev, token: t })); switchMode('reset'); }
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

        const { data } = await axios.post(`${API}${endpoint}`, body);
        localStorage.setItem('garden_token', data.token);
        onLogin(data.user, data.token);

      } else if (mode === 'forgot') {
        await axios.post(`${API}/api/auth/forgot-password`, { email: form.email });
        setSuccess('Als dit adres bekend is, ontvang je een e-mail met een resetlink.');

      } else if (mode === 'reset') {
        await axios.post(`${API}/api/auth/reset-password`, {
          token:       form.token,
          newPassword: form.newPassword,
        });
        setSuccess('Wachtwoord succesvol gewijzigd! Je kunt nu inloggen.');
        setTimeout(() => switchMode('login'), 2000);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
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
    <div style={styles.backdrop}>
      <div style={styles.card}>
        <h1 style={styles.title}>🌱 AllOne Garden</h1>
        <p style={styles.subtitle}>Open-source multiplayer gardening game</p>

        {/* Tabs — only for login / register */}
        {(mode === 'login' || mode === 'register') && (
          <div style={styles.tabs}>
            <button
              style={{ ...styles.tab, ...(mode === 'login' ? styles.tabActive : {}) }}
              onClick={() => switchMode('login')}
            >
              Login
            </button>
            <button
              style={{ ...styles.tab, ...(mode === 'register' ? styles.tabActive : {}) }}
              onClick={() => switchMode('register')}
            >
              Register
            </button>
          </div>
        )}

        {/* Forgot / Reset heading */}
        {mode === 'forgot' && (
          <h2 style={{ color: '#2e7d32', marginBottom: '1rem', fontSize: '1.2rem' }}>
            🔑 Wachtwoord vergeten
          </h2>
        )}
        {mode === 'reset' && (
          <h2 style={{ color: '#2e7d32', marginBottom: '1rem', fontSize: '1.2rem' }}>
            🔐 Nieuw wachtwoord
          </h2>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Username — login & register only */}
          {(mode === 'login' || mode === 'register') && (
            <input
              style={styles.input}
              type="text"
              placeholder="Username"
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
              style={styles.input}
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={update('email')}
              required
              autoComplete="email"
            />
          )}

          {/* Password — login & register */}
          {(mode === 'login' || mode === 'register') && (
            <input
              style={styles.input}
              type="password"
              placeholder="Password"
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
              style={styles.input}
              type="text"
              placeholder="Reset token (from email)"
              value={form.token}
              onChange={update('token')}
              required
            />
          )}

          {/* New password — reset mode */}
          {mode === 'reset' && (
            <input
              style={styles.input}
              type="password"
              placeholder="Nieuw wachtwoord"
              value={form.newPassword}
              onChange={update('newPassword')}
              required
              minLength={8}
              autoComplete="new-password"
            />
          )}

          {error   && <div style={styles.error}>{error}</div>}
          {success && <div style={styles.success}>{success}</div>}

          <button style={styles.btnPrimary} type="submit" disabled={loading}>
            {loading ? '…' :
              mode === 'login'    ? '🚪 Login' :
              mode === 'register' ? '🌱 Create account' :
              mode === 'forgot'   ? '📧 Stuur resetlink' :
              '🔐 Wachtwoord opslaan'}
          </button>

          {/* Forgot link under login form */}
          {mode === 'login' && (
            <button
              type="button"
              style={styles.linkBtn}
              onClick={() => switchMode('forgot')}
            >
              Wachtwoord vergeten?
            </button>
          )}

          {/* Back to login link for forgot/reset */}
          {(mode === 'forgot' || mode === 'reset') && (
            <button
              type="button"
              style={styles.linkBtn}
              onClick={() => switchMode('login')}
            >
              ← Terug naar inloggen
            </button>
          )}
        </form>

        {(mode === 'login' || mode === 'register') && (
        <div style={styles.divider}>or</div>
        )}

        {(mode === 'login' || mode === 'register') && (
          <>
            <button style={styles.btnGuest} onClick={handleGuest}>
              🌿 Play as Guest (offline)
            </button>

            <p style={styles.note}>
              No account needed to play offline. Create one to save progress and
              visit other gardens across the community.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// Inline styles keep this component self-contained (no extra CSS file needed)
const styles = {
  backdrop: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #e8f5e9, #c8e6c9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
  },
  card: {
    background: 'white',
    borderRadius: '16px',
    padding: '2.5rem',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
    textAlign: 'center',
  },
  title: {
    fontSize: '2rem',
    color: '#2e7d32',
    marginBottom: '0.25rem',
  },
  subtitle: {
    color: '#888',
    fontSize: '0.9rem',
    marginBottom: '1.5rem',
  },
  tabs: {
    display: 'flex',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1.5px solid #4caf50',
    marginBottom: '1.5rem',
  },
  tab: {
    flex: 1,
    padding: '0.6rem',
    border: 'none',
    background: 'white',
    cursor: 'pointer',
    fontWeight: '600',
    color: '#4caf50',
    fontSize: '0.95rem',
    transition: 'all 0.2s',
  },
  tabActive: {
    background: '#4caf50',
    color: 'white',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  input: {
    padding: '0.75rem 1rem',
    border: '1.5px solid #ddd',
    borderRadius: '8px',
    fontSize: '1rem',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  error: {
    background: '#ffebee',
    color: '#c62828',
    padding: '0.6rem 1rem',
    borderRadius: '6px',
    fontSize: '0.9rem',
  },
  btnPrimary: {
    padding: '0.85rem',
    background: '#4caf50',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: '700',
    cursor: 'pointer',
    marginTop: '0.25rem',
    transition: 'background 0.2s',
  },
  divider: {
    color: '#aaa',
    margin: '1.25rem 0 0.75rem',
    fontSize: '0.85rem',
    position: 'relative',
  },
  btnGuest: {
    width: '100%',
    padding: '0.75rem',
    background: 'white',
    color: '#388e3c',
    border: '1.5px solid #4caf50',
    borderRadius: '8px',
    fontSize: '0.95rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  note: {
    marginTop: '1rem',
    fontSize: '0.78rem',
    color: '#aaa',
    lineHeight: '1.4',
  },
  success: {
    background: '#e8f5e9',
    color: '#2e7d32',
    padding: '0.6rem 1rem',
    borderRadius: '6px',
    fontSize: '0.9rem',
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: '#4caf50',
    cursor: 'pointer',
    fontSize: '0.85rem',
    padding: '0.25rem 0',
    textDecoration: 'underline',
  },
};

export default AuthScreen;
