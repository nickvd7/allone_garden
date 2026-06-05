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
  const userId = req.user.userId;

  if (!db.isConnected()) {
    return res.json({ conversations: [] });
  }

  try {
    // Find the latest message per conversation partner where the current user
    // is a participant, then return the full row + contact details.
    //
    // Placeholders are numbered sequentially in textual order and each appears
    // exactly once so the query is portable to both PostgreSQL ($N by number)
    // and SQLite (anonymous '?' bound positionally). All values are the same
    // userId.
    const result = await db.query(
      `SELECT
         dm.id,
         CASE WHEN dm.from_user_id = $1 THEN dm.to_user_id ELSE dm.from_user_id END AS contact_id,
         CASE WHEN dm.from_user_id = $2 THEN u_to.username  ELSE u_from.username END AS contact_username,
         dm.message        AS last_message,
         dm.from_user_id,
         dm.created_at
       FROM direct_messages dm
       JOIN users u_from ON u_from.id = dm.from_user_id
       JOIN users u_to   ON u_to.id   = dm.to_user_id
       WHERE dm.id IN (
         SELECT MAX(id)
         FROM   direct_messages
         WHERE  from_user_id = $3 OR to_user_id = $4
         GROUP BY (CASE WHEN from_user_id = $5 THEN to_user_id ELSE from_user_id END)
       )
       ORDER BY dm.created_at DESC
       LIMIT 50`,
      [userId, userId, userId, userId, userId]
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
  const myId    = req.user.userId;
  const otherId = parseInt(req.params.userId, 10);

  if (!otherId || Number.isNaN(otherId) || otherId === myId) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  if (!db.isConnected()) {
    return res.json({ messages: [] });
  }

  try {
    // Only rows where the current user is a participant are returned, so a user
    // can never read someone else's conversation (no IDOR).
    //
    // Placeholders numbered in textual order, each used once — portable to both
    // PostgreSQL and SQLite. Returned DESC then reversed to ascending (oldest
    // first) for the chat UI.
    const result = await db.query(
      `SELECT
         dm.id,
         dm.from_user_id                                            AS "from",
         dm.to_user_id                                              AS "to",
         CASE WHEN dm.from_user_id = $1 THEN $2 ELSE u.username END AS "fromUsername",
         dm.message                                                 AS text,
         dm.created_at                                              AS timestamp
       FROM   direct_messages dm
       JOIN   users u ON u.id = dm.from_user_id
       WHERE  (dm.from_user_id = $3 AND dm.to_user_id = $4)
          OR  (dm.from_user_id = $5 AND dm.to_user_id = $6)
       ORDER BY dm.created_at DESC
       LIMIT  50`,
      [myId, req.user.username, myId, otherId, otherId, myId]
    );

    const messages = (result?.rows || []).reverse();
    res.json({ messages });
  } catch (err) {
    console.error('[dm] history error:', err.message);
    res.json({ messages: [] });
  }
});

// ── GET /api/dm/search?q= — zoek gebruikers op username (ook offline) ─────────
router.get('/search', requireAuth, async (req, res) => {
  const myId = req.user.userId;
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) {
    return res.json({ users: [] });
  }
  if (!db.isConnected()) {
    return res.json({ users: [] });
  }
  try {
    const result = await db.query(
      `SELECT id, username
       FROM users
       WHERE id <> $1 AND LOWER(username) LIKE $2
       ORDER BY username ASC
       LIMIT 20`,
      [myId, `%${q}%`],
    );
    res.json({
      users: (result?.rows || []).map((row) => ({
        id: row.id,
        username: row.username,
        offline: true,
      })),
    });
  } catch (err) {
    console.error('[dm] search error:', err.message);
    res.json({ users: [] });
  }
});

module.exports = router;
