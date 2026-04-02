/**
 * useMobile — Capacitor integration hook.
 *
 * Detects whether the app is running inside a Capacitor native shell
 * (Android / iOS) and exposes:
 *
 *   isNative       — true when running in Capacitor (not in browser)
 *   isOnline       — current network reachability (updates in real-time)
 *   triggerHaptic  — light haptic feedback (no-op in browser)
 *
 * Safe to use in any environment:
 *   - Browser (web)          → isNative=false, triggerHaptic is a no-op
 *   - Capacitor (Android/iOS) → full native integration
 *
 * Usage:
 *   const { isNative, isOnline, triggerHaptic } = useMobile();
 */
import { useState, useEffect, useCallback } from 'react';

// Capacitor's top-level Capacitor object is injected by the native shell.
// Accessing it through window avoids import errors when running in a browser.
function isCapacitor() {
  return typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
}

export function useMobile() {
  const [isNative]  = useState(isCapacitor);
  const [isOnline,  setIsOnline]  = useState(true);

  // ── Network status ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isNative) {
      // Browser fallback: listen to the standard navigator.onLine events
      const handleOnline  = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);
      window.addEventListener('online',  handleOnline);
      window.addEventListener('offline', handleOffline);
      setIsOnline(navigator.onLine);
      return () => {
        window.removeEventListener('online',  handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    // Capacitor native: use @capacitor/network
    let listenerHandle = null;

    (async () => {
      try {
        const { Network } = await import('@capacitor/network');
        // Get initial status
        const status = await Network.getStatus();
        setIsOnline(status.connected);
        // Subscribe to changes
        listenerHandle = await Network.addListener('networkStatusChange', (s) => {
          setIsOnline(s.connected);
        });
      } catch {
        // Plugin unavailable — fall back to navigator
        setIsOnline(navigator.onLine);
      }
    })();

    return () => {
      listenerHandle?.remove?.().catch?.(() => {});
    };
  }, [isNative]);

  // ── Haptic feedback ──────────────────────────────────────────────────────────
  const triggerHaptic = useCallback(async (style = 'LIGHT') => {
    if (!isNative) return;
    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      await Haptics.impact({ style: ImpactStyle[style] ?? ImpactStyle.Light });
    } catch { /* Haptics unavailable on this device */ }
  }, [isNative]);

  return { isNative, isOnline, triggerHaptic };
}
