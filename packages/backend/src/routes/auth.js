/**
 * Authentication routes — register, login, /me, logout.
 * Security: rate-limited, validated, audit-logged.
 */
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { body } = require('express-validator');
const db      = require('../db');
const { requireAuth }                              = require('../middleware/auth');
const rateLimit                                    = require('express-rate-limit');
const { authLimiter, auditLog }                    = require('../middleware/security');

// Additional per-email limiter for password reset — 3 requests / email / hour.
// Combined with the per-IP authLimiter above this stops both IP-based and
// email-based enumeration from shared networks (office, university, proxy).
const forgotPasswordEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => `forgot:${(req.body?.email || '').toLowerCase().trim()}`,
  message: { error: 'Too many reset requests for this address. Try again in 1 hour.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});
const { validateRegister, validateLogin,
        handleValidationErrors }                   = require('../middleware/validate');
const { updateMemEntry }                           = require('./leaderboard');
const { sendPasswordReset }                        = require('../services/email');
const { setAuthCookie, clearAuthCookie }             = require('../config/authCookies');

// In-memory reset token store (used when DATABASE_URL is not set)
// Map: token (hex) -> { userId, expires }
const memResetTokens = new Map();
const RESET_TTL_MS   = 60 * 60 * 1000; // 1 hour

// In-memory fallback (used when DATABASE_URL is not configured)
const memUsers = [];

// Admin usernames from env (same list used by admin.js and plugins.js)
const ADMIN_USERS = (process.env.ADMIN_USERS || '').split(',').map((s) => s.trim()).filter(Boolean);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      algorithm: 'HS256',
    }
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
    isAdmin:     ADMIN_USERS.includes(user.username),
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
      const token = makeToken(user);
      setAuthCookie(res, token);
      return res.status(201).json({ token, user: safeUser(user) });
    }

    // In-memory fallback
    if (memUsers.find((u) => u.email === email || u.username === username)) {
      return res.status(409).json({ error: 'Username or email already taken' });
    }
    const user = { id: memUsers.length + 1, username, email, passwordHash, level: 1, xp: 0, coins: 100, plantsGrown: 0 };
    memUsers.push(user);
    updateMemEntry(safeUser(user));
    auditLog('register', req, { newUserId: user.id, username });
    const token = makeToken(user);
    setAuthCookie(res, token);
    res.status(201).json({ token, user: safeUser(user) });
  } catch (err) {
    console.error('[auth/register]', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', authLimiter, validateLogin, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (db.isConnected()) {
      const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
      const user   = result.rows[0];

      // Use a constant-time compare regardless of whether user exists
      const hash = user?.password_hash || '$2b$12$invalidhashpadding000000000000000000000000000000000000';
      const valid = await bcrypt.compare(password, hash);

      if (!user || !valid) {
        auditLog('login_fail', req, { username });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
      updateMemEntry(safeUser(user));
      auditLog('login', req, { userId: user.id });
      const token = makeToken(user);
      setAuthCookie(res, token);
      return res.json({ token, user: safeUser(user) });
    }

    // In-memory fallback
    const user  = memUsers.find((u) => u.username === username);
    const hash  = user?.passwordHash || '$2b$12$invalidhashpadding000000000000000000000000000000000000';
    const valid = await bcrypt.compare(password, hash);
    if (!user || !valid) {
      auditLog('login_fail', req, { username });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    updateMemEntry(safeUser(user));
    auditLog('login', req, { userId: user.id });
    const token = makeToken(user);
    setAuthCookie(res, token);
    res.json({ token, user: safeUser(user) });
  } catch (err) {
    console.error('[auth/login]', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── POST /api/auth/logout ───────────────────────────────────────────────────
// Clears the HttpOnly auth cookie when AUTH_HTTPONLY_COOKIE is enabled.
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
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

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
//
// Accepts { email }. Generates a single-use reset token valid for 1 hour.
// Always returns success to prevent user enumeration.
// With a real DB the token is never returned in JSON (only emailed / logged via sendPasswordReset).
// In-memory dev: set EXPOSE_RESET_TOKEN=true and NODE_ENV≠production to include resetToken in JSON for tests.

router.post('/forgot-password', authLimiter, forgotPasswordEmailLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + RESET_TTL_MS);

    if (db.isConnected()) {
      const result = await db.query(
        'SELECT id, username FROM users WHERE email = $1',
        [email.toLowerCase()]
      );
      if (result.rows.length > 0) {
        const { id: userId, username } = result.rows[0];
        await db.query(
          `INSERT INTO password_reset_tokens (user_id, token, expires_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id) DO UPDATE SET token = $2, expires_at = $3`,
          [userId, token, expires]
        );
        await sendPasswordReset(email, username, token);
      }
      return res.json({ success: true });
    }

    // In-memory fallback
    const user = memUsers.find((u) => u.email === email);
    if (user) {
      memResetTokens.set(token, { userId: user.id, expires });
      await sendPasswordReset(email, user.username, token);
    }

    // Log token to stdout only in non-production — never return it in the JSON
    // response body, which could be captured by proxies, APM tools, or logs.
    if (process.env.EXPOSE_RESET_TOKEN === 'true' && process.env.NODE_ENV !== 'production' && user) {
      console.log(`[auth/forgot-password] DEV — reset token for ${email}: ${token}`);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[auth/forgot-password]', err.message);
    res.status(500).json({ error: 'Could not process reset request' });
  }
});

// ── POST /api/auth/reset-password ─────────────────────────────────────────────
//
// Accepts { token, newPassword }. Validates token, sets new password,
// then immediately invalidates the token (single-use).

const validateResetPassword = [
  body('token').isString().isLength({ min: 1 }).withMessage('Reset token required'),
  body('newPassword')
    .isString()
    .isLength({ min: 8, max: 128 }).withMessage('Password must be 8–128 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
  handleValidationErrors,
];

router.post('/reset-password', authLimiter, validateResetPassword, async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    if (db.isConnected()) {
      const result = await db.query(
        `SELECT user_id FROM password_reset_tokens
         WHERE token = $1 AND expires_at > NOW()`,
        [token]
      );
      if (!result.rows[0]) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }
      const { user_id } = result.rows[0];
      const newHash = await bcrypt.hash(newPassword, 12);
      await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user_id]);
      await db.query('DELETE FROM password_reset_tokens WHERE token = $1', [token]);
      auditLog('password_reset', req, { userId: user_id });
      return res.json({ success: true });
    }

    // In-memory fallback
    const entry = memResetTokens.get(token);
    if (!entry || entry.expires < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    const user = memUsers.find((u) => u.id === entry.userId);
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    memResetTokens.delete(token); // single-use
    auditLog('password_reset', req, { userId: user.id });
    res.json({ success: true });
  } catch (err) {
    console.error('[auth/reset-password]', err.message);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

module.exports = router;
