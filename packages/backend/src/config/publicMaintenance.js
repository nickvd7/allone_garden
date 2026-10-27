'use strict';

/** Same address the public login/register screen shows while the API is paused. */
const PUBLIC_CONTACT_EMAIL = 'mail@030.dev';

const OFFICIAL_HOSTS = new Set(['allone.garden', 'www.allone.garden']);

function normalizeHost(hostname) {
  return String(hostname || '').toLowerCase().split(':')[0].trim();
}

/**
 * Temporary pause of the public API on the Cloudflare site.
 *
 * PUBLIC_SITE_MAINTENANCE:
 *   true  — every host
 *   false — nobody (turns the game API back on)
 *   unset — only allone.garden and www.allone.garden
 */
function publicMaintenanceActive(hostname) {
  const flag = String(process.env.PUBLIC_SITE_MAINTENANCE || '').trim().toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'off') return false;
  if (flag === 'true' || flag === '1' || flag === 'on') return true;
  return OFFICIAL_HOSTS.has(normalizeHost(hostname));
}

function maintenanceBody() {
  return {
    error: 'Under construction',
    message: 'Login en registratie zijn tijdelijk niet beschikbaar. De server staat even uit.',
    contact: PUBLIC_CONTACT_EMAIL,
  };
}

module.exports = {
  PUBLIC_CONTACT_EMAIL,
  publicMaintenanceActive,
  maintenanceBody,
};
