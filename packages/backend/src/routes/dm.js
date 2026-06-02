/**
 * Direct message REST endpoints.
 *
 * GET /api/dm/conversations  — list of active conversations (last msg per contact)
 * GET /api/dm/history/:userId — paginated history with one other user (last 50)
 *
 * All endpoints require authentication.
 */
const express       = require('express');
const router        = express.Router();
const db            = require('../db');
const { requireAuth } = require('../middleware/auth');

// ── GET /api/dm/conversations ─────────────────────────────────────────────────
// Returns the most recent message per unique conversation partner, newest first.
router.get('/conversations', requireAuth, async (req, res) => {
  const userId = req.user.id;

  if (!db.isConnected()) {
    return res.json({ conversations: [] });
  }

  try {
    // Find the latest message ID per (user_a, user_b) pair where current user
    // is one of the participants, then return full row + contact details.
    const result = await db.query(
      `SELECT
         dm.id,
         CASE WHEN dm.from_user_id = $1 THEN dm.to_user_id   ELSE dm.from_user_id END AS contact_id,
         CASE WHEN dm.from_user_id = $1 THEN u_to.username    ELSE u_from.username END AS contact_username,
         dm.message        AS last_message,
         dm.from_user_id,
         dm.created_at
       FROM direct_messages dm
       JOIN users u_from ON u_from.id = dm.from_user_id
       JOIN users u_to   ON u_to.id   = dm.to_user_id
       WHERE dm.id IN (
         SELECT MAX(id)
         FROM   direct_messages
         WHERE  from_user_id = $1 OR to_user_id = $1
         GROUP BY LEAST(from_user_id, to_user_id),
                  GREATEST(from_user_id, to_user_id)
       )
       ORDER BY dm.created_at DESC
       LIMIT 50`,
      [userId]
    );

    res.json({ conversations: result?.rows || [] });
  } catch (err) {
    console.error('[dm] conversations error:', err.message);
    res.json({ conversations: [] });
  }
});

// ── GET /api/dm/history/:userId ───────────────────────────────────────────────
// Returns the last 50 messages between the current user and :userId, oldest first.
router.get('/history/:userId', requireAuth, async (req, res) => {
  const myId    = req.user.id;
  const otherId = parseInt(req.params.userId, 10);

  if (!otherId || Number.isNaN(otherId) || otherId === myId) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  if (!db.isConnected()) {
    return res.json({ messages: [] });
  }

  try {
    // Return in ascending order (oldest first) for rendering in chat UI.
    const result = await db.query(
      `SELECT
         id,
         from_user_id                                                 AS "from",
         to_user_id                                                   AS "to",
         CASE WHEN from_user_id = $1 THEN $3 ELSE u.username END     AS "fromUsername",
         message                                                       AS text,
         created_at                                                    AS timestamp
       FROM   direct_messages dm
       JOIN   users u ON u.id = dm.from_user_id
       WHERE  (from_user_id = $1 AND to_user_id = $2)
          OR  (from_user_id = $2 AND to_user_id = $1)
       ORDER BY created_at DESC
       LIMIT  50`,
      [myId, otherId, req.user.username]
    );

    const messages = (result?.rows || []).reverse();
    res.json({ messages });
  } catch (err) {
    console.error('[dm] history error:', err.message);
    res.json({ messages: [] });
  }
});

module.exports = router;
