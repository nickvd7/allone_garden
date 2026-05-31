/**
 * Plugin loader.
 *
 * Discovers, validates, and loads plugins from the /plugins directory.
 * Each plugin runs inside a vm sandbox (see sandbox.js) and only receives
 * the PluginAPI surface — no direct access to db, Express, or Node internals.
 *
 * Plugin file contract:
 *   module.exports = {
 *     name:    'my-plugin',   // must match directory name
 *     version: '1.0.0',
 *     init(api) { ... }      // called once on load
 *   };
 */

const path = require('path');
const fs   = require('fs');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const PluginAPI = require('./api');
const { KNOWN_CAPABILITIES } = PluginAPI;
const { executeInSandbox, safeHandler } = require('./sandbox');
const STRICT_PLUGIN_CAPABILITIES =
  process.env.PLUGIN_STRICT_CAPABILITIES === 'true' || process.env.NODE_ENV === 'production';

// Event bus shared by all plugins and the core game engine
const eventBus = new EventEmitter();
eventBus.setMaxListeners(50);

// Registry of loaded plugins: { [name]: { meta, api } }
const loaded = {};

/**
 * Compute SHA-256 of a file for integrity logging.
 */
function fileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Load a single plugin by directory path.
 *
 * @param {string} pluginDir  Absolute path to the plugin folder
 * @param {object} deps       { db, io }
 * @returns {object|null} Plugin metadata, or null on failure
 */
function loadPlugin(pluginDir, deps) {
  const entryFile = path.join(pluginDir, 'index.js');

  if (!fs.existsSync(entryFile)) {
    console.warn(`[plugins] No index.js found in ${pluginDir} — skipping`);
    return null;
  }

  let plugin;
  try {
    const source = fs.readFileSync(entryFile, 'utf8');
    plugin = executeInSandbox(source, path.basename(pluginDir));
  } catch (err) {
    console.error(`[plugins] Failed to load ${pluginDir}:`, err.message);
    return null;
  }

  // Validate required fields
  if (!plugin.name || !plugin.version || typeof plugin.init !== 'function') {
    console.error(`[plugins] Plugin in ${pluginDir} is missing name/version/init`);
    return null;
  }

  // Validate plugin name: only safe characters — prevents path traversal or
  // injection if the name is ever used in a filesystem or DB context.
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(plugin.name)) {
    console.error(`[plugins] Plugin in ${pluginDir} has invalid name "${plugin.name}" — skipping`);
    return null;
  }

  if (loaded[plugin.name]) {
    console.warn(`[plugins] Plugin "${plugin.name}" already loaded — skipping duplicate`);
    return null;
  }

  // ── Capabilities ─────────────────────────────────────────────────────────
  // Plugins should declare an explicit `capabilities` array.
  // In production we reject missing capabilities to enforce least privilege.
  // In non-production we keep backward compatibility for legacy plugins.
  let capabilities;
  if (!Array.isArray(plugin.capabilities)) {
    if (STRICT_PLUGIN_CAPABILITIES) {
      console.error(
        `[plugins] "${plugin.name}" is missing required capabilities array. ` +
        'Declare an explicit subset, e.g. capabilities: [\'events\'].'
      );
      return null;
    }
    console.warn(
      `[plugins] "${plugin.name}" does not declare a capabilities array — ` +
      `granting all capabilities for backwards compatibility. ` +
      `Add \`capabilities: ['db','broadcast','events']\` (or a subset) to your plugin manifest.`
    );
    capabilities = [...KNOWN_CAPABILITIES];
  } else {
    // Validate: reject unknown tokens to catch typos early
    const unknown = plugin.capabilities.filter((c) => !KNOWN_CAPABILITIES.has(c));
    if (unknown.length > 0) {
      console.error(
        `[plugins] Plugin "${plugin.name}" declared unknown capabilities: ${unknown.join(', ')}. ` +
        `Known: ${[...KNOWN_CAPABILITIES].join(', ')}`
      );
      return null;
    }
    capabilities = plugin.capabilities;
  }

  const hash = fileHash(entryFile);
  const log  = (msg) => console.log(msg);

  const api = new PluginAPI({
    pluginName:   plugin.name,
    db:           deps.db,
    io:           deps.io,
    eventBus,
    log,
    capabilities,
  });

  // Wrap api.on so every registered handler runs through safeHandler,
  // giving it a timeout and preventing uncaught exceptions from crashing the server.
  const originalOn = api.on.bind(api);
  api.on = (event, handler) =>
    originalOn(event, safeHandler(handler, `${plugin.name}:${event}`));

  try {
    plugin.init(api);
  } catch (err) {
    console.error(`[plugins] Error in ${plugin.name}.init():`, err.message);
    api._cleanup();
    return null;
  }

  loaded[plugin.name] = {
    meta: { name: plugin.name, version: plugin.version, hash, capabilities },
    api,
  };
  console.log(
    `[plugins] ✅ Loaded "${plugin.name}" v${plugin.version} ` +
    `(${hash.slice(0, 8)}) caps=[${capabilities.join(',')}]`
  );
  return loaded[plugin.name].meta;
}

/**
 * Unload a plugin by name (removes event listeners, cleans up API).
 */
function unloadPlugin(name) {
  const entry = loaded[name];
  if (!entry) return false;
  entry.api._cleanup();
  delete loaded[name];
  console.log(`[plugins] Unloaded "${name}"`);
  return true;
}

/**
 * Discover and load all plugins from a directory.
 *
 * @param {string} pluginsRoot  Absolute path to the plugins/ folder
 * @param {object} deps         { db, io }
 */
function loadAll(pluginsRoot, deps) {
  if (!fs.existsSync(pluginsRoot)) {
    console.log('[plugins] No plugins directory found — skipping');
    return;
  }

  const dirs = fs.readdirSync(pluginsRoot).filter((entry) => {
    const full = path.join(pluginsRoot, entry);
    return fs.statSync(full).isDirectory();
  });

  console.log(`[plugins] Scanning ${dirs.length} plugin(s) in ${pluginsRoot}`);
  dirs.forEach((dir) => loadPlugin(path.join(pluginsRoot, dir), deps));
}

/** Return an array of loaded plugin metadata. */
function listLoaded() {
  return Object.values(loaded).map((e) => e.meta);
}

/** Expose the shared event bus so the game engine can emit core events. */
function getEventBus() {
  return eventBus;
}

module.exports = { loadPlugin, unloadPlugin, loadAll, listLoaded, getEventBus };
