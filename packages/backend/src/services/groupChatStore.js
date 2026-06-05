'use strict';

const db = require('../db');

async function persistGroupRegister({ groupId, name, createdBy, memberIds }) {
  if (!db.isConnected()) return;
  try {
    await db.query(
      `INSERT INTO group_chats (id, name, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [groupId, name, createdBy || null],
    );
    for (const uid of memberIds) {
      await db.query(
        `INSERT INTO group_chat_members (group_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (group_id, user_id) DO NOTHING`,
        [groupId, uid],
      );
    }
  } catch (err) {
    console.error('[group-chat] persist register failed:', err.message);
  }
}

async function persistGroupMessage({ groupId, fromUserId, text, timestamp }) {
  if (!db.isConnected()) return null;
  try {
    const createdAt = new Date(timestamp || Date.now()).toISOString();
    const result = await db.query(
      `INSERT INTO group_chat_messages (group_id, from_user_id, message, created_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [groupId, fromUserId, text, createdAt],
    );
    return result?.rows?.[0]?.id || null;
  } catch (err) {
    console.error('[group-chat] persist message failed:', err.message);
    return null;
  }
}

async function listGroupsForUser(userId) {
  if (!db.isConnected()) return [];
  try {
    const groupsResult = await db.query(
      `SELECT gc.id, gc.name, gc.created_at
       FROM group_chats gc
       INNER JOIN group_chat_members mem ON mem.group_id = gc.id AND mem.user_id = $1
       ORDER BY gc.created_at DESC
       LIMIT 50`,
      [userId],
    );
    const rows = groupsResult?.rows || [];
    if (!rows.length) return [];

    const ids = rows.map((r) => r.id);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');

    const membersResult = await db.query(
      `SELECT group_id, user_id FROM group_chat_members WHERE group_id IN (${placeholders})`,
      ids,
    );
    const membersByGroup = {};
    (membersResult?.rows || []).forEach((row) => {
      const key = row.group_id;
      if (!membersByGroup[key]) membersByGroup[key] = [];
      membersByGroup[key].push(String(row.user_id));
    });

    const msgResult = await db.query(
      `SELECT gcm.group_id, gcm.message, gcm.created_at, u.username AS from_username
       FROM group_chat_messages gcm
       JOIN users u ON u.id = gcm.from_user_id
       WHERE gcm.group_id IN (${placeholders})
       ORDER BY gcm.created_at DESC`,
      ids,
    );
    const lastByGroup = {};
    (msgResult?.rows || []).forEach((row) => {
      if (lastByGroup[row.group_id]) return;
      lastByGroup[row.group_id] = {
        lastMessage: row.message,
        lastAt: new Date(row.created_at).getTime(),
        lastFromUsername: row.from_username,
      };
    });

    return rows.map((row) => {
      const last = lastByGroup[row.id];
      return {
        id: row.id,
        name: row.name,
        memberIds: membersByGroup[row.id] || [],
        lastMessage: last?.lastMessage || '',
        lastAt: last?.lastAt || new Date(row.created_at).getTime(),
        lastFromUsername: last?.lastFromUsername || '',
      };
    }).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  } catch (err) {
    console.error('[group-chat] list groups failed:', err.message);
    return [];
  }
}

async function getGroupMessages(groupId, userId, limit = 50) {
  if (!db.isConnected()) return [];
  try {
    const member = await db.query(
      `SELECT 1 FROM group_chat_members WHERE group_id = $1 AND user_id = $2 LIMIT 1`,
      [groupId, userId],
    );
    if (!member?.rows?.length) return [];

    const result = await db.query(
      `SELECT
         gcm.group_id,
         gcm.from_user_id AS "from",
         u.username AS "fromUsername",
         gcm.message AS text,
         gcm.created_at
       FROM group_chat_messages gcm
       JOIN users u ON u.id = gcm.from_user_id
       WHERE gcm.group_id = $1
       ORDER BY gcm.created_at DESC
       LIMIT $2`,
      [groupId, limit],
    );
    return (result?.rows || []).reverse().map((row) => ({
      groupId: row.group_id,
      from: row.from,
      fromUsername: row.fromUsername,
      text: row.text,
      timestamp: new Date(row.created_at).getTime(),
    }));
  } catch (err) {
    console.error('[group-chat] history failed:', err.message);
    return [];
  }
}

async function hydrateMemoryGroupChats(groupChats) {
  if (!db.isConnected()) return;
  try {
    const result = await db.query('SELECT id, name FROM group_chats LIMIT 200');
    const memResult = await db.query('SELECT group_id, user_id FROM group_chat_members');

    const membersByGroup = {};
    (memResult?.rows || []).forEach((row) => {
      if (!membersByGroup[row.group_id]) membersByGroup[row.group_id] = [];
      membersByGroup[row.group_id].push(String(row.user_id));
    });

    (result?.rows || []).forEach((row) => {
      groupChats[row.id] = {
        name: row.name,
        members: new Set(membersByGroup[row.id] || []),
        messages: groupChats[row.id]?.messages || [],
      };
    });

    const msgResult = await db.query(
      `SELECT gcm.group_id, gcm.from_user_id, u.username, gcm.message, gcm.created_at
       FROM group_chat_messages gcm
       JOIN users u ON u.id = gcm.from_user_id
       ORDER BY gcm.created_at ASC
       LIMIT 5000`,
    );
    (msgResult?.rows || []).forEach((row) => {
      const chat = groupChats[row.group_id];
      if (!chat) return;
      chat.messages.push({
        groupId: row.group_id,
        from: row.from_user_id,
        fromUsername: row.username,
        text: row.message,
        timestamp: new Date(row.created_at).getTime(),
      });
      if (chat.messages.length > 100) chat.messages.shift();
    });
  } catch (err) {
    console.error('[group-chat] hydrate failed:', err.message);
  }
}

module.exports = {
  persistGroupRegister,
  persistGroupMessage,
  listGroupsForUser,
  getGroupMessages,
  hydrateMemoryGroupChats,
};
