/**
 * useAnalytics — lightweight self-hosted event tracking hook.
 *
 * Usage:
 *   const { track } = useAnalytics();
 *   track('crop_planted', { cropType: 'tomato', season: 'spring' });
 *
 * Events are fire-and-forget: failures are silently ignored so the game
 * is never blocked by analytics errors.
 */
import { useCallback } from 'react';
import { getBearerAuthHeader, getFetchCredentials } from '../auth/session';

const BASE = process.env.REACT_APP_API_URL || '';

// Persistent session ID for the browser tab lifetime
let _sessionId = null;
function getSessionId() {
  if (!_sessionId) {
    _sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  return _sessionId;
}

export function useAnalytics() {
  const track = useCallback((eventName, properties = {}) => {
    const payload = {
      event:     eventName,
      properties,
      sessionId: getSessionId(),
    };

    // Fire-and-forget — never await, never throw
    fetch(`${BASE}/api/analytics/event`, {
      method:      'POST',
      credentials: getFetchCredentials(),
      headers:     {
        'Content-Type': 'application/json',
        ...getBearerAuthHeader(),
      },
      body: JSON.stringify(payload),
    }).catch(() => { /* silently ignore */ });
  }, []);

  return { track };
}

export default useAnalytics;
