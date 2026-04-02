/**
 * AllOne Garden — Electron Main Process
 *
 * Responsibilities:
 *  1. Read config from userData on startup.
 *  2. First run → show setup wizard, wait for configuration.
 *  3. Local mode → spawn backend child process, wait for it to be healthy,
 *     then load the game URL.
 *  4. Remote mode → load the user-supplied server URL directly.
 *  5. On quit → kill the backend child process cleanly.
 */
'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const http   = require('http');
const { spawn } = require('child_process');
const getPort = require('get-port');

// ── Auto-updater (only active in packaged builds) ─────────────────────────────
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.logger = null; // silence verbose logs; errors still go to console.error
} catch { /* not available in dev / test environment */ }

// ── Discord Rich Presence ─────────────────────────────────────────────────────
// Requires a Discord Application created at https://discord.com/developers/applications
// Set DISCORD_APP_ID in your environment or config to enable Rich Presence.
const DISCORD_APP_ID = process.env.DISCORD_APP_ID || '0';
let discordRpc    = null;
let discordClient = null;

async function initDiscord() {
  if (DISCORD_APP_ID === '0') return; // not configured
  try {
    discordRpc = require('discord-rpc');
    discordRpc.register(DISCORD_APP_ID);
    discordClient = new discordRpc.Client({ transport: 'ipc' });
    discordClient.on('ready', () => {
      setDiscordActivity({ details: 'Starting up…', state: 'In the garden' });
    });
    await discordClient.login({ clientId: DISCORD_APP_ID });
  } catch (err) {
    console.warn('[discord] Rich Presence unavailable:', err.message);
    discordClient = null;
  }
}

function setDiscordActivity({ details, state, season, day } = {}) {
  if (!discordClient) return;
  try {
    discordClient.setActivity({
      details:    details || 'Tending the garden',
      state:      state   || 'AllOne Garden',
      largeImageKey:  'garden_logo',
      largeImageText: 'AllOne Garden',
      smallImageText: season ? `Season: ${season}` : undefined,
      ...(day ? { startTimestamp: Date.now() } : {}),
    });
  } catch { /* ignore */ }
}

function destroyDiscord() {
  try { discordClient?.destroy(); } catch {}
  discordClient = null;
}

// ── Steam (steamworks.js — optional, only active in packaged builds with SDK) ──
// steamworks.js wraps the Steamworks C++ SDK via a native addon.
// It is an optional peer dependency: if the package or the native .node file is
// absent the game continues to run normally without Steam features.
//
// Set STEAM_APP_ID env var or drop a steam_appid.txt in the desktop package root
// to enable Steam integration. Steam must be running when the app is launched.
let steam = null;

function initSteam() {
  try {
    const Steamworks = require('steamworks.js');
    const appId = parseInt(
      process.env.STEAM_APP_ID ||
      (() => {
        try {
          return require('fs').readFileSync(
            require('path').join(__dirname, '..', 'steam_appid.txt'), 'utf8'
          ).trim();
        } catch { return '0'; }
      })(),
      10
    );
    if (!appId || appId === 0) return; // not configured
    steam = Steamworks.init(appId);
    console.log(`[steam] Initialized. AppID=${appId}, display name: ${steam.localplayer.getName()}`);
  } catch (err) {
    // SDK not present, or Steam not running — non-fatal
    console.warn('[steam] Steamworks unavailable:', err.message);
    steam = null;
  }
}

function shutdownSteam() {
  try { steam?.shutdown?.(); } catch {}
  steam = null;
}

// Unlock a Steam achievement by API name (e.g. 'FIRST_HARVEST')
function unlockAchievement(apiName) {
  if (!steam) return false;
  try {
    steam.achievement.activate(apiName);
    return true;
  } catch (err) {
    console.warn('[steam] Achievement unlock failed:', err.message);
    return false;
  }
}

// ── Paths ─────────────────────────────────────────────────────────────────────
const IS_DEV = process.env.NODE_ENV === 'development' || !app.isPackaged;

// When packaged, extraResources are placed at process.resourcesPath/...
// When dev, the monorepo structure is used directly.
const BACKEND_ROOT = IS_DEV
  ? path.resolve(__dirname, '../../../backend')
  : path.join(process.resourcesPath, 'backend');

const FRONTEND_BUILD = IS_DEV
  ? path.resolve(__dirname, '../../../frontend/build')
  : path.join(process.resourcesPath, 'frontend', 'build');

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

// ── State ─────────────────────────────────────────────────────────────────────
let mainWindow   = null;
let backendProc  = null;
let activePort   = null;

