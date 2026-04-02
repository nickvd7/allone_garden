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

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

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
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(localStorage.getItem('garden_token')
          ? { Authorization: `Bearer ${localStorage.getItem('garden_token')}` }
          : {}),
      },
      body: JSON.stringify(payload),
    }).catch(() => { /* silently ignore */ });
  }, []);

  return { track };
}

export default useAnalytics;
