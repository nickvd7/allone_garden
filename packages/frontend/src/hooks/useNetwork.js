/**
 * useNetwork hook
 *
 * Returns { online: boolean }.
 * On web: uses the browser's navigator.onLine + events.
 * On native iOS/Android (Capacitor): uses the @capacitor/network plugin.
 */
import { useState, useEffect } from 'react';

// Detect Capacitor environment
function isNative() {
  return typeof window !== 'undefined' &&
    window.Capacitor?.isNativePlatform?.();
}

export function useNetwork() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (isNative()) {
      // Lazy-load Capacitor Network to avoid breaking the web build
      import('@capacitor/network').then(({ Network }) => {
        // Get initial status
        Network.getStatus().then((status) => setOnline(status.connected));

        // Listen for changes
        const handle = Network.addListener('networkStatusChange', (status) => {
          setOnline(status.connected);
        });

        return () => handle.remove();
      }).catch(() => {});
    } else {
      // Web fallback
      const onOnline  = () => setOnline(true);
      const onOffline = () => setOnline(false);
      window.addEventListener('online',  onOnline);
      window.addEventListener('offline', onOffline);
      setOnline(navigator.onLine);
      return () => {
        window.removeEventListener('online',  onOnline);
        window.removeEventListener('offline', onOffline);
      };
    }
  }, []);

  return { online };
}

export default useNetwork;
