/**
 * Plugin system tests — capabilities model and API surface.
 *
 * These tests use only the JavaScript modules directly (no HTTP layer)
 * so they run fast without a running Express server.
 */

const path = require('path');
const os   = require('os');
const fs   = require('fs');

const PluginAPI = require('../src/plugins/api');
const { KNOWN_CAPABILITIES } = PluginAPI;
const { loadPlugin, unloadPlugin, listLoaded } = require('../src/plugins/loader');

// ── Minimal stubs ──────────────────────────────────────────────────────────────

function makeDb() {
  return {
    query:       jest.fn().mockResolvedValue({ rows: [] }),
    getClient:   jest.fn(),
    isConnected: jest.fn().mockReturnValue(true),
  };
}

function makeIo() {
  const emitted = [];
  return {
    emit:     jest.fn((...a) => emitted.push(a)),
    to:       jest.fn().mockReturnThis(),
    _emitted: emitted,
  };
}

function makeEventBus() {
  const { EventEmitter } = require('events');
  return new EventEmitter();
}

function makeApi(caps = [...KNOWN_CAPABILITIES]) {
  return new PluginAPI({
    pluginName:   'test-plugin',
    db:           makeDb(),
    io:           makeIo(),
    eventBus:     makeEventBus(),
    log:          jest.fn(),
    capabilities: caps,
  });
}

// ── KNOWN_CAPABILITIES ─────────────────────────────────────────────────────────

describe('KNOWN_CAPABILITIES', () => {
  it('contains db, broadcast, events', () => {
    expect(KNOWN_CAPABILITIES.has('db')).toBe(true);
    expect(KNOWN_CAPABILITIES.has('broadcast')).toBe(true);
    expect(KNOWN_CAPABILITIES.has('events')).toBe(true);
  });
});

// ── PluginAPI.log — always available ──────────────────────────────────────────

describe('PluginAPI.log', () => {
  it('is available regardless of capabilities', () => {
    const api = makeApi([]);           // no capabilities
    expect(() => api.log('hello')).not.toThrow();
  });
});

// ── PluginAPI db capability ───────────────────────────────────────────────────

describe('PluginAPI db capability', () => {
  it('allows dbQuery when db is declared', async () => {
    const api = makeApi(['db']);
    await expect(
      api.dbQuery('scores', 'SELECT * FROM {{table}}', [])
    ).resolves.not.toThrow();
  });

  it('allows dbCreateTable when db is declared', async () => {
    const api = makeApi(['db']);
    await expect(
      api.dbCreateTable('scores', 'id SERIAL PRIMARY KEY, value TEXT')
    ).resolves.not.toThrow();
  });

  it('throws when dbQuery is called without db capability', async () => {
    const api = makeApi([]);
    await expect(
      api.dbQuery('scores', 'SELECT * FROM {{table}}', [])
    ).rejects.toThrow(/db.*capability/i);
  });

  it('throws when dbCreateTable is called without db capability', async () => {
    const api = makeApi([]);
    await expect(
      api.dbCreateTable('scores', 'id SERIAL PRIMARY KEY, value TEXT')
    ).rejects.toThrow(/db.*capability/i);
  });

  it('still validates tableSuffix even with db capability', async () => {
    const api = makeApi(['db']);
    await expect(
      api.dbQuery('BAD SUFFIX!', 'SELECT * FROM {{table}}', [])
    ).rejects.toThrow(/invalid tablesuffix/i);
  });

  it('still blocks SQL without {{table}} placeholder', async () => {
    const api = makeApi(['db']);
    await expect(
      api.dbQuery('scores', 'SELECT * FROM some_other_table', [])
    ).rejects.toThrow(/\{\{table\}\}/);
  });

  it('rejects dbCreateTable columnDefs with SQL keywords', async () => {
    const api = makeApi(['db']);
    await expect(
      api.dbCreateTable('scores', 'id INT, evil INT REFERENCES users(id)')
    ).rejects.toThrow(/disallowed SQL keywords/i);
  });

  it('rejects dbCreateTable columnDefs with disallowed characters', async () => {
    const api = makeApi(['db']);
    await expect(
      api.dbCreateTable('scores', 'id INT DEFAULT 1::text')
    ).rejects.toThrow(/::/);
  });
});

// ── PluginAPI broadcast capability ────────────────────────────────────────────

describe('PluginAPI broadcast capability', () => {
  it('allows broadcast when broadcast is declared', () => {
    const api = makeApi(['broadcast']);
    expect(() => api.broadcast('channel', { x: 1 })).not.toThrow();
    expect(api._io.emit).toHaveBeenCalledWith('plugin:channel', { x: 1 });
  });

  it('allows sendTo when broadcast is declared', () => {
    const api = makeApi(['broadcast']);
    expect(() => api.sendTo('user123', 'channel', { x: 1 })).not.toThrow();
  });

  it('throws when broadcast is called without broadcast capability', () => {
    const api = makeApi([]);
    expect(() => api.broadcast('channel', {})).toThrow(/broadcast.*capability/i);
  });

  it('throws when sendTo is called without broadcast capability', () => {
    const api = makeApi([]);
    expect(() => api.sendTo('user123', 'channel', {})).toThrow(/broadcast.*capability/i);
  });
});

