/**
 * Player trade & collaboration proposals (persisted when DB available).
 */
const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const npcWorld = require('../services/npcWorld');
const { sanitizeProposalPayload, safeParsePayload, normalizeTradePayload } = require('../lib/proposalPayload');
const { executePlayerTrade } = require('../lib/playerEconomy');
const { loadInventory } = require('../lib/inventory');

function sanitizeMessage(raw) {
  return String(raw || '').replace(/<[^>]*>/g, '').slice(0, 300);
}

const memProposals = [];
let memNextId = 1;

function rowToProposal(row) {
  if (!row) return null;
  const payload = safeParsePayload(row.payload);
  return {
    id: row.id,
    fromUserId: String(row.from_user_id),
    fromUsername: row.from_username || null,
    toUserId: String(row.to_user_id),
    toUsername: row.to_username || null,
    kind: row.kind,
    payload,
    message: row.message || '',
    status: row.status,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    virtual: String(row.from_user_id).startsWith('npc:'),
  };
}

async function listForUser(userId) {
  const uid = Number(userId);
  const npcPending = npcWorld.getNpcWorld().proposals.filter(
    (p) => String(p.toUserId) === String(userId),
  );

  if (!db.isConnected()) {
    const mine = memProposals.filter(
      (p) => String(p.toUserId) === String(userId) || String(p.fromUserId) === String(userId),
    );
    return [...npcPending, ...mine].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  const result = await db.query(
    `SELECT pp.*, u_from.username AS from_username, u_to.username AS to_username
     FROM player_proposals pp
     LEFT JOIN users u_from ON u_from.id = pp.from_user_id
     LEFT JOIN users u_to ON u_to.id = pp.to_user_id
     WHERE (pp.to_user_id = $1 OR pp.from_user_id = $1)
       AND pp.status = 'pending'
     ORDER BY pp.created_at DESC
     LIMIT 50`,
    [uid],
  );
  return [...npcPending, ...result.rows.map(rowToProposal)];
}

async function finalizeAccept(proposal, accepterId) {
  if (proposal.kind !== 'trade') {
    return { success: true };
  }

  if (proposal.virtual || String(proposal.fromUserId).startsWith('npc:')) {
    const trade = normalizeTradePayload(proposal.payload);
    if (!trade) return { error: 'Invalid trade proposal', status: 400 };
    return npcWorld.applyNpcTrade(proposal.fromUserId, trade, accepterId);
  }

  return executePlayerTrade(accepterId, proposal.fromUserId, proposal.payload);
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const proposals = await listForUser(req.user.userId);
    res.json({ proposals });
  } catch (err) {
    console.error('[proposals] list error:', err.message);
    res.json({ proposals: [] });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { toUserId, kind, payload, message } = req.body || {};
  const toId = parseInt(toUserId, 10);
  if (!toId || Number.isNaN(toId) || toId === req.user.userId) {
    return res.status(400).json({ error: 'Invalid recipient' });
  }
  if (!['trade', 'collaborate'].includes(kind)) {
    return res.status(400).json({ error: 'Invalid kind' });
  }

  const cleanPayload = sanitizeProposalPayload(kind, payload);
  if (cleanPayload === null) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const record = {
    id: memNextId++,
    fromUserId: String(req.user.userId),
    fromUsername: req.user.username,
    toUserId: String(toId),
    kind,
    payload: cleanPayload,
    message: sanitizeMessage(message),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  if (db.isConnected()) {
    try {
      const result = await db.query(
        `INSERT INTO player_proposals (from_user_id, to_user_id, kind, payload, message)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [req.user.userId, toId, kind, JSON.stringify(record.payload), record.message],
      );
      const saved = rowToProposal({ ...result.rows[0], from_username: req.user.username });
      const io = req.app.get('io');
      io?.to(String(toId)).emit('player-proposal:received', saved);
      return res.status(201).json(saved);
    } catch (err) {
      console.error('[proposals] create error:', err.message);
      return res.status(500).json({ error: 'Could not save proposal' });
    }
  }

  memProposals.unshift(record);
  const io = req.app.get('io');
  io?.to(String(toId)).emit('player-proposal:received', record);
  res.status(201).json(record);
});

router.post('/:id/respond', requireAuth, async (req, res) => {
  const idParam = req.params.id;
  const { action } = req.body || {};
  if (!['accept', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action must be accept or reject' });
  }

  if (String(idParam).startsWith('npc-prop-')) {
    const proposal = npcWorld.getNpcProposal(idParam);
    if (!proposal || String(proposal.toUserId) !== String(req.user.userId)) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    if (action === 'accept') {
      const tradeResult = await finalizeAccept({ ...proposal, virtual: true }, req.user.userId);
      if (tradeResult.error) {
        return res.status(tradeResult.status || 400).json({ error: tradeResult.error });
      }
      npcWorld.respondNpcProposal(idParam, 'accepted');
      return res.json({
        success: true,
        proposal: { ...proposal, status: 'accepted' },
        inventory: tradeResult.inventory,
        coins: tradeResult.coins,
      });
    }
    const updated = npcWorld.respondNpcProposal(idParam, 'rejected');
    return res.json({ success: true, proposal: updated });
  }

  const proposalId = parseInt(idParam, 10);
  if (!proposalId) return res.status(400).json({ error: 'Invalid id' });

  if (db.isConnected()) {
    const pending = await db.query(
      `SELECT * FROM player_proposals
       WHERE id = $1 AND to_user_id = $2 AND status = 'pending'`,
      [proposalId, req.user.userId],
    );
    if (!pending.rows.length) return res.status(404).json({ error: 'Proposal not found' });
    const row = pending.rows[0];
    const proposal = rowToProposal(row);
    let tradeResult = null;

    if (action === 'accept') {
      tradeResult = await finalizeAccept(proposal, req.user.userId);
      if (tradeResult.error) {
        return res.status(tradeResult.status || 400).json({ error: tradeResult.error });
      }
    }

    const result = await db.query(
      `UPDATE player_proposals
       SET status = $1, responded_at = NOW()
       WHERE id = $2 AND to_user_id = $3 AND status = 'pending'
       RETURNING *`,
      [action === 'accept' ? 'accepted' : 'rejected', proposalId, req.user.userId],
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Proposal not found' });
    const saved = rowToProposal(result.rows[0]);
    const io = req.app.get('io');
    io?.to(String(saved.fromUserId)).emit('player-proposal:updated', saved);

    const accepterInventory = action === 'accept'
      ? (tradeResult?.accepterInventory || tradeResult?.inventory || await loadInventory(req.user.userId))
      : undefined;

    return res.json({
      success: true,
      proposal: saved,
      inventory: accepterInventory,
      proposerInventory: tradeResult?.proposerInventory,
    });
  }

  const idx = memProposals.findIndex(
    (p) => p.id === proposalId && String(p.toUserId) === String(req.user.userId),
  );
  if (idx < 0) return res.status(404).json({ error: 'Proposal not found' });

  let tradeResult = null;
  if (action === 'accept') {
    tradeResult = await finalizeAccept(memProposals[idx], req.user.userId);
    if (tradeResult.error) {
      return res.status(tradeResult.status || 400).json({ error: tradeResult.error });
    }
  }

  memProposals[idx].status = action === 'accept' ? 'accepted' : 'rejected';
  return res.json({
    success: true,
    proposal: memProposals[idx],
    inventory: tradeResult?.accepterInventory || tradeResult?.inventory,
    proposerInventory: tradeResult?.proposerInventory,
  });
});

module.exports = router;
