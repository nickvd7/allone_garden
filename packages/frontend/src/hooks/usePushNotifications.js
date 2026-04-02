/**
 * Registers the device for push (FCM/APNs) on native when REACT_APP_ENABLE_PUSH=true
 * and posts the token to POST /api/push/register. No-op on web.
 */
import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import api from './useApi';

export function usePushNotifications(authToken) {
  const listenersRef = useRef([]);

  useEffect(() => {
    if (process.env.REACT_APP_ENABLE_PUSH !== 'true') return;
    if (!authToken) return;
    if (Capacitor.getPlatform() === 'web') return;

    let cancelled = false;

    (async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const perm = await PushNotifications.requestPermissions();
        if (perm.receive !== 'granted') return;
        await PushNotifications.register();

        const h1 = await PushNotifications.addListener('registration', async ({ value }) => {
          if (cancelled || !value) return;
          try {
            const transport =
              process.env.REACT_APP_PUSH_TRANSPORT === 'apns' ? 'apns' : 'fcm';
            await api.post('/api/push/register', {
              token: value,
              platform: Capacitor.getPlatform(),
              transport,
            });
          } catch {
            /* offline / 401 */
          }
        });
        const h2 = await PushNotifications.addListener('registrationError', (err) => {
          if (process.env.NODE_ENV === 'development') console.warn('[push]', err);
        });
        listenersRef.current = [h1, h2];
      } catch (e) {
        if (process.env.NODE_ENV === 'development') console.warn('[push]', e.message);
      }
    })();

    return () => {
      cancelled = true;
      listenersRef.current.forEach((h) => h?.remove?.());
      listenersRef.current = [];
    };
  }, [authToken]);
}
