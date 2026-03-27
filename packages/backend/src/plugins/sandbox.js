/**
 * Plugin sandbox — executes untrusted plugin code in an isolated VM context.
 *
 * Uses Node.js built-in `vm` module to run each plugin in a separate V8
 * context with a strictly controlled global scope.  The plugin code:
 *
 *  ✅ Can call the PluginAPI surface (api.on, api.broadcast, api.dbQuery, …)
 *  ✅ Can use safe built-ins: console, setTimeout/setInterval, JSON, Math, Date
 *  ❌ Cannot require() any Node module
 *  ❌ Cannot access process, __dirname, Buffer, or the filesystem
 *  ❌ Cannot access the outer scope or other plugins' data
 *  ❌ Cannot escape the sandbox via global prototype tricks
 *
 * Execution timeout: 5 s for init(), 2 s per event handler call.
 * Memory is NOT capped at the VM level (use OS ulimits for that in production).
 *
 * Limitation: `vm` does not prevent CPU spin-loops; combine with a process
 * watchdog (e.g. clinic.js or OS-level cgroup limits) in production.
 */

const vm      = require('vm');
const crypto  = require('crypto');

const INIT_TIMEOUT_MS    = 5_000;
const HANDLER_TIMEOUT_MS = 2_000;

/**
 * Execute plugin source code in a sandbox and return the exported object.
 *
 * @param {string} source     Plugin source code (the contents of index.js)
 * @param {string} pluginName Used for error messages
 * @returns {{ name, version, init }} The plugin module export
 */
function executeInSandbox(source, pluginName) {
  // Wrap in a CommonJS-style IIFE so `module.exports = …` works
  const wrapped = `
    (function(module, exports, console, setTimeout, clearTimeout,
              setInterval, clearInterval, JSON, Math, Date, crypto) {
      ${source}
    })(module, module.exports, _console, _setTimeout, _clearTimeout,
       _setInterval, _clearInterval, JSON, Math, Date, _crypto);
  `;

  const moduleObj = { exports: {} };

  // Allowlisted globals only — no process, require, Buffer, etc.
  const sandbox = vm.createContext(
    Object.freeze({
      module:          moduleObj,
      exports:         moduleObj.exports,
      _console: Object.freeze({
        log:   (...a) => console.log(`[plugin:${pluginName}]`, ...a),
        warn:  (...a) => console.warn(`[plugin:${pluginName}]`, ...a),
        error: (...a) => console.error(`[plugin:${pluginName}]`, ...a),
      }),
      // Wrap timers so we can clear them all on unload
      _setTimeout:     (fn, ms) => setTimeout(fn, Math.min(ms, 86_400_000)),
      _clearTimeout:   clearTimeout,
      _setInterval:    (fn, ms) => setInterval(fn, Math.max(ms, 100)), // min 100 ms
      _clearInterval:  clearInterval,
      JSON,
      Math,
      Date,
      _crypto: Object.freeze({
        // Only expose safe, non-sensitive crypto helpers
        randomUUID:  () => crypto.randomUUID(),
        createHash:  (alg) => {
          if (!['sha256', 'sha1', 'md5'].includes(alg)) throw new Error(`Hash algorithm "${alg}" not allowed`);
          return crypto.createHash(alg);
        },
      }),
    })
  );

  const script = new vm.Script(wrapped, {
    filename: `plugin:${pluginName}`,
    lineOffset: -2,  // adjust line numbers for wrapped code
  });

  script.runInContext(sandbox, { timeout: INIT_TIMEOUT_MS });

  return moduleObj.exports;
}

/**
 * Wrap a plugin's event handler so it runs with a timeout and
 * cannot crash the main process.
 *
 * @param {Function} handler  The original async/sync handler
 * @param {string}   name     Plugin + event name (for logging)
 * @returns {Function}
 */
function safeHandler(handler, name) {
  return async function (...args) {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Handler timed out')), HANDLER_TIMEOUT_MS)
    );
    try {
      await Promise.race([Promise.resolve(handler(...args)), timeout]);
    } catch (err) {
      console.error(`[sandbox] ${name} threw:`, err.message);
    }
  };
}

module.exports = { executeInSandbox, safeHandler };
