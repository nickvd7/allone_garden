/**
 * Service worker registration for PWA / offline support.
 *
 * - Caches the app shell so the game loads instantly on repeat visits.
 * - Works on iOS (Safari) and Android (Chrome).
 * - The SW file itself is at /public/sw.js and is served from the root.
 */

export function register() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('[SW] Registered, scope:', reg.scope);

        reg.onupdatefound = () => {
          const installing = reg.installing;
          installing.onstatechange = () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available — notify the app so it can show a refresh banner
              window.dispatchEvent(new CustomEvent('swUpdateAvailable'));
            }
          };
        };
      })
      .catch((err) => {
        console.warn('[SW] Registration failed:', err);
      });
  });
}

export function unregister() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => reg.unregister())
    .catch(console.error);
}
