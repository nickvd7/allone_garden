/**
 * When the browser goes offline, failed garden saves are queued in localStorage
 * and retried once when back online. Uses ifUnmodifiedSince when available;
 * on 409 conflict the queue is cleared (server wins).
 */
import { useEffect, useRef } from 'react';
import {
  AUTH_HTTPONLY,
  getBearerAuthHeader,
  getFetchCredentials,
  readGardenToken,
} from '../auth/session';

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const QUEUE_KEY = 'allone_garden_offline_garden_queue';

/** Sync with App.js — last known server `updated_at` for optimistic concurrency */
export const GARDEN_SERVER_UPDATED_KEY = 'allone_garden_server_updated_at';

function loadQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(q) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-5)));
  } catch { /* quota */ }
}

export function useOfflineGardenQueue({ enabled, gameState, backendUp }) {
  const lastOnline = useRef(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    if (!enabled || !backendUp) return;

    const flush = async () => {
      const q = loadQueue();
      if (!q.length) return;
      const token = readGardenToken();
      if (!AUTH_HTTPONLY && !token) {
        saveQueue([]);
        return;
      }
      const next = [];
      for (const payload of q) {
        const since = typeof localStorage !== 'undefined'
          ? localStorage.getItem(GARDEN_SERVER_UPDATED_KEY)
          : null;
        const body = { ...payload };
        if (since) body.ifUnmodifiedSince = since;
        try {
          const res = await fetch(`${BASE}/api/garden`, {
            method:      'POST',
            credentials: getFetchCredentials(),
            headers:     {
              'Content-Type': 'application/json',
              ...getBearerAuthHeader(),
            },
            body: JSON.stringify(body),
          });
          if (res.status === 409) {
            saveQueue([]);
            return;
          }
          if (!res.ok) {
            next.push(payload);
            continue;
          }
          const json = await res.json().catch(() => ({}));
          if (json.serverUpdatedAt && typeof localStorage !== 'undefined') {
            localStorage.setItem(GARDEN_SERVER_UPDATED_KEY, json.serverUpdatedAt);
          }
        } catch {
          next.push(payload);
        }
      }
      saveQueue(next);
    };

    const onOnline = () => {
      if (!lastOnline.current && typeof navigator !== 'undefined' && navigator.onLine) {
        flush();
      }
      lastOnline.current = navigator.onLine;
    };

    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [enabled, backendUp]);

  useEffect(() => {
    if (!enabled || !backendUp) return;
    if (typeof navigator === 'undefined' || navigator.onLine) return;

    const payload = {
      plots:      gameState.plots,
      currentDay: gameState.currentDay,
      weather:    gameState.weather,
    };
    const q = loadQueue().filter((p) => JSON.stringify(p) !== JSON.stringify(payload));
    q.push(payload);
    saveQueue(q);
  }, [enabled, backendUp, gameState.plots, gameState.currentDay, gameState.weather]);
}
