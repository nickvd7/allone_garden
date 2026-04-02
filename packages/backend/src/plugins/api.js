/**
 * Plugin API surface.
 *
 * Every plugin receives an instance of PluginAPI in its init(api) function.
 * Plugins may ONLY interact with the game through this object — they never
 * get direct access to the Express app, database pool, or Node internals.
 *
 * Capability groups (declared in plugin manifest under `capabilities`):
 *   'db'        — dbQuery, dbCreateTable
 *   'broadcast' — broadcast, sendTo
 *   'events'    — on, emit
 *
 * log() is always available regardless of declared capabilities.
 * If a plugin calls a method it did not declare, a descriptive Error is thrown.
 */

/** All recognised capability tokens. */
const KNOWN_CAPABILITIES = new Set(['db', 'broadcast', 'events']);

class PluginAPI {
  /**
   * @param {object}   opts
   * @param {string}   opts.pluginName    - Plugin's registered name
   * @param {object}   opts.db            - The db module (query/getClient)
   * @param {object}   opts.io            - Socket.IO server instance
   * @param {object}   opts.eventBus      - Internal EventEmitter for game events
   * @param {Function} opts.log           - Scoped logger
   * @param {string[]} opts.capabilities  - Declared capability list
   */
  constructor({ pluginName, db, io, eventBus, log, capabilities = [] }) {
    this._pluginName  = pluginName;
    this._db          = db;
    this._io          = io;
    this._eventBus    = eventBus;
    this._log         = log;
    this._capabilities = new Set(capabilities);
    this._listeners   = [];   // track so we can clean up on unload
    this._routes      = [];
  }

  /**
   * Throw if the plugin did not declare the required capability.
   * @param {'db'|'broadcast'|'events'} cap
   */
  _requireCapability(cap) {
    if (!this._capabilities.has(cap)) {
      throw new Error(
        `[PluginAPI] Plugin "${this._pluginName}" called a "${cap}" method ` +
        `without declaring the "${cap}" capability. ` +
        `Add "${cap}" to the capabilities array in your plugin manifest.`
      );
    }
  }

  // ── Logging ─────────────────────────────────────────────────────────────────

  log(message) {
    this._log(`[${this._pluginName}] ${message}`);
  }

  // ── Database (sandboxed) ────────────────────────────────────────────────────
  // Plugins get a thin query wrapper that prefixes tables with the plugin name
  // so they cannot read or write core game tables.

  /**
   * Execute a SQL query against the plugin's own namespace table.
   * Table name is automatically prefixed: plugin_{pluginName}_{table}
   *
   * @param {string} tableSuffix  e.g. 'data' → queries 'plugin_myplugin_data'
   * @param {string} sql          SQL with $1 placeholders (table name injected)
   * @param {Array}  params
   */
  // Validate that a tableSuffix is safe to interpolate into SQL identifiers.
  // Only lowercase alphanumeric, hyphens, and underscores; max 32 chars.
  static _validateSuffix(suffix) {
    if (typeof suffix !== 'string' || !/^[a-z0-9_-]{1,32}$/.test(suffix)) {
      throw new Error(`[PluginAPI] Invalid tableSuffix "${suffix}" — use only a-z, 0-9, _, - (max 32 chars)`);
    }
  }

  // Allowed SQL statement prefixes for plugin queries.
  // Plugins may only read/write their own namespaced tables — DDL is handled
  // by dbCreateTable(), not here.
  static _ALLOWED_SQL = /^\s*(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+/i;

  async dbQuery(tableSuffix, sql, params) {
    this._requireCapability('db');
    PluginAPI._validateSuffix(tableSuffix);

    if (typeof sql !== 'string' || !sql.trim()) {
      throw new Error('[PluginAPI] sql must be a non-empty string');
    }

    // Only permit DML against the plugin's own table.
    // Reject DDL, TRUNCATE, COPY, transaction control, etc.
    if (!PluginAPI._ALLOWED_SQL.test(sql)) {
      throw new Error(
        '[PluginAPI] dbQuery only allows SELECT, INSERT INTO, UPDATE, DELETE FROM statements'
      );
    }

    // Block comment-based injection attempts
    if (/--|\/\*/.test(sql)) {
      throw new Error('[PluginAPI] sql must not contain "--" or "/*"');
    }

    const table   = `plugin_${this._pluginName}_${tableSuffix}`;

    // Guard against direct string interpolation of the table name outside {{table}}
    if (sql.includes('{{table}}')) {
      const safeSql = sql.replace(/\{\{table\}\}/g, table);
      return this._db.query(safeSql, params);
    }

    // If no {{table}} placeholder the plugin is querying another table — block it
    throw new Error(
      '[PluginAPI] sql must reference the plugin table via {{table}} placeholder'
    );
  }

  /**
   * Create a plugin-namespaced table (called once in plugin init).
   * Column definitions follow standard PostgreSQL syntax.
   *
   * @param {string} tableSuffix
   * @param {string} columnDefs  e.g. 'id SERIAL PRIMARY KEY, value TEXT'
   */
  async dbCreateTable(tableSuffix, columnDefs) {
    this._requireCapability('db');
    PluginAPI._validateSuffix(tableSuffix);

    // Guard against SQL injection in columnDefs: reject statement terminators and comments.
    if (typeof columnDefs !== 'string' || columnDefs.trim().length === 0) {
      throw new Error('[PluginAPI] columnDefs must be a non-empty string');
    }
    if (/;|--|\/\*/.test(columnDefs)) {
      throw new Error('[PluginAPI] columnDefs must not contain ";", "--", or "/*" (possible SQL injection)');
    }

    const table = `plugin_${this._pluginName}_${tableSuffix}`;
    await this._db.query(`CREATE TABLE IF NOT EXISTS ${table} (${columnDefs})`);
    this.log(`Table ${table} ready`);
  }

  // ── Game events ─────────────────────────────────────────────────────────────

  /**
   * Subscribe to a game event.
   * Built-in events: 'onDayChange', 'onPlant', 'onHarvest', 'onPlayerJoin', 'onChat'
   *
   * @param {string}   eventName
   * @param {Function} handler
   */
  on(eventName, handler) {
    this._requireCapability('events');
    this._eventBus.on(eventName, handler);
    this._listeners.push({ event: eventName, handler });
  }

  /**
   * Emit a custom plugin event (other plugins can listen to it).
   * Event name is automatically namespaced: plugin:{pluginName}:{event}
   */
  emit(eventName, data) {
    this._requireCapability('events');
    this._eventBus.emit(`plugin:${this._pluginName}:${eventName}`, data);
  }

  // ── Real-time messaging ─────────────────────────────────────────────────────

  /**
   * Broadcast a message to all connected clients.
   * @param {string} channel   Socket.IO event name (e.g. 'plugin:weather:forecast')
   * @param {*}      data
   */
  broadcast(channel, data) {
    this._requireCapability('broadcast');
    this._io.emit(`plugin:${channel}`, data);
  }

  /**
   * Send a message to a specific user.
   * @param {string} userId
   * @param {string} channel
   * @param {*}      data
   */
  sendTo(userId, channel, data) {
    this._requireCapability('broadcast');
    this._io.to(userId).emit(`plugin:${channel}`, data);
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  /** Called by the loader when the plugin is unloaded. */
  _cleanup() {
    for (const { event, handler } of this._listeners) {
      this._eventBus.off(event, handler);
    }
    this._listeners = [];
  }
}

module.exports = PluginAPI;
module.exports.KNOWN_CAPABILITIES = KNOWN_CAPABILITIES;