// ── Config helpers ─────────────────────────────────────────────────────────────
function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

// ── JWT secret generation ─────────────────────────────────────────────────────
function generateSecret() {
  return require('crypto').randomBytes(48).toString('hex');
}

// ── Backend health check ──────────────────────────────────────────────────────
function waitForBackend(port, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start    = Date.now();
    const interval = 400;

    const check = () => {
      const req = http.get(`http://localhost:${port}/health`, (res) => {
        if (res.statusCode === 200) {
          resolve(port);
        } else {
          retry();
        }
        res.resume(); // drain
      });
      req.on('error', retry);
      req.setTimeout(interval, () => { req.destroy(); retry(); });
    };

    const retry = () => {
      if (Date.now() - start >= timeout) {
        reject(new Error(`Backend on port ${port} did not respond within ${timeout} ms`));
        return;
      }
      setTimeout(check, interval);
    };

    check();
  });
}

// ── Backend spawn ─────────────────────────────────────────────────────────────
async function startBackend(config) {
  const port = await getPort({ port: config.port || 5000 });
  activePort = port;

  const jwtSecret = config.jwtSecret || generateSecret();
  // Persist the secret so it stays consistent across restarts
  if (!config.jwtSecret) {
    writeConfig({ ...config, jwtSecret });
  }

  // Store the SQLite database next to the config file in userData
  const sqlitePath = require('path').join(app.getPath('userData'), 'garden.db');

  const env = {
    ...process.env,
    NODE_ENV:       'production',
    PORT:           String(port),
    FRONTEND_URL:   `http://localhost:${port}`,
    JWT_SECRET:     jwtSecret,
    SERVER_NAME:    config.serverName || 'My Garden',
    ELECTRON_MODE:  '1',
    SQLITE_PATH:    sqlitePath,   // persistent local storage without PostgreSQL
    // Intentionally no DATABASE_URL → SQLite takes over via SQLITE_PATH
  };

  // Node executable: in packaged app use the bundled Node; in dev use system Node.
  const nodeExe = IS_DEV ? process.execPath.replace('Electron', 'node').replace('electron', 'node') : process.execPath;
  // In production (asar), Electron IS the executable; we need the real node.
  // electron-builder includes node via the extraResources strategy.
  // Fallback: use the same process that runs Electron (which is node-based).
  const nodeBin = process.env.GARDEN_NODE || nodeExe;

  backendProc = spawn(
    'node',
    [path.join(BACKEND_ROOT, 'src', 'index.js')],
    {
      cwd: BACKEND_ROOT,
      env,
      stdio: IS_DEV ? 'inherit' : 'pipe',
    }
  );

  backendProc.on('error', (err) => {
    console.error('[desktop] Backend spawn error:', err.message);
  });

  backendProc.on('exit', (code) => {
    console.log(`[desktop] Backend exited with code ${code}`);
  });

  if (!IS_DEV && backendProc.stderr) {
    backendProc.stderr.on('data', (d) => console.error('[backend]', d.toString().trim()));
  }

  await waitForBackend(port);
  return port;
}

function killBackend() {
  if (backendProc) {
    backendProc.kill('SIGTERM');
    backendProc = null;
  }
}

// ── Window creation ───────────────────────────────────────────────────────────
function createWindow(url) {
  mainWindow = new BrowserWindow({
    width:  1280,
    height: 800,
    minWidth:  800,
    minHeight: 600,
    title: 'AllOne Garden',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      // Allow loading localhost in production builds
      webSecurity:      !IS_DEV,
    },
  });

  // Open external links in system browser, not in the app window
  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    shell.openExternal(openUrl);
    return { action: 'deny' };
  });

  mainWindow.loadURL(url);

  if (IS_DEV) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Setup wizard window ───────────────────────────────────────────────────────
