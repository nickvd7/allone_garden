/**
 * Plugin API surface.
 *
 * Every plugin receives an instance of PluginAPI in its init(api) function.
 * Plugins may ONLY interact with the game through this object — they never
 * get direct access to the Express app, database pool, or Node internals.
 */

class PluginAPI {
  /**
   * @param {object} opts
   * @param {string}   opts.pluginName   - Plugin's registered name
   * @param {object}   opts.db           - The db module (query/getClient)
   * @param {object}   opts.io           - Socket.IO server instance
   * @param {object}   opts.eventBus     - Internal EventEmitter for game events
   * @param {Function} opts.log          - Scoped logger
   */
  constructor({ pluginName, db, io, eventBus, log }) {
    this._pluginName = pluginName;
    this._db = db;
    this._io = io;
    this._eventBus = eventBus;
    this._log = log;
    this._listeners = [];   // track so we can clean up on unload
    this._routes = [];
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
  async dbQuery(tableSuffix, sql, params) {
    const table = `plugin_${this._pluginName}_${tableSuffix}`;
    // Replace the placeholder {{table}} in the SQL
    const safeSql = sql.replace(/\{\{table\}\}/g, table);
    return this._db.query(safeSql, params);
  }

  /**
   * Create a plugin-namespaced table (called once in plugin init).
   * Column definitions follow standard PostgreSQL syntax.
   *
   * @param {string} tableSuffix
   * @param {string} columnDefs  e.g. 'id SERIAL PRIMARY KEY, value TEXT'
   */
  async dbCreateTable(tableSuffix, columnDefs) {
    const table = `plugin_${this._pluginName}_${tableSuffix}`;
    await this._db.query(
      `CREATE TABLE IF NOT EXISTS ${table} (${columnDefs})`
    );
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
    this._eventBus.on(eventName, handler);
    this._listeners.push({ event: eventName, handler });
  }

  /**
   * Emit a custom plugin event (other plugins can listen to it).
   * Event name is automatically namespaced: plugin:{pluginName}:{event}
   */
  emit(eventName, data) {
    this._eventBus.emit(`plugin:${this._pluginName}:${eventName}`, data);
  }

  // ── Real-time messaging ─────────────────────────────────────────────────────

  /**
   * Broadcast a message to all connected clients.
   * @param {string} channel   Socket.IO event name (e.g. 'plugin:weather:forecast')
   * @param {*}      data
   */
  broadcast(channel, data) {
    this._io.emit(`plugin:${channel}`, data);
  }

  /**
   * Send a message to a specific user.
   * @param {string} userId
   * @param {string} channel
   * @param {*}      data
   */
  sendTo(userId, channel, data) {
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
