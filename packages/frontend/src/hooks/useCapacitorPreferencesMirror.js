/**
 * On native (iOS/Android), mirrors critical localStorage keys to @capacitor/preferences
 * so WebView clears are less likely to lose sync metadata. Restores on load if local is empty.
 */
import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { AUTH_HTTPONLY } from '../auth/session';
import { GARDEN_SERVER_UPDATED_KEY } from './useOfflineGardenQueue';

const KEYS = AUTH_HTTPONLY
  ? [GARDEN_SERVER_UPDATED_KEY]
  : [GARDEN_SERVER_UPDATED_KEY, 'garden_token'];

export function useCapacitorPreferencesMirror({ enabled }) {
  useEffect(() => {
    if (!enabled || Capacitor.getPlatform() === 'web') return;

    let cancelled = false;
    let intervalId;

    (async () => {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        for (const key of KEYS) {
          const { value } = await Preferences.get({ key });
          if (value && typeof localStorage !== 'undefined' && !localStorage.getItem(key)) {
            localStorage.setItem(key, value);
          }
        }
        const syncOut = async () => {
          if (cancelled) return;
          try {
            for (const key of KEYS) {
              const v = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
              if (v) await Preferences.set({ key, value: v });
            }
          } catch { /* ignore */ }
        };
        await syncOut();
        intervalId = window.setInterval(syncOut, 30_000);
      } catch {
        /* optional dependency */
      }
    })();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [enabled]);
}
