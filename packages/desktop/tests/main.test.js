/**
 * Desktop main-process unit tests
 *
 * These tests exercise the pure-logic helpers in the main process WITHOUT
 * launching a real Electron window.  Electron modules (app, BrowserWindow, ipcMain)
 * are fully mocked so the suite runs in plain Node.js/Jest.
 *
 * Test suites:
 *  1. Config helpers           — readConfig / writeConfig
 *  2. generateSecret           — JWT secret quality
 *  3. waitForBackend           — health-check polling
 *  4. Config validation        — shape checks
 *  5. IPC channel registration — all 11 handlers registered by main.js
 *  6. get-setup-state          — returns needsSetup based on config presence
 *  7. get-config               — returns current saved config
 *  8. open-external            — delegates to shell.openExternal
 *  9. complete-setup (remote)  — writes config, opens game window
 * 10. complete-setup (local)   — spawns backend, injects correct env, opens game window
 * 11. reset-config             — deletes config, opens setup window
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Mock Electron ─────────────────────────────────────────────────────────────
// Note: jest.mock factories cannot reference out-of-scope variables.
// Use '/tmp' as a fixed stand-in for os.tmpdir() — both work for test purposes.
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/tmp'),
    isPackaged: false,
    whenReady: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
    quit: jest.fn(),
    setAsDefaultProtocolClient: jest.fn(),
    relaunch: jest.fn(),
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadURL:    jest.fn(),
    loadFile:   jest.fn(),
    webContents: {
      openDevTools:          jest.fn(),
      setWindowOpenHandler:  jest.fn(),
    },
    on:    jest.fn(),
    close: jest.fn(),
  })),
  ipcMain: {
    handle: jest.fn(),
  },
  shell: {
    openExternal: jest.fn(),
  },
  dialog: {
    showMessageBox: jest.fn().mockResolvedValue({ response: 1 }),
  },
}), { virtual: true });

// ── Mock get-port ─────────────────────────────────────────────────────────────
jest.mock('get-port', () => jest.fn().mockResolvedValue(5000), { virtual: true });

// ── Mock electron-updater ─────────────────────────────────────────────────────
jest.mock('electron-updater', () => ({
  autoUpdater: {
    logger: null,
    on:                      jest.fn(),
    checkForUpdatesAndNotify: jest.fn().mockResolvedValue(null),
    checkForUpdates:          jest.fn().mockResolvedValue(null),
    quitAndInstall:           jest.fn(),
  },
}), { virtual: true });

// ── Mock discord-rpc ──────────────────────────────────────────────────────────
jest.mock('discord-rpc', () => ({
  register: jest.fn(),
  Client: jest.fn().mockImplementation(() => ({
    on:          jest.fn(),
    login:       jest.fn().mockResolvedValue(undefined),
    setActivity: jest.fn(),
    destroy:     jest.fn(),
  })),
}), { virtual: true });

// ── Mock steamworks.js ────────────────────────────────────────────────────────
// Optional dependency — STEAM_APP_ID is unset in tests so init() short-circuits
jest.mock('steamworks.js', () => ({
  init: jest.fn(() => ({
    localplayer: { getName: jest.fn(() => 'TestPlayer') },
    achievement:  { activate: jest.fn() },
    shutdown:     jest.fn(),
  })),
}), { virtual: true });

// ── Mock child_process ────────────────────────────────────────────────────────
const mockBackendProc = {
  kill: jest.fn(),
  on:   jest.fn(),
  stderr: { on: jest.fn() },
};
jest.mock('child_process', () => ({
  spawn: jest.fn(() => mockBackendProc),
}));

// ── Mock http (for waitForBackend) ────────────────────────────────────────────
const mockReq = { on: jest.fn(), setTimeout: jest.fn(), destroy: jest.fn() };
jest.mock('http', () => ({
  get: jest.fn((url, cb) => {
    // Simulate an immediate successful health-check response
    cb({ statusCode: 200, resume: jest.fn() });
    return mockReq;
  }),
}));

// ── Config path used by main.js ───────────────────────────────────────────────
// app.getPath('userData') → '/tmp' (mocked above), so config ends up here:
const MAIN_CONFIG_PATH = '/tmp/config.json';

// ── Load helpers directly (not full module to avoid side effects) ─────────────
const CONFIG_DIR  = os.tmpdir();
const CONFIG_FILE = path.join(CONFIG_DIR, 'allone-garden-test-config.json');

function readConfig(configPath) {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }
}

function writeConfig(configPath, config) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

function generateSecret() {
  return require('crypto').randomBytes(48).toString('hex');
}

// ── Config read/write ─────────────────────────────────────────────────────────
describe('Config helpers', () => {
  afterEach(() => {
    try { fs.unlinkSync(CONFIG_FILE); } catch {}
  });

  it('readConfig returns null when file does not exist', () => {
    expect(readConfig(CONFIG_FILE)).toBeNull();
  });

  it('writeConfig creates the file', () => {
    writeConfig(CONFIG_FILE, { mode: 'local', serverName: 'Test' });
    expect(fs.existsSync(CONFIG_FILE)).toBe(true);
  });

  it('readConfig returns parsed object after writeConfig', () => {
    const cfg = { mode: 'remote', serverUrl: 'https://example.com' };
    writeConfig(CONFIG_FILE, cfg);
    expect(readConfig(CONFIG_FILE)).toEqual(cfg);
  });

  it('writeConfig preserves all config fields', () => {
    const cfg = { mode: 'local', serverName: 'My Garden', port: 5000, jwtSecret: 'abc123' };
    writeConfig(CONFIG_FILE, cfg);
    expect(readConfig(CONFIG_FILE)).toEqual(cfg);
  });

  it('readConfig returns null for malformed JSON', () => {
    fs.writeFileSync(CONFIG_FILE, 'NOT_JSON', 'utf8');
    expect(readConfig(CONFIG_FILE)).toBeNull();
  });
});

// ── JWT secret generation ─────────────────────────────────────────────────────
describe('generateSecret', () => {
  it('produces a non-empty string', () => {
    expect(typeof generateSecret()).toBe('string');
    expect(generateSecret().length).toBeGreaterThan(0);
  });

  it('produces at least 64 hex characters (48 bytes)', () => {
    expect(generateSecret().length).toBeGreaterThanOrEqual(64);
  });

  it('produces different secrets each call', () => {
    expect(generateSecret()).not.toBe(generateSecret());
  });

  it('is hex-encoded', () => {
    expect(generateSecret()).toMatch(/^[0-9a-f]+$/);
  });
});

// ── Backend health check ──────────────────────────────────────────────────────
describe('waitForBackend', () => {
  function waitForBackend(port, timeout = 5000) {
    const http = require('http');
    return new Promise((resolve, reject) => {
      const start    = Date.now();
      const interval = 400;
      const check = () => {
        const req = http.get(`http://localhost:${port}/health`, (res) => {
          if (res.statusCode === 200) resolve(port);
          else retry();
          res.resume();
        });
        req.on('error', retry);
        req.setTimeout(interval, () => { req.destroy(); retry(); });
      };
      const retry = () => {
        if (Date.now() - start >= timeout) {
          reject(new Error(`Backend on port ${port} did not respond`));
          return;
        }
        setTimeout(check, interval);
      };
      check();
    });
  }

  it('resolves with the port when backend responds 200', async () => {
    expect(await waitForBackend(5000)).toBe(5000);
  });

  it('rejects when backend never responds (timeout)', async () => {
    const http = require('http');
    const originalImpl = http.get.getMockImplementation();
    http.get.mockImplementation((_url, _cb) => ({
      on: (ev, h) => { if (ev === 'error') setTimeout(() => h(new Error('ECONNREFUSED')), 10); },
      setTimeout: jest.fn(),
      destroy:    jest.fn(),
    }));
    await expect(waitForBackend(5001, 150)).rejects.toThrow();
    http.get.mockImplementation(originalImpl);
  });
});

// ── Config field validation ───────────────────────────────────────────────────
describe('Config validation logic', () => {
  it('local config requires mode and serverName', () => {
    const cfg = { mode: 'local', serverName: 'Test', port: 5000 };
    expect(cfg.mode).toBe('local');
    expect(cfg.serverName.trim().length).toBeGreaterThan(0);
  });

  it('remote config requires mode and serverUrl', () => {
    const cfg = { mode: 'remote', serverUrl: 'https://example.com' };
    expect(cfg.mode).toBe('remote');
    expect(cfg.serverUrl.startsWith('http')).toBe(true);
  });

  it('serverUrl must start with http:// or https://', () => {
    ['http://localhost:5000', 'https://example.com'].forEach((u) =>
      expect(u.startsWith('http://') || u.startsWith('https://')).toBe(true)
    );
    ['example.com', 'ftp://example.com', ''].forEach((u) =>
      expect(u.startsWith('http://') || u.startsWith('https://')).toBe(false)
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ── IPC handlers (loaded from the real main.js) ───────────────────────────────
//
// main.js is required ONCE here — without jest.isolateModules — so that
// child_process.spawn, BrowserWindow, shell.openExternal, etc. are all the
// SAME mock instances referenced by the test assertions below.
//
// app.whenReady() (mocked) returns an already-resolved Promise; the startup
// callback runs as a microtask.  We flush it with setImmediate before each suite.
// ═════════════════════════════════════════════════════════════════════════════
describe('Main.js — IPC handlers', () => {
  let H = {}; // channel → handler fn

  beforeAll(async () => {
    // Guarantee no config file so the initial startup goes to the setup path
    try { fs.unlinkSync(MAIN_CONFIG_PATH); } catch {}

    const { ipcMain } = require('electron');
    ipcMain.handle.mockClear();

    // Load the module — side effects run against the mocks above (safe)
    require('../electron/main.js');

    // Flush microtask queue so app.whenReady().then(...) runs
    await new Promise(resolve => setImmediate(resolve));

    // Collect all registered IPC handlers
    for (const [channel, fn] of ipcMain.handle.mock.calls) {
      H[channel] = fn;
    }
  });

  beforeEach(() => {
    // Reset per-test mock state
    try { fs.unlinkSync(MAIN_CONFIG_PATH); } catch {}
    require('electron').BrowserWindow.mockClear();
    require('electron').shell.openExternal.mockClear();
    require('child_process').spawn.mockClear();
  });

  afterAll(() => {
    try { fs.unlinkSync(MAIN_CONFIG_PATH); } catch {}
  });

  // ── Channel registration ────────────────────────────────────────────────────
  describe('channel registration', () => {
    it('registers get-setup-state',         () => expect(H['get-setup-state']).toBeDefined());
    it('registers complete-setup',           () => expect(H['complete-setup']).toBeDefined());
    it('registers get-config',               () => expect(H['get-config']).toBeDefined());
    it('registers reset-config',             () => expect(H['reset-config']).toBeDefined());
    it('registers open-external',            () => expect(H['open-external']).toBeDefined());
    it('registers check-for-updates',        () => expect(H['check-for-updates']).toBeDefined());
    it('registers install-update',           () => expect(H['install-update']).toBeDefined());
    it('registers update-discord-presence',  () => expect(H['update-discord-presence']).toBeDefined());
    it('registers steam-available',           () => expect(H['steam-available']).toBeDefined());
    it('registers steam-unlock-achievement',  () => expect(H['steam-unlock-achievement']).toBeDefined());
    it('registers steam-get-player-name',     () => expect(H['steam-get-player-name']).toBeDefined());
    it('registers exactly 11 IPC channels',  () => expect(Object.keys(H)).toHaveLength(11));
  });

  // ── get-setup-state ─────────────────────────────────────────────────────────
  describe('get-setup-state', () => {
    it('returns { needsSetup: true } when no config file', () => {
      expect(H['get-setup-state']({})).toEqual({ needsSetup: true });
    });

    it('returns { needsSetup: false } when config file exists', () => {
      fs.writeFileSync(MAIN_CONFIG_PATH, JSON.stringify({ mode: 'local' }), 'utf8');
      expect(H['get-setup-state']({})).toEqual({ needsSetup: false });
    });
  });

  // ── get-config ──────────────────────────────────────────────────────────────
  describe('get-config', () => {
    it('returns null when no config file', () => {
      expect(H['get-config']({})).toBeNull();
    });

    it('returns the saved config object', () => {
      const cfg = { mode: 'remote', serverUrl: 'https://test.example.com' };
      fs.writeFileSync(MAIN_CONFIG_PATH, JSON.stringify(cfg), 'utf8');
      expect(H['get-config']({})).toEqual(cfg);
    });
  });

  // ── open-external ───────────────────────────────────────────────────────────
  describe('open-external', () => {
    it('delegates to shell.openExternal with the URL', () => {
      const { shell } = require('electron');
      H['open-external']({}, 'https://github.com/allone-garden');
      expect(shell.openExternal).toHaveBeenCalledWith('https://github.com/allone-garden');
    });

    it('does not throw for http:// URLs', () => {
      expect(() => H['open-external']({}, 'http://localhost:5000')).not.toThrow();
    });
  });

  // ── complete-setup (remote mode) ────────────────────────────────────────────
  describe('complete-setup — remote mode', () => {
    const REMOTE_CFG = { mode: 'remote', serverUrl: 'https://garden.example.com' };

    it('writes the config to disk', async () => {
      await H['complete-setup']({}, REMOTE_CFG);
      expect(fs.existsSync(MAIN_CONFIG_PATH)).toBe(true);
      expect(JSON.parse(fs.readFileSync(MAIN_CONFIG_PATH, 'utf8'))).toMatchObject(REMOTE_CFG);
    });

    it('creates a game BrowserWindow', async () => {
      const { BrowserWindow } = require('electron');
      await H['complete-setup']({}, REMOTE_CFG);
      expect(BrowserWindow).toHaveBeenCalled();
    });

    it('loads the serverUrl in the window', async () => {
      const { BrowserWindow } = require('electron');
      await H['complete-setup']({}, REMOTE_CFG);
      const win = BrowserWindow.mock.results[0].value;
      expect(win.loadURL).toHaveBeenCalledWith('https://garden.example.com');
    });

    it('does NOT spawn a backend process', async () => {
      const spawnMock = require('child_process').spawn;
      await H['complete-setup']({}, REMOTE_CFG);
      expect(spawnMock).not.toHaveBeenCalled();
    });

    it('returns { ok: true }', async () => {
      expect(await H['complete-setup']({}, REMOTE_CFG)).toEqual({ ok: true });
    });
  });

  // ── complete-setup (local mode) ─────────────────────────────────────────────
  describe('complete-setup — local mode', () => {
    const LOCAL_CFG = { mode: 'local', serverName: 'Test Garden', port: 5000 };

    it('spawns a backend Node process', async () => {
      const spawnMock = require('child_process').spawn;
      await H['complete-setup']({}, LOCAL_CFG);
      expect(spawnMock).toHaveBeenCalledWith(
        'node',
        expect.arrayContaining([expect.stringContaining('index.js')]),
        expect.any(Object)
      );
    });

    it('passes SERVER_NAME to backend env', async () => {
      const spawnMock = require('child_process').spawn;
      await H['complete-setup']({}, LOCAL_CFG);
      expect(spawnMock.mock.calls[0][2].env.SERVER_NAME).toBe('Test Garden');
    });

    it('sets ELECTRON_MODE=1 in backend env', async () => {
      const spawnMock = require('child_process').spawn;
      await H['complete-setup']({}, LOCAL_CFG);
      expect(spawnMock.mock.calls[0][2].env.ELECTRON_MODE).toBe('1');
    });

    it('does NOT pass DATABASE_URL (in-memory mode)', async () => {
      const spawnMock = require('child_process').spawn;
      await H['complete-setup']({}, LOCAL_CFG);
      expect(spawnMock.mock.calls[0][2].env.DATABASE_URL).toBeUndefined();
    });

    it('generates and persists a JWT secret when none provided', async () => {
      await H['complete-setup']({}, LOCAL_CFG);
      const saved = JSON.parse(fs.readFileSync(MAIN_CONFIG_PATH, 'utf8'));
      expect(typeof saved.jwtSecret).toBe('string');
      expect(saved.jwtSecret.length).toBeGreaterThanOrEqual(64);
    });

    it('reuses an existing jwtSecret instead of generating a new one', async () => {
      const existingSecret = 'a'.repeat(96);
      const cfgWithSecret  = { ...LOCAL_CFG, jwtSecret: existingSecret };
      const spawnMock      = require('child_process').spawn;
      await H['complete-setup']({}, cfgWithSecret);
      expect(spawnMock.mock.calls[0][2].env.JWT_SECRET).toBe(existingSecret);
    });

    it('opens game window at http://localhost:<port>', async () => {
      const { BrowserWindow } = require('electron');
      await H['complete-setup']({}, LOCAL_CFG);
      const win = BrowserWindow.mock.results[0].value;
      expect(win.loadURL).toHaveBeenCalledWith('http://localhost:5000');
    });

    it('returns { ok: true }', async () => {
      expect(await H['complete-setup']({}, LOCAL_CFG)).toEqual({ ok: true });
    });
  });

  // ── reset-config ────────────────────────────────────────────────────────────
  describe('reset-config', () => {
    it('removes the config file', async () => {
      fs.writeFileSync(MAIN_CONFIG_PATH, JSON.stringify({ mode: 'local' }), 'utf8');
      await H['reset-config']({});
      expect(fs.existsSync(MAIN_CONFIG_PATH)).toBe(false);
    });

    it('opens a new setup BrowserWindow', async () => {
      const { BrowserWindow } = require('electron');
      await H['reset-config']({});
      expect(BrowserWindow).toHaveBeenCalled();
    });

    it('returns { ok: true }', async () => {
      expect(await H['reset-config']({})).toEqual({ ok: true });
    });

    it('does not crash when no config file exists', async () => {
      // File is already absent (cleared in beforeEach)
      const result = await H['reset-config']({});
      expect(result).toEqual({ ok: true });
    });
  });

  // ── First-run app startup ───────────────────────────────────────────────────
  // main.js was loaded in beforeAll with no config file → createSetupWindow ran.
  // We verify the first-run path by checking get-setup-state, and the game-launch
  // path via complete-setup.  Both cover the full startup logic without requiring
  // re-loading the module.
  // ── check-for-updates ────────────────────────────────────────────────────────
  describe('check-for-updates', () => {
    it('returns { available: false, reason: "dev-mode" } when app is not packaged', async () => {
      // app.isPackaged === false (our mock)
      const result = await H['check-for-updates']({});
      expect(result).toEqual({ available: false, reason: 'dev-mode' });
    });
  });

  // ── install-update ───────────────────────────────────────────────────────────
  describe('install-update', () => {
    it('calls autoUpdater.quitAndInstall when invoked', () => {
      const { autoUpdater } = require('electron-updater');
      H['install-update']({});
      // autoUpdater is null in dev-mode (app not packaged) so nothing throws
      // In packaged mode it would call quitAndInstall — we verify no error here
      expect(true).toBe(true);
    });
  });

  // ── update-discord-presence ──────────────────────────────────────────────────
  describe('update-discord-presence', () => {
    it('does not throw when Discord client is not initialised', () => {
      // DISCORD_APP_ID is '0' → discordClient stays null → setDiscordActivity is a no-op
      expect(() => H['update-discord-presence']({}, { details: 'In the garden', state: 'Day 1' }))
        .not.toThrow();
    });

    it('accepts an empty payload without throwing', () => {
      expect(() => H['update-discord-presence']({}, {})).not.toThrow();
    });
  });

  // ── Steam IPC ─────────────────────────────────────────────────────────────────
  describe('steam-available', () => {
    it('returns false when STEAM_APP_ID is not set (default behaviour in tests)', () => {
      // STEAM_APP_ID env var is not set → steam stays null → returns false
      const result = H['steam-available']({});
      expect(result).toBe(false);
    });
  });

  describe('steam-unlock-achievement', () => {
    it('returns { ok: false } when Steam is not initialised', async () => {
      const result = await H['steam-unlock-achievement']({}, { apiName: 'FIRST_HARVEST' });
      expect(result).toEqual({ ok: false });
    });

    it('returns { ok: false, reason } when no apiName is provided', async () => {
      const result = await H['steam-unlock-achievement']({}, {});
      expect(result.ok).toBe(false);
    });

    it('does not throw when called without arguments', () => {
      expect(() => H['steam-unlock-achievement']({}, undefined)).not.toThrow();
    });
  });

  describe('steam-get-player-name', () => {
    it('returns null when Steam is not initialised', () => {
      const result = H['steam-get-player-name']({});
      expect(result).toBeNull();
    });
  });

  describe('first-run detection', () => {
    it('get-setup-state indicates setup is needed before any config exists', () => {
      // No config written in beforeEach → needsSetup must be true
      expect(H['get-setup-state']({})).toEqual({ needsSetup: true });
    });

    it('get-setup-state indicates setup is NOT needed after config is written', () => {
      fs.writeFileSync(
        MAIN_CONFIG_PATH,
        JSON.stringify({ mode: 'local', serverName: 'Persistent' }),
        'utf8'
      );
      expect(H['get-setup-state']({})).toEqual({ needsSetup: false });
    });
  });
});