// ── PluginAPI events capability ───────────────────────────────────────────────

describe('PluginAPI events capability', () => {
  it('allows on() when events is declared', () => {
    const api = makeApi(['events']);
    expect(() => api.on('onDayChange', () => {})).not.toThrow();
  });

  it('allows emit() when events is declared', () => {
    const api = makeApi(['events']);
    expect(() => api.emit('myEvent', {})).not.toThrow();
  });

  it('throws when on() is called without events capability', () => {
    const api = makeApi([]);
    expect(() => api.on('onDayChange', () => {})).toThrow(/events.*capability/i);
  });

  it('throws when emit() is called without events capability', () => {
    const api = makeApi([]);
    expect(() => api.emit('myEvent', {})).toThrow(/events.*capability/i);
  });

  it('namespaces emitted events', () => {
    const api = makeApi(['events']);
    const received = [];
    api._eventBus.on('plugin:test-plugin:myEvent', (d) => received.push(d));
    api.emit('myEvent', { v: 42 });
    expect(received).toEqual([{ v: 42 }]);
  });
});

// ── PluginAPI._cleanup ────────────────────────────────────────────────────────

describe('PluginAPI._cleanup', () => {
  it('removes all registered event listeners', () => {
    const api = makeApi(['events']);
    let called = 0;
    api.on('onDayChange', () => { called++; });
    api._eventBus.emit('onDayChange');
    expect(called).toBe(1);

    api._cleanup();
    api._eventBus.emit('onDayChange');
    expect(called).toBe(1);   // not called again after cleanup
  });
});

// ── Loader: loadPlugin ────────────────────────────────────────────────────────

describe('loadPlugin — capabilities validation', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Clean up any loaded plugins from the registry (access via listLoaded/unloadPlugin)
    for (const { name } of listLoaded()) {
      unloadPlugin(name);
    }
  });

  const deps = () => ({ db: makeDb(), io: makeIo() });

  function writePlugin(dir, code) {
    const pluginDir = path.join(dir, 'my-plugin');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(path.join(pluginDir, 'index.js'), code, 'utf8');
    return pluginDir;
  }

  it('loads a plugin that declares valid capabilities', () => {
    const pluginDir = writePlugin(tmpDir, `
      module.exports = {
        name: 'my-plugin',
        version: '1.0.0',
        capabilities: ['db'],
        init(api) {},
      };
    `);
    const meta = loadPlugin(pluginDir, deps());
    expect(meta).not.toBeNull();
    expect(meta.capabilities).toEqual(['db']);
  });

  it('grants all capabilities with a warning when capabilities is omitted (backward compat)', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const pluginDir = writePlugin(tmpDir, `
      module.exports = {
        name: 'my-plugin',
        version: '1.0.0',
        init(api) {},
      };
    `);
    const meta = loadPlugin(pluginDir, deps());
    expect(meta).not.toBeNull();
    expect(meta.capabilities).toEqual(expect.arrayContaining(['db', 'broadcast', 'events']));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('backwards compatibility'));
    consoleSpy.mockRestore();
  });

  it('returns null and logs error when an unknown capability is declared', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const pluginDir = writePlugin(tmpDir, `
      module.exports = {
        name: 'my-plugin',
        version: '1.0.0',
        capabilities: ['db', 'fileSystem'],  // 'fileSystem' is unknown
        init(api) {},
      };
    `);
    const meta = loadPlugin(pluginDir, deps());
    expect(meta).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('unknown capabilities'));
    consoleSpy.mockRestore();
  });

  it('returns null when init() calls an undeclared capability', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const pluginDir = writePlugin(tmpDir, `
      module.exports = {
        name: 'my-plugin',
        version: '1.0.0',
        capabilities: [],                    // no events capability
        init(api) {
          api.on('onDayChange', () => {});    // should throw
        },
      };
    `);
    const meta = loadPlugin(pluginDir, deps());
    expect(meta).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('my-plugin'), expect.stringContaining('events'));
    consoleSpy.mockRestore();
  });

  it('includes capabilities in listLoaded() metadata', () => {
    const pluginDir = writePlugin(tmpDir, `
      module.exports = {
        name: 'my-plugin',
        version: '1.0.0',
        capabilities: ['broadcast'],
        init(api) {},
      };
    `);
    loadPlugin(pluginDir, deps());
    const [entry] = listLoaded();
    expect(entry.capabilities).toEqual(['broadcast']);
  });
});
