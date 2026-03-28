import React, { useState } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body =
        mode === 'login'
          ? { username: form.username, password: form.password }
          : { username: form.username, email: form.email, password: form.password };

      const { data } = await axios.post(`${API}${endpoint}`, body);
      // Persist token in localStorage so page refreshes keep the session
      localStorage.setItem('garden_token', data.token);
      onLogin(data.user, data.token);
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

        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(mode === 'login' ? styles.tabActive : {}) }}
            onClick={() => setMode('login')}
          >
            Login
          </button>
          <button
            style={{ ...styles.tab, ...(mode === 'register' ? styles.tabActive : {}) }}
            onClick={() => setMode('register')}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
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

          {mode === 'register' && (
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

          {error && <div style={styles.error}>{error}</div>}

          <button style={styles.btnPrimary} type="submit" disabled={loading}>
            {loading ? '...' : mode === 'login' ? '🚪 Login' : '🌱 Create account'}
          </button>
        </form>

        <div style={styles.divider}>or</div>

        <button style={styles.btnGuest} onClick={handleGuest}>
          🌿 Play as Guest (offline)
        </button>

        <p style={styles.note}>
          No account needed to play offline. Create one to save progress and
          visit other gardens across the community.
        </p>
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
};

export default AuthScreen;
