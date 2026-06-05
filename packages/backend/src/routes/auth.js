/**
 * Authentication routes — register, login, /me, logout.
 * Security: rate-limited, validated, audit-logged.
 */
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
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
const {
  sendPasswordReset,
  sendWelcome,
  sendUsernameReminder,
  normalizeLang,
} = require('../services/email');
const {
  issueResetToken,
  getMemResetEntry,
  deleteMemResetToken,
} = require('../services/passwordReset');
const { ADMIN_USERS, isAdminUser } = require('../utils/adminRole');
const { setAuthCookie, clearAuthCookie } = require('../config/authCookies');

// In-memory fallback (used when DATABASE_URL is not configured)
const memUsers = [];

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
    language:    user.preferred_language || user.language || 'nl',
    isAdmin:     isAdminUser(user),
  };
}

async function countDbAdmins() {
  if (!db.isConnected()) return 0;
  const result = await db.query('SELECT COUNT(*)::int AS n FROM users WHERE level >= 99');
  return result.rows[0]?.n || 0;
}

async function needsAdminSetup() {
  if (!db.isConnected()) return false;
  if (ADMIN_USERS.length > 0) return false;
  return (await countDbAdmins()) === 0;
}

async function findUserByLogin(identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) return null;
  if (db.isConnected()) {
    const isEmail = raw.includes('@');
    const result = await db.query(
      isEmail
        ? 'SELECT * FROM users WHERE email = $1'
        : 'SELECT * FROM users WHERE username = $1',
      [isEmail ? raw.toLowerCase() : raw],
    );
    return result.rows[0] || null;
  }
  const isEmail = raw.includes('@');
  return memUsers.find((u) => (
    isEmail ? u.email === raw.toLowerCase() : u.username === raw
  )) || null;
}

// Bcrypt work factor — clamp to 10-15 so operators can tune without going unsafe
const BCRYPT_ROUNDS = Math.max(10, Math.min(15, parseInt(process.env.BCRYPT_ROUNDS || '12', 10)));

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', authLimiter, validateRegister, async (req, res) => {
  try {
    const { username, email, password, language } = req.body;
    const preferredLanguage = normalizeLang(language);
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    if (db.isConnected()) {
      const existing = await db.query(
        'SELECT id FROM users WHERE email = $1 OR username = $2',
        [email, username]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Username or email already taken' });
      }

      const result = await db.query(
        `INSERT INTO users (username, email, password_hash, preferred_language)
         VALUES ($1, $2, $3, $4)
         RETURNING id, username, email, level, xp, coins, plants_grown, preferred_language`,
        [username, email, passwordHash, preferredLanguage]
      );
      const user = result.rows[0];
      updateMemEntry(safeUser(user));
      auditLog('register', req, { newUserId: user.id, username });
      sendWelcome(email, username, preferredLanguage).catch(() => {});
      const token = makeToken(user);
      setAuthCookie(res, token);
      return res.status(201).json({ token, user: safeUser(user) });
    }

    // In-memory fallback
    if (memUsers.find((u) => u.email === email || u.username === username)) {
      return res.status(409).json({ error: 'Username or email already taken' });
    }
    const user = {
      id: memUsers.length + 1,
      username,
      email,
      passwordHash,
      level: 1,
      xp: 0,
      coins: 100,
      plantsGrown: 0,
      preferred_language: preferredLanguage,
    };
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
    const user = await findUserByLogin(username);

    if (db.isConnected()) {
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
        `SELECT id, username, email, level, xp, coins, plants_grown, preferred_language
         FROM users WHERE id = $1`,
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
    let user = null;
    let token = null;

    if (db.isConnected()) {
      const result = await db.query(
        'SELECT id, username, preferred_language FROM users WHERE email = $1',
        [email.toLowerCase()],
      );
      if (result.rows.length > 0) {
        user = result.rows[0];
        token = await issueResetToken(user.id);
        await sendPasswordReset(
          email,
          user.username,
          token,
          user.preferred_language || 'nl',
        );
      }
      return res.json({ success: true });
    }

    // In-memory fallback
    user = memUsers.find((u) => u.email === email.toLowerCase());
    if (user) {
      token = await issueResetToken(user.id);
      await sendPasswordReset(
        email,
        user.username,
        token,
        user.preferred_language || 'nl',
      );
    }

    if (process.env.EXPOSE_RESET_TOKEN === 'true' && process.env.NODE_ENV !== 'production' && user && token) {
      console.log(`[auth/forgot-password] DEV — reset token for ${email}: ${token}`);
      return res.json({ success: true, resetToken: token });
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
      const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user_id]);
      await db.query('DELETE FROM password_reset_tokens WHERE token = $1', [token]);
      auditLog('password_reset', req, { userId: user_id });
      return res.json({ success: true });
    }

    // In-memory fallback
    const entry = getMemResetEntry(token);
    if (!entry || entry.expires < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    const user = memUsers.find((u) => u.id === entry.userId);
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    deleteMemResetToken(token);
    auditLog('password_reset', req, { userId: user.id });
    res.json({ success: true });
  } catch (err) {
    console.error('[auth/reset-password]', err.message);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

// ── POST /api/auth/forgot-username — e-mail met gebruikersnaam ───────────────
router.post('/forgot-username', authLimiter, forgotPasswordEmailLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    if (db.isConnected()) {
      const result = await db.query(
        'SELECT username, preferred_language FROM users WHERE email = $1',
        [email.toLowerCase()],
      );
      if (result.rows.length > 0) {
        const { username, preferred_language: lang } = result.rows[0];
        await sendUsernameReminder(email, username, lang || 'nl');
      }
      return res.json({ success: true });
    }

    const user = memUsers.find((u) => u.email === email.toLowerCase());
    if (user) {
      await sendUsernameReminder(email, user.username, user.preferred_language || 'nl');
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[auth/forgot-username]', err.message);
    res.status(500).json({ error: 'Could not process request' });
  }
});

