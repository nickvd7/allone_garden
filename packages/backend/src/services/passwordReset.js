/**
 * Password-reset token issuance (DB + in-memory fallback).
 */
const crypto = require('crypto');
const db = require('../db');

const RESET_TTL_MS = 60 * 60 * 1000;
const memResetTokens = new Map();

async function issueResetToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + RESET_TTL_MS);

  if (db.isConnected()) {
    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET token = $2, expires_at = $3`,
      [userId, token, expires],
    );
    return token;
  }

  memResetTokens.set(token, { userId, expires });
  return token;
}

function getMemResetEntry(token) {
  return memResetTokens.get(token) || null;
}

function deleteMemResetToken(token) {
  memResetTokens.delete(token);
}

module.exports = {
  RESET_TTL_MS,
  issueResetToken,
  getMemResetEntry,
  deleteMemResetToken,
  memResetTokens,
};
