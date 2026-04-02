const path = require('path');
const os = require('os');
const fs = require('fs');

function makeDb() {
  return {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    getClient: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true),
  };
}

function makeIo() {
  return {
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
  };
}

function writePlugin(rootDir, code) {
  const pluginDir = path.join(rootDir, 'strict-plugin');
  fs.mkdirSync(pluginDir);
  fs.writeFileSync(path.join(pluginDir, 'index.js'), code, 'utf8');
  return pluginDir;
}

describe('plugin loader strict capabilities mode', () => {
  let tmpDir;
  let originalNodeEnv;
  let originalStrict;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-strict-test-'));
    originalNodeEnv = process.env.NODE_ENV;
    originalStrict = process.env.PLUGIN_STRICT_CAPABILITIES;
    jest.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.env.NODE_ENV = originalNodeEnv;
    process.env.PLUGIN_STRICT_CAPABILITIES = originalStrict;
    jest.resetModules();
  });

  it('rejects plugins without capabilities in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.PLUGIN_STRICT_CAPABILITIES;

    const pluginDir = writePlugin(tmpDir, `
      module.exports = {
        name: 'strict-plugin',
        version: '1.0.0',
        init(api) {},
      };
    `);

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { loadPlugin, listLoaded } = require('../src/plugins/loader');

    const meta = loadPlugin(pluginDir, { db: makeDb(), io: makeIo() });
    expect(meta).toBeNull();
    expect(listLoaded()).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('missing required capabilities array'));
    consoleSpy.mockRestore();
  });
});