function createSetupWindow() {
  mainWindow = new BrowserWindow({
    width:  560,
    height: 620,
    resizable:   false,
    maximizable: false,
    title: 'AllOne Garden — Setup',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  if (IS_DEV) {
    // Dev: React dev server, hash route for setup
    mainWindow.loadURL('http://localhost:3000/#/setup');
  } else {
    // Production: load from backend static serving (not yet started) or
    // load the built index.html directly via file:// with hash
    mainWindow.loadFile(path.join(FRONTEND_BUILD, 'index.html'), {
      hash: '/setup',
    });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  app.setAsDefaultProtocolClient('allonegarden');

  // Auto-update: check on startup (packaged builds only)
  if (autoUpdater && app.isPackaged) {
    autoUpdater.on('update-available',  (info) => {
      mainWindow?.webContents.send('update:available', { version: info.version });
    });
    autoUpdater.on('update-downloaded', (info) => {
      mainWindow?.webContents.send('update:downloaded', { version: info.version });
    });
    autoUpdater.on('error', (err) => {
      console.error('[updater]', err.message);
    });
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }

  // Discord Rich Presence
  initDiscord().catch(() => {});

  // Steam SDK (fail-silent)
  initSteam();

  const config = readConfig();

  if (!config) {
    // First run — show setup wizard
    createSetupWindow();
    return;
  }

  await launchGame(config);
});

async function launchGame(config) {
  try {
    if (config.mode === 'local') {
      const port = await startBackend(config);
      createWindow(`http://localhost:${port}`);
    } else {
      // Remote mode — just open the server URL
      createWindow(config.serverUrl);
    }
    // Update Discord presence once game window is open
    setDiscordActivity({ details: 'In the garden', state: config.serverName || 'AllOne Garden' });
  } catch (err) {
    console.error('[desktop] Failed to launch game:', err.message);
    // Show an error dialog then quit gracefully
    const { dialog } = require('electron');
    await dialog.showMessageBox({
      type:    'error',
      title:   'AllOne Garden — Startup Error',
      message: 'Could not start the game server.',
      detail:  err.message + '\n\nPlease restart the app or check your configuration.',
      buttons: ['Reset Setup', 'Quit'],
    }).then(({ response }) => {
      if (response === 0) {
        // Delete config so setup wizard runs again
        try { fs.unlinkSync(CONFIG_PATH); } catch {}
        app.relaunch();
      }
      app.quit();
    });
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', async () => {
  if (mainWindow === null) {
    const config = readConfig();
    if (config) {
      await launchGame(config);
    } else {
      createSetupWindow();
    }
  }
});

app.on('before-quit', () => {
  killBackend();
  destroyDiscord();
  shutdownSteam();
});

// ── IPC handlers ──────────────────────────────────────────────────────────────

// Renderer asks: do we need setup?
ipcMain.handle('get-setup-state', () => {
  return { needsSetup: !readConfig() };
});

// Renderer sends completed config from wizard
ipcMain.handle('complete-setup', async (_event, config) => {
  writeConfig(config);

  // Close setup window, launch game
  if (mainWindow) {
    mainWindow.close();
    mainWindow = null;
  }

  await launchGame(config);
  return { ok: true };
});

// Renderer requests current config (for settings screen)
ipcMain.handle('get-config', () => readConfig());

// Renderer requests reset (go back to setup)
ipcMain.handle('reset-config', () => {
  killBackend();
  try { fs.unlinkSync(CONFIG_PATH); } catch {}
  if (mainWindow) {
    mainWindow.close();
    mainWindow = null;
  }
  createSetupWindow();
  return { ok: true };
});

// Open a URL in the system browser
ipcMain.handle('open-external', (_event, url) => {
  shell.openExternal(url);
});

// ── Auto-update IPC ───────────────────────────────────────────────────────────

// Renderer can trigger a manual update check
ipcMain.handle('check-for-updates', async () => {
  if (!autoUpdater || !app.isPackaged) return { available: false, reason: 'dev-mode' };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { available: !!result?.updateInfo, version: result?.updateInfo?.version };
  } catch (err) {
    return { available: false, error: err.message };
  }
});

// Renderer triggers install-and-relaunch after update is downloaded
ipcMain.handle('install-update', () => {
  autoUpdater?.quitAndInstall();
});

// ── Discord Rich Presence IPC ─────────────────────────────────────────────────

// Renderer sends game state for rich presence updates
// payload: { details, state, season, day }
ipcMain.handle('update-discord-presence', (_event, payload = {}) => {
  setDiscordActivity(payload);
});

// ── Steam IPC ─────────────────────────────────────────────────────────────────

// Check whether Steam integration is active
ipcMain.handle('steam-available', () => steam !== null);

// Unlock an achievement: { apiName: 'FIRST_HARVEST' }
ipcMain.handle('steam-unlock-achievement', (_event, { apiName } = {}) => {
  if (!apiName) return { ok: false, reason: 'no apiName' };
  const ok = unlockAchievement(apiName);
  return { ok };
});

// Return Steam display name (or null)
ipcMain.handle('steam-get-player-name', () => {
  try { return steam ? steam.localplayer.getName() : null; } catch { return null; }
});
