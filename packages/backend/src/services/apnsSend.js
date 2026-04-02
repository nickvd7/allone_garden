/**
 * Direct APNs (HTTP/2) for native device tokens when not using FCM.
 * Env: APNS_KEY_PATH (.p8), APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID,
 * optional APNS_PRODUCTION=true for production gateway (default: sandbox).
 */
'use strict';

const fs    = require('fs');
const http2 = require('http2');
const jwt   = require('jsonwebtoken');

function apnsHost() {
  return process.env.APNS_PRODUCTION === 'true'
    ? 'api.push.apple.com'
    : 'api.sandbox.push.apple.com';
}

function loadSigningKey() {
  const p = process.env.APNS_KEY_PATH;
  if (!p) return null;
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    console.warn('[apns] Could not read APNS_KEY_PATH:', e.message);
    return null;
  }
}

function buildProviderToken() {
  const key = loadSigningKey();
  const kid = process.env.APNS_KEY_ID;
  const iss = process.env.APNS_TEAM_ID;
  if (!key || !kid || !iss) return null;
  return jwt.sign(
    { iss, iat: Math.floor(Date.now() / 1000) },
    key,
    { algorithm: 'ES256', header: { alg: 'ES256', kid } }
  );
}

function normalizeDeviceToken(t) {
  return String(t || '').replace(/\s/g, '').replace(/[<>]/g, '');
}

function sendOne(client, host, deviceToken, bearer, topic, payload) {
  return new Promise((resolve) => {
    const req = client.request({
      ':method':       'POST',
      ':path':         `/3/device/${deviceToken}`,
      ':scheme':       'https',
      ':authority':    host,
      authorization:   `bearer ${bearer}`,
      'apns-topic':    topic,
      'apns-push-type': 'alert',
      'content-type':  'application/json',
    });
    let status = 0;
    req.on('response', (headers) => {
      status = Number(headers[':status']) || 0;
    });
    req.on('data', () => {});
    req.on('end', () => resolve(status >= 200 && status < 300));
    req.on('error', () => resolve(false));
    req.end(payload);
  });
}

/**
 * @returns {Promise<{ sent: number, failures: number, mode: string }>}
 */
async function sendApnsMulticast(deviceTokens, { title, body }) {
  const topic = process.env.APNS_BUNDLE_ID;
  const bearer = buildProviderToken();
  if (!bearer || !topic || !deviceTokens.length) {
    return { sent: 0, failures: deviceTokens.length, mode: 'apns', reason: 'not_configured' };
  }

  const host = apnsHost();
  const payload = JSON.stringify({
    aps: {
      alert: { title, body },
      sound: 'default',
    },
  });

  const client = http2.connect(`https://${host}`, { timeout: 25000 });
  let sent = 0;
  let failures = 0;

  let connErr = false;
  client.on('error', (err) => {
    console.warn('[apns] connection error:', err.message);
    connErr = true;
  });

  try {
    for (const raw of deviceTokens.slice(0, 500)) {
      if (connErr) {
        failures++;
        continue;
      }
      const token = normalizeDeviceToken(raw);
      if (token.length < 32) {
        failures++;
        continue;
      }
      const ok = await sendOne(client, host, token, bearer, topic, payload);
      if (ok) sent++;
      else failures++;
    }
  } finally {
    try { client.close(); } catch { /* ignore */ }
  }

  return { sent, failures, mode: 'apns' };
}

function isApnsConfigured() {
  return !!(
    process.env.APNS_KEY_PATH
    && process.env.APNS_KEY_ID
    && process.env.APNS_TEAM_ID
    && process.env.APNS_BUNDLE_ID
  );
}

module.exports = { sendApnsMulticast, isApnsConfigured };
