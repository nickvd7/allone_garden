/**
 * Push notification device tokens (mobile).
 *
 * POST   /api/push/register   — store FCM or native APNs token (auth)
 * DELETE /api/push/register   — remove stored token
 * POST   /api/push/analytics  — optional client event (opened, etc.) for metrics
 *
 * transport: "fcm" (default) | "apns" — use apns for direct APNs without Firebase.
 */
'use strict';

const fs      = require('fs');
const express = require('express');
const fetch   = require('node-fetch');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { sendApnsMulticast, isApnsConfigured } = require('../services/apnsSend');

const { redisClient, isRedisReady } = require('../redis');

const memStore = new Map();
const REDIS_PREFIX = 'push:token:';
const USE_REDIS = process.env.PUSH_USE_REDIS === 'true';

async function saveToken(userId, payload) {
  const key = String(userId);
  const data = JSON.stringify(payload);
  if (USE_REDIS && isRedisReady() && redisClient) {
    try {
      await redisClient.set(`${REDIS_PREFIX}${key}`, data, { EX: 60 * 60 * 24 * 365 });
      return;
    } catch (e) {
      console.warn('[push] Redis save failed, using memory:', e.message);
    }
  }
  memStore.set(key, payload);
}

async function deleteToken(userId) {
  const key = String(userId);
  if (USE_REDIS && isRedisReady() && redisClient) {
    try {
      await redisClient.del(`${REDIS_PREFIX}${key}`);
      return;
    } catch (e) {
      console.warn('[push] Redis delete failed:', e.message);
    }
  }
  memStore.delete(key);
}

function parseStored(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

/**
 * All stored tokens for admin broadcast (memory + Redis, de-duplicated by user id).
 * Each row: { userId, token, platform, transport }
 */
async function getAllPushTokens() {
  const map = new Map();
  for (const [uid, v] of memStore.entries()) {
    if (v && v.token) {
      map.set(String(uid), {
        userId: uid,
        token: v.token,
        platform: v.platform || 'unknown',
        transport: (v.transport || 'fcm').toLowerCase(),
      });
    }
  }
  if (USE_REDIS && isRedisReady() && redisClient) {
    try {
      const keys = await redisClient.keys(`${REDIS_PREFIX}*`);
      for (const k of keys) {
        const uid = k.replace(REDIS_PREFIX, '');
        if (map.has(uid)) continue;
        const raw = await redisClient.get(k);
        const v = parseStored(raw);
        if (v && v.token) {
          map.set(uid, {
            userId: uid,
            token: v.token,
            platform: v.platform || 'unknown',
            transport: (v.transport || 'fcm').toLowerCase(),
          });
        }
      }
    } catch (e) {
      console.warn('[push] Redis list tokens:', e.message);
    }
  }
  return [...map.values()];
}

function loadServiceAccountCredentials() {
  try {
    if (process.env.FCM_SERVICE_ACCOUNT_JSON) {
      return JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON);
    }
    if (process.env.FCM_SERVICE_ACCOUNT_PATH) {
      return JSON.parse(fs.readFileSync(process.env.FCM_SERVICE_ACCOUNT_PATH, 'utf8'));
    }
  } catch (e) {
    console.warn('[push] Could not load FCM service account:', e.message);
  }
  return null;
}

async function sendFcmLegacyMulticast(tokens, { title, body }) {
  const key = process.env.FCM_SERVER_KEY;
  if (!key || !tokens.length) return { sent: 0, skipped: tokens.length, reason: 'no_key_or_tokens' };

  const res = await fetch('https://fcm.googleapis.com/fcm/send', {
    method:  'POST',
    headers: {
      Authorization: `key=${key}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      registration_ids: tokens,
      notification:     { title, body },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || json.message || `FCM HTTP ${res.status}`);
  }
  const success = json.success || 0;
  return { sent: success, failure: json.failure || 0, multicast_id: json.multicast_id, mode: 'fcm_legacy' };
}

async function sendFcmV1Multicast(tokens, { title, body }) {
  const creds = loadServiceAccountCredentials();
  if (!creds) {
    return { sent: 0, skipped: tokens.length, reason: 'no_credentials', mode: 'fcm_v1' };
  }
  const projectId = process.env.FCM_PROJECT_ID || creds.project_id;
  if (!projectId) {
    throw new Error('FCM_PROJECT_ID or project_id in service account JSON is required');
  }

  const { GoogleAuth } = require('google-auth-library');
  const auth = new GoogleAuth({
    credentials: creds,
    projectId,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });
  const client = await auth.getClient();
  const { token: oauthToken } = await client.getAccessToken();
  if (!oauthToken) throw new Error('No OAuth access token for FCM v1');

  let sent = 0;
  let failures = 0;
  for (const deviceToken of tokens) {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method:  'POST',
        headers: {
          Authorization: `Bearer ${oauthToken}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          message: {
            token: deviceToken,
            notification: { title, body },
          },
        }),
      },
    );
    if (res.ok) sent++;
    else failures++;
  }
  return { sent, failures, mode: 'fcm_v1' };
}

