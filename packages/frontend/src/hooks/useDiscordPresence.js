/**
 * useDiscordPresence — updates Discord Rich Presence via Electron IPC.
 * Only active when running inside the Electron desktop app.
 *
 * Usage:
 *   useDiscordPresence({ details: 'In the garden', state: 'Day 3 · Spring' });
 *   // Call with updated values whenever game state changes.
 */
import { useEffect, useRef } from 'react';

export function useDiscordPresence({ details, state, season, day } = {}) {
  const prevRef = useRef('');

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.updatePresence) return; // not in Electron, skip silently

    // Avoid sending identical payloads on every render
    const key = `${details}|${state}|${season}|${day}`;
    if (key === prevRef.current) return;
    prevRef.current = key;

    api.updatePresence({ details, state, season, day }).catch(() => {});
  }, [details, state, season, day]);
}

export default useDiscordPresence;
