'use strict';

/**
 * SSRF-hardening for plugin registry / download URLs (admin-only callers).
 *
 * - HTTPS only, default port 443, no embedded credentials
 * - Hostname must match PLUGIN_DOWNLOAD_ALLOWED_HOSTS (comma-separated),
 *   or if unset, a small built-in allowlist (GitHub CDNs)
 * - Resolves DNS and rejects private / loopback / link-local addresses
 */

const dns = require('dns').promises;

const DEFAULT_ALLOWED_HOST_SUFFIXES = [
  'raw.githubusercontent.com',
  'gist.githubusercontent.com',
  'objects.githubusercontent.com',
  'codeload.github.com',
  'github.com',
];

function parseAllowedHosts() {
  const raw = (process.env.PLUGIN_DOWNLOAD_ALLOWED_HOSTS || '').trim();
  if (!raw) return null;
  return raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

function hostMatchesAllowlist(hostname, allowlist) {
  const h = hostname.toLowerCase();
  for (const entry of allowlist) {
    const e = entry.toLowerCase();
    if (e.startsWith('*.')) {
      const base = e.slice(2);
      const suffix = `.${base}`;
      if (h === base || h.endsWith(suffix)) return true;
    } else if (h === e) {
      return true;
    }
  }
  return false;
}

function isHostnameAllowed(hostname) {
  const custom = parseAllowedHosts();
  const list = custom && custom.length > 0 ? custom : DEFAULT_ALLOWED_HOST_SUFFIXES;
  return hostMatchesAllowlist(hostname, list);
}

function isPrivateOrReservedIPv4(addr) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(addr);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  const d = Number(m[4]);
  if ([a, b, c, d].some((n) => n > 255)) return true;
  if (a === 0 || a === 127) return true;
  if (a === 10) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  return false;
}

function isPrivateOrBadIPv6(addr) {
  const x = addr.toLowerCase();
  if (x === '::1') return true;
  if (x.startsWith('fe80:')) return true;
  if (x.startsWith('fc') || x.startsWith('fd')) return true;
  if (x.startsWith('::ffff:')) {
    const v4 = x.slice(7);
    return isPrivateOrReservedIPv4(v4);
  }
  return false;
}

function literalHostIsBlocked(hostname) {
  const h = hostname.toLowerCase();
  if (h === 'localhost') return true;
  if (h.endsWith('.localhost')) return true;
  if (isPrivateOrReservedIPv4(h)) return true;
  if (h.includes(':')) return isPrivateOrBadIPv6(h);
  return false;
}

/**
 * @param {string} urlString
 * @throws {Error} when the URL must not be fetched
 */
async function assertSafeRemoteUrl(urlString) {
  let u;
  try {
    u = new URL(urlString);
  } catch {
    throw new Error('Invalid URL');
  }

  if (u.protocol !== 'https:') {
    throw new Error('Only https:// URLs are allowed');
  }
  if (u.username || u.password) {
    throw new Error('URL must not contain credentials');
  }
  const port = u.port || '443';
  if (port !== '443') {
    throw new Error('Only the default HTTPS port (443) is allowed');
  }

  const host = u.hostname;
  if (!host || literalHostIsBlocked(host)) {
    throw new Error('Host is not allowed');
  }
  if (!isHostnameAllowed(host)) {
    throw new Error(
      'Host is not on the plugin download allowlist — set PLUGIN_DOWNLOAD_ALLOWED_HOSTS to add it'
    );
  }

  let records;
  try {
    records = await dns.lookup(host, { all: true });
  } catch (e) {
    throw new Error('DNS resolution failed');
  }
  if (!records || records.length === 0) {
    throw new Error('DNS resolution returned no addresses');
  }
  for (const { address, family } of records) {
    if (family === 4 && isPrivateOrReservedIPv4(address)) {
      throw new Error('Resolved address is not reachable (private IPv4)');
    }
    if (family === 6 && isPrivateOrBadIPv6(address)) {
      throw new Error('Resolved address is not reachable (private IPv6)');
    }
  }
}

module.exports = {
  assertSafeRemoteUrl,
  _hostMatchesAllowlist: hostMatchesAllowlist,
  _isHostnameAllowed: isHostnameAllowed,
};
