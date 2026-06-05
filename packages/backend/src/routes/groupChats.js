/**
 * Group chat REST endpoints — sync across devices for logged-in users.
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  listGroupsForUser,
  getGroupMessages,
} = require('../services/groupChatStore');

router.get('/', requireAuth, async (req, res) => {
  try {
    const groups = await listGroupsForUser(req.user.userId);
    res.json({ groups });
  } catch (err) {
    console.error('[group-chats] list error:', err.message);
    res.json({ groups: [] });
  }
});

router.get('/:groupId/messages', requireAuth, async (req, res) => {
  const { groupId } = req.params;
  if (!groupId || groupId.length > 80) {
    return res.status(400).json({ error: 'Invalid groupId' });
  }
  try {
    const messages = await getGroupMessages(groupId, req.user.userId);
    res.json({ messages });
  } catch (err) {
    console.error('[group-chats] messages error:', err.message);
    res.json({ messages: [] });
  }
});

module.exports = router;
