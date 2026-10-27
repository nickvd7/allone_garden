/** Contact for the temporary public site (Cloudflare / allone.garden). */
export const PUBLIC_CONTACT_EMAIL = 'mail@030.dev';

const OFFICIAL_HOSTS = new Set(['allone.garden', 'www.allone.garden']);

function normalizeHost(hostname) {
  return String(hostname || '').toLowerCase().split(':')[0].trim();
}

/**
 * Temporary public mode: only the homepage is published.
 * Login and register stay reachable so they can show "under construction".
 *
 * REACT_APP_HOMEPAGE_ONLY:
 *   true  — always (Cloudflare Pages build)
 *   false — never (self-hosted game)
 *   unset — on for allone.garden, www, and *.pages.dev
 */
export function isHomepageOnlySite(hostname, flag = process.env.REACT_APP_HOMEPAGE_ONLY) {
  const value = String(flag || '').trim().toLowerCase();
  if (value === 'false' || value === '0' || value === 'off') return false;
  if (value === 'true' || value === '1' || value === 'on') return true;

  const host = normalizeHost(
    hostname !== undefined && hostname !== null
      ? hostname
      : (typeof window !== 'undefined' ? window.location.hostname : '')
  );
  if (OFFICIAL_HOSTS.has(host)) return true;
  if (host.endsWith('.pages.dev')) return true;
  return false;
}

/** @returns {'home'|'auth'|'other'} */
export function publicSitePath(pathname) {
  const path = pathname || '/';
  if (path === '/' || path === '' || path === '/home' || path.startsWith('/home/')) return 'home';
  if (
    path === '/login' || path.startsWith('/login/')
    || path === '/register' || path.startsWith('/register/')
  ) return 'auth';
  return 'other';
}
