/**
 * AllOne Garden — Electron Preload Script
 *
 * Exposes a safe contextBridge API (window.electronAPI) to the renderer process.
 * nodeIntegration is OFF — only these whitelisted methods are accessible from React.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Ask the main process whether first-run setup is needed.
   * Returns { needsSetup: boolean }
   */
  getSetupState: () => ipcRenderer.invoke('get-setup-state'),

  /**
   * Send the completed wizard config to main.
   * Main will save it, spawn backend if local, and open the game window.
   *
   * config shape:
   *   { mode: 'local'|'remote', serverName?: string, port?: number, serverUrl?: string }
   */
  completeSetup: (config) => ipcRenderer.invoke('complete-setup', config),

  /**
   * Read the currently saved config (for settings / info screen).
   */
  getConfig: () => ipcRenderer.invoke('get-config'),

  /**
   * Reset config → triggers setup wizard on restart.
   */
  resetConfig: () => ipcRenderer.invoke('reset-config'),

  /**
   * Open a URL in the user's default system browser (not in the app).
   */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  /**
   * Auto-update: manually trigger an update check.
   * Returns { available, version?, error? }
   */
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  /**
   * Auto-update: install downloaded update and relaunch.
   */
  installUpdate: () => ipcRenderer.invoke('install-update'),

  /**
   * Auto-update: subscribe to update events from main process.
   * 'update:available'  → { version }
   * 'update:downloaded' → { version }
   */
  onUpdateAvailable:  (cb) => ipcRenderer.once('update:available',  (_e, d) => cb(d)),
  onUpdateDownloaded: (cb) => ipcRenderer.once('update:downloaded', (_e, d) => cb(d)),

  /**
   * Discord Rich Presence: send current game state to main process.
   * payload: { details?, state?, season?, day? }
   */
  updatePresence: (payload) => ipcRenderer.invoke('update-discord-presence', payload),

  /**
   * Steam integration (all calls are no-ops when Steam is unavailable).
   */
  steamAvailable:        ()           => ipcRenderer.invoke('steam-available'),
  steamUnlockAchievement:(apiName)    => ipcRenderer.invoke('steam-unlock-achievement', { apiName }),
  steamGetPlayerName:    ()           => ipcRenderer.invoke('steam-get-player-name'),

  /**
   * Convenience: are we running inside Electron at all?
   * React code can check window.electronAPI?.isElectron === true.
   */
  isElectron: true,
});

// Signal the renderer whether we're in setup mode.
// main.js sets the window URL hash to #/setup for first-run.
// The React app checks window.__ELECTRON_SETUP__ (set here via window.location).
window.addEventListener('DOMContentLoaded', () => {
  if (window.location.hash === '#/setup') {
    window.__ELECTRON_SETUP__ = true;
  }
});
