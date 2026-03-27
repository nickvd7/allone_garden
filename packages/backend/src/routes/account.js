/**
 * Account management routes — GDPR compliance + password change.
 *
 * PATCH  /api/account/password — change password (requires current password)
 * GET    /api/account/export   — download all personal data as JSON
 * DELETE /api/account          — permanently delete account + all data
 */

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const { body } = require('express-validator');
const db      = require('../db');
const { requireAuth }        = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');
const { auditLog, accountLimiter } = require('../middleware/security');

const BCRYPT_ROUNDS = 12;

// ── PATCH /api/account/password ───────────────────────────────────────────────

const validateChangePassword = [
  body('currentPassword').isString().isLength({ min: 1 }).withMessage('Current password required'),
  body('newPassword')
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage('New password must be 8–128 characters')
    .matches(/[A-Z]/).withMessage('New password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('New password must contain a number'),
  handleValidationErrors,
];

router.patch('/password', accountLimiter, requireAuth, validateChangePassword, async (req, res) => {
  const { userId } = req.user;
  const { currentPassword, newPassword } = req.body;

  if (!db.isConnected()) {
    return res.status(503).json({ error: 'Database required for password change' });
  }

  try {
    const result = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Account not found' });

    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) return res.status(403).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);

    auditLog('password_change', req);
    res.json({ success: true });
  } catch (err) {
    console.error('[account] password change error:', err.message);
    res.status(500).json({ error: 'Password change failed' });
  }
});

// ── GET /api/account/export ───────────────────────────────────────────────────

router.get('/export', requireAuth, async (req, res) => {
  const { userId } = req.user;

  if (!db.isConnected()) {
    return res.status(503).json({ error: 'Database required for data export' });
  }

  try {
    const [userRow, gardenRow, inventoryRows, listingsRows, tradeHistoryRows, chatRows] =
      await Promise.all([
        db.query('SELECT id, username, email, level, coins, created_at FROM users WHERE id = $1', [userId]),
        db.query('SELECT plots, current_day, weather, updated_at FROM gardens WHERE user_id = $1', [userId]),
        db.query('SELECT plant_type, quantity FROM inventory WHERE user_id = $1', [userId]),
        db.query('SELECT id, crop_id, quantity, price_per_unit, created_at FROM trade_listings WHERE seller_id = $1', [userId]),
        db.query(
          `SELECT listing_id, crop_id, quantity, total_coins, completed_at,
                  CASE WHEN seller_id = $1 THEN 'sold' ELSE 'bought' END AS direction
           FROM trade_history WHERE seller_id = $1 OR buyer_id = $1
           ORDER BY completed_at DESC LIMIT 500`,
          [userId]
        ),
        db.query(
          'SELECT message AS text, created_at AS timestamp FROM chat_messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1000',
          [userId]
        ),
      ]);

    auditLog('gdpr_export', req);

    const exportData = {
      exportedAt: new Date(),
      user:       userRow.rows[0] ?? null,
      garden:     gardenRow.rows[0] ?? null,
      inventory:  inventoryRows.rows,
      activeListings: listingsRows.rows,
      tradeHistory:   tradeHistoryRows.rows,
      chatMessages:   chatRows.rows,
    };

    res.setHeader('Content-Disposition', 'attachment; filename="allone-garden-export.json"');
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  } catch (err) {
    console.error('[account] export error:', err.message);
    res.status(500).json({ error: 'Export failed' });
  }
});

// ── DELETE /api/account ───────────────────────────────────────────────────────

const validateDeleteAccount = [
  body('password')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Password required to confirm deletion'),
  handleValidationErrors,
];

router.delete('/', accountLimiter, requireAuth, validateDeleteAccount, async (req, res) => {
  const { userId } = req.user;
  const { password } = req.body;

  if (!db.isConnected()) {
    return res.status(503).json({ error: 'Database required for account deletion' });
  }

  const client = await db.getClient();
  try {
    // Verify password before deleting
    const userRow = await client.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (!userRow.rows[0]) return res.status(404).json({ error: 'Account not found' });

    const valid = await bcrypt.compare(password, userRow.rows[0].password_hash);
    if (!valid) return res.status(403).json({ error: 'Incorrect password' });

    await client.query('BEGIN');

    // Cascade delete all user data
    await client.query('DELETE FROM chat_messages  WHERE user_id = $1',   [userId]);
    await client.query('DELETE FROM trade_history  WHERE seller_id = $1 OR buyer_id = $1', [userId]);
    await client.query('DELETE FROM trade_listings WHERE seller_id = $1', [userId]);
    await client.query('DELETE FROM inventory      WHERE user_id = $1',   [userId]);
    await client.query('DELETE FROM gardens        WHERE user_id = $1',   [userId]);
    await client.query('DELETE FROM users          WHERE id = $1',        [userId]);

    await client.query('COMMIT');

    auditLog('gdpr_delete', req);
    res.json({ success: true, message: 'Account and all associated data have been permanently deleted.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[account] delete error:', err.message);
    res.status(500).json({ error: 'Deletion failed' });
  } finally {
    client.release();
  }
});

module.exports = router;