// ── GET /api/auth/setup-status — first-time admin setup ───────────────────────
router.get('/setup-status', async (_req, res) => {
  try {
    const needed = await needsAdminSetup();
    res.json({
      needsSetup: needed,
      requiresSetupSecret: true,
      setupSecretConfigured: !!process.env.SETUP_ADMIN_SECRET,
      hasDatabase: db.isConnected(),
      emailConfigured: require('../services/email').isEmailConfigured(),
    });
  } catch (err) {
    console.error('[auth/setup-status]', err.message);
    res.status(500).json({ error: 'Could not check setup status' });
  }
});

const validateSetupAdmin = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be 3–30 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username may only contain letters, numbers, _ and -'),
  body('email').trim().isEmail().withMessage('Invalid email address').normalizeEmail(),
  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8–128 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
  body('language').optional().isString().isLength({ max: 10 }),
  body('setupSecret').isString().isLength({ min: 1 }).withMessage('Setup secret required'),
  handleValidationErrors,
];

// ── POST /api/auth/setup-admin — create first admin (email + password) ────────
router.post('/setup-admin', authLimiter, validateSetupAdmin, async (req, res) => {
  try {
    const { username, email, password, language, setupSecret } = req.body;
    const preferredLanguage = normalizeLang(language);

    if (!db.isConnected()) {
      return res.status(503).json({ error: 'Database required for admin setup' });
    }

    if (!process.env.SETUP_ADMIN_SECRET) {
      return res.status(503).json({ error: 'Server not configured — set SETUP_ADMIN_SECRET in .env' });
    }
    if (setupSecret !== process.env.SETUP_ADMIN_SECRET) {
      return res.status(403).json({ error: 'Invalid setup secret' });
    }

    if (!(await needsAdminSetup())) {
      return res.status(403).json({ error: 'Admin setup already completed' });
    }

    const existing = await db.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username],
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username or email already taken' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = await db.query(
      `INSERT INTO users (username, email, password_hash, level, preferred_language)
       VALUES ($1, $2, $3, 99, $4)
       RETURNING id, username, email, level, xp, coins, plants_grown, preferred_language`,
      [username, email, passwordHash, preferredLanguage],
    );
    const user = result.rows[0];
    updateMemEntry(safeUser(user));
    auditLog('admin_setup', req, { newUserId: user.id, username });
    sendWelcome(email, username, preferredLanguage).catch(() => {});

    const token = makeToken(user);
    setAuthCookie(res, token);
    res.status(201).json({ token, user: safeUser(user) });
  } catch (err) {
    console.error('[auth/setup-admin]', err.message);
    res.status(500).json({ error: 'Admin setup failed' });
  }
});

module.exports = router;
module.exports.getMemUserById = (userId) => memUsers.find((u) => u.id === Number(userId)) || null;
module.exports.memUsers = memUsers;