async function sendFcmCombinedMulticast(tokens, { title, body }) {
  const list = [...new Set(tokens)].filter(Boolean).slice(0, 1000);
  if (!list.length) return { sent: 0, failures: 0, mode: 'none' };

  const preferV1 = !!(process.env.FCM_SERVICE_ACCOUNT_JSON || process.env.FCM_SERVICE_ACCOUNT_PATH);
  if (preferV1) {
    try {
      const r = await sendFcmV1Multicast(list, { title, body });
      if (r.reason !== 'no_credentials') return r;
    } catch (e) {
      console.warn('[push] FCM v1 failed, trying legacy:', e.message);
    }
  }
  return sendFcmLegacyMulticast(list, { title, body });
}

/**
 * @param {Array<{ token: string, transport?: string }|string>} rowsOrStrings
 */
async function sendPushBroadcast(rowsOrStrings, { title, body }) {
  let rows = rowsOrStrings || [];
  if (rows.length && typeof rows[0] === 'string') {
    rows = rows.map((t) => ({ token: t, transport: 'fcm' }));
  }
  const withToken = rows.filter((r) => r && r.token && typeof r.token === 'string').slice(0, 1000);
  const apnsRows = withToken.filter((r) => (r.transport || 'fcm').toLowerCase() === 'apns');
  const fcmRows = withToken.filter((r) => (r.transport || 'fcm').toLowerCase() !== 'apns');

  let sent = 0;
  let failures = 0;
  const modes = [];

  if (apnsRows.length) {
    if (isApnsConfigured()) {
      const r = await sendApnsMulticast(apnsRows.map((x) => x.token), { title, body });
      sent += r.sent;
      failures += r.failures;
      modes.push(r.mode);
    } else {
      failures += apnsRows.length;
      modes.push('apns_unconfigured');
    }
  }

  if (fcmRows.length) {
    const r = await sendFcmCombinedMulticast(fcmRows.map((x) => x.token), { title, body });
    const s =
      r.sent !== null && r.sent !== undefined ? r.sent : r.success || 0;
    const f =
      r.failures !== null && r.failures !== undefined
        ? r.failures
        : r.failure || 0;
    sent += s;
    failures += f;
    modes.push(r.mode || 'fcm');
  }

  return { sent, failures, mode: modes.filter(Boolean).join('+') || 'none' };
}

router.post('/register', requireAuth, async (req, res) => {
  const { token, platform, transport: trRaw } = req.body || {};
  if (!token || typeof token !== 'string' || token.length < 10 || token.length > 2048) {
    return res.status(400).json({ error: 'Invalid push token' });
  }
  const plat = typeof platform === 'string' && platform.length < 64 ? platform : 'unknown';
  const transport = typeof trRaw === 'string' && trRaw.toLowerCase() === 'apns' ? 'apns' : 'fcm';
  try {
    await saveToken(req.user.userId, { token, platform: plat, at: Date.now(), transport });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[push] register error:', e.message);
    return res.status(500).json({ error: 'Could not store push token' });
  }
});

router.delete('/register', requireAuth, async (req, res) => {
  try {
    await deleteToken(req.user.userId);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[push] delete error:', e.message);
    return res.status(500).json({ error: 'Could not remove push token' });
  }
});

router.post('/analytics', requireAuth, async (req, res) => {
  const { event } = req.body || {};
  if (!event || typeof event !== 'string' || event.length < 1 || event.length > 64) {
    return res.status(400).json({ error: 'event string required (1–64 chars)' });
  }
  try {
    const { logPushClientEvent } = require('../services/pushLog');
    await logPushClientEvent(req.user.userId, event);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Could not record event' });
  }
});

module.exports = {
  router,
  getAllPushTokens,
  sendFcmLegacyMulticast,
  sendFcmV1Multicast,
  sendPushBroadcast,
};
