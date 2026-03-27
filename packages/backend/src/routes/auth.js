/**
 * Authentication routes — register, login, /me, logout.
 * Security: rate-limited, validated, audit-logged.
 */
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const db      = require('../db');
const { requireAuth }                       = require('../middleware/auth');
const { authLimiter, auditLog }             = require('../middleware/security');
const { validateRegister, validateLogin }   = require('../middleware/validate');
const { updateMemEntry }                    = require('./leaderboard');

// In-memory fallback (used when DATABASE_URL is not configured)
const memUsers = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function safeUser(user) {
  return {
    id:          user.id,
    username:    user.username,
    email:       user.email,
    level:       user.level       || 1,
    xp:          user.xp          || 0,
    coins:       user.coins       || 100,
    plantsGrown: user.plants_grown || user.plantsGrown || 0,
  };
}

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', authLimiter, validateRegister, async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const passwordHash = await bcrypt.hash(password, 12); // cost factor 12

    if (db.isConnected()) {
      const existing = await db.query(
        'SELECT id FROM users WHERE email = $1 OR username = $2',
        [email, username]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Username or email already taken' });
      }

      const result = await db.query(
        `INSERT INTO users (username, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, username, email, level, xp, coins, plants_grown`,
        [username, email, passwordHash]
      );
      const user = result.rows[0];
      updateMemEntry(safeUser(user));
      auditLog('register', req, { newUserId: user.id, username });
      return res.status(201).json({ token: makeToken(user), user: safeUser(user) });
    }

    // In-memory fallback
    if (memUsers.find((u) => u.email === email || u.username === username)) {
      return res.status(409).json({ error: 'Username or email already taken' });
    }
    const user = { id: memUsers.length + 1, username, email, passwordHash, level: 1, xp: 0, coins: 100, plantsGrown: 0 };
    memUsers.push(user);
    updateMemEntry(safeUser(user));
    auditLog('register', req, { newUserId: user.id, username });
    res.status(201).json({ token: makeToken(user), user: safeUser(user) });
  } catch (err) {
    console.error('[auth/register]', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', authLimiter, validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (db.isConnected()) {
      const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
      const user   = result.rows[0];

      // Use a constant-time compare regardless of whether user exists
      const hash = user?.password_hash || '$2b$12$invalidhashpadding000000000000000000000000000000000000';
      const valid = await bcrypt.compare(password, hash);

      if (!user || !valid) {
        auditLog('login_fail', req, { email });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
      updateMemEntry(safeUser(user));
      auditLog('login', req, { userId: user.id });
      return res.json({ token: makeToken(user), user: safeUser(user) });
    }

    // In-memory fallback
    const user  = memUsers.find((u) => u.email === email);
    const hash  = user?.passwordHash || '$2b$12$invalidhashpadding000000000000000000000000000000000000';
    const valid = await bcrypt.compare(password, hash);
    if (!user || !valid) {
      auditLog('login_fail', req, { email });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    updateMemEntry(safeUser(user));
    auditLog('login', req, { userId: user.id });
    res.json({ token: makeToken(user), user: safeUser(user) });
  } catch (err) {
    console.error('[auth/login]', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    if (db.isConnected()) {
      const result = await db.query(
        'SELECT id, username, email, level, xp, coins, plants_grown FROM users WHERE id = $1',
        [req.user.userId]
      );
      if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
      return res.json({ user: safeUser(result.rows[0]) });
    }
    const user = memUsers.find((u) => u.id === req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch profile' });
  }
});

module.exports = router;
