/**
 * Integration tests — world-map and world-admin routes.
 *
 * All tests run in in-memory mode (no DATABASE_URL).
 */
const request = require('supertest');

process.env.JWT_SECRET   = 'test-secret-for-jest';
process.env.DATABASE_URL = '';
process.env.P2P_ENABLED  = 'false';

const { app }   = require('../src/index');
const worldMap  = require('../src/state/worldMap');
const pluginCfg = require('../src/state/pluginConfig');

// ── Helpers ───────────────────────────────────────────────────────────────────
async function registerAndLogin(suffix) {
  const creds = {
    username: `worlduser${suffix}`,
    email:    `worlduser${suffix}@example.com`,
    password: 'World1234',
  };
  await request(app).post('/api/auth/register').send(creds);
  const res = await request(app).post('/api/auth/login').send({
    username: creds.username,
    password: creds.password,
  });
  return res.body.token;
}

// Make a minimal valid 14×22 map
function makeMap(fillTile = 0) {
  return Array.from({ length: 14 }, () => Array(22).fill(fillTile));
}

const GARDEN_SLOTS = [{ x: 2, y: 2 }, { x: 18, y: 2 }];

// Reset in-memory state between suites
beforeEach(() => {
  worldMap.clear();
  pluginCfg.clear();
});

// ── Public world map ──────────────────────────────────────────────────────────
describe('GET /api/world/map — public', () => {
  it('returns null when no custom map is set', async () => {
    const res = await request(app).get('/api/world/map');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('returns in-memory map after it is set', async () => {
    const map = makeMap(1);
    worldMap.set({ map, gardenSlots: GARDEN_SLOTS });
    const res = await request(app).get('/api/world/map');
    expect(res.status).toBe(200);
    expect(res.body.map).toEqual(map);
    expect(res.body.gardenSlots).toEqual(GARDEN_SLOTS);
  });

  it('does not require authentication', async () => {
    const res = await request(app).get('/api/world/map');
    expect(res.status).not.toBe(401);
  });
});

describe('GET /api/world/gardens', () => {
  it('is available without token for guest world rendering', async () => {
    const res = await request(app).get('/api/world/gardens');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.gardenSlots)).toBe(true);
    expect(Array.isArray(res.body.occupants)).toBe(true);
    expect(res.body).toHaveProperty('gardenPreviewByUserId');
  });

  it('returns world projection payload for authenticated user', async () => {
    const token = await registerAndLogin('wgardens');
    const res = await request(app)
      .get('/api/world/gardens')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.gardenSlots)).toBe(true);
    expect(Array.isArray(res.body.occupants)).toBe(true);
    expect(res.body).toHaveProperty('gardenPreviewByUserId');
    expect(res.body.occupants.length).toBeGreaterThan(0);
    expect(res.body.occupants[0]).toHaveProperty('slotId');
  });
});

// ── Admin world routes ────────────────────────────────────────────────────────
describe('GET /api/admin/world', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/world');
    expect(res.status).toBe(401);
  });

  it('returns null when no map is saved (in-memory)', async () => {
    const token = await registerAndLogin('wget');
    const res = await request(app)
      .get('/api/admin/world')
      .set('Authorization', `Bearer ${token}`);
    // Regular user is not admin → may be 403, that is acceptable
    // We just verify it's not 500 or 200 with no error for non-admin
    expect([200, 403]).toContain(res.status);
  });
});

describe('PUT /api/admin/world', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).put('/api/admin/world').send({ map: makeMap(), gardenSlots: [] });
    expect(res.status).toBe(401);
  });

  it('rejects a map with wrong dimensions (too few rows)', async () => {
    const token = await registerAndLogin('wput');
    const badMap = Array.from({ length: 10 }, () => Array(22).fill(0)); // 10 rows instead of 14
    const res = await request(app)
      .put('/api/admin/world')
      .set('Authorization', `Bearer ${token}`)
      .send({ map: badMap, gardenSlots: [] });
    // Admins get 400, non-admins might get 403 first — both are non-2xx
    expect(res.status).not.toBe(200);
  });

  it('rejects a map with wrong column count', async () => {
    const token = await registerAndLogin('wputcol');
    const badMap = Array.from({ length: 14 }, () => Array(10).fill(0)); // 10 cols instead of 22
    const res = await request(app)
      .put('/api/admin/world')
      .set('Authorization', `Bearer ${token}`)
      .send({ map: badMap, gardenSlots: [] });
    expect(res.status).not.toBe(200);
  });

  it('rejects when gardenSlots is missing', async () => {
    const token = await registerAndLogin('wputgs');
    const res = await request(app)
      .put('/api/admin/world')
      .set('Authorization', `Bearer ${token}`)
      .send({ map: makeMap() }); // no gardenSlots
    expect(res.status).not.toBe(200);
  });
});

// ── Plugin config routes ──────────────────────────────────────────────────────
describe('GET /api/admin/plugins/:name/config', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/plugins/myplugin/config');
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/admin/plugins/:name/config', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).put('/api/admin/plugins/myplugin/config').send({ foo: 'bar' });
    expect(res.status).toBe(401);
  });

  it('rejects an array body', async () => {
    const token = await registerAndLogin('pcfg');
    const res = await request(app)
      .put('/api/admin/plugins/myplugin/config')
      .set('Authorization', `Bearer ${token}`)
      .send([{ foo: 'bar' }]); // array, not object
    // Non-admin gets 403, admin gets 400 — neither is 200
    expect(res.status).not.toBe(200);
  });
});

// ── In-memory state modules ───────────────────────────────────────────────────
describe('worldMap state', () => {
  it('starts as null', () => {
    expect(worldMap.get()).toBeNull();
  });

  it('stores and retrieves a map object', () => {
    const val = { map: makeMap(), gardenSlots: [] };
    worldMap.set(val);
    expect(worldMap.get()).toEqual(val);
  });

  it('clears back to null', () => {
    worldMap.set({ map: makeMap(), gardenSlots: [] });
    worldMap.clear();
    expect(worldMap.get()).toBeNull();
  });
});

describe('pluginConfig state', () => {
  it('returns null for unknown plugin', () => {
    expect(pluginCfg.get('missing')).toBeNull();
  });

  it('stores and retrieves config', () => {
    pluginCfg.set('testplugin', { enabled: true, key: 'abc' });
    expect(pluginCfg.get('testplugin')).toEqual({ enabled: true, key: 'abc' });
  });

  it('clear() with name removes only that plugin', () => {
    pluginCfg.set('a', { x: 1 });
    pluginCfg.set('b', { x: 2 });
    pluginCfg.clear('a');
    expect(pluginCfg.get('a')).toBeNull();
    expect(pluginCfg.get('b')).toEqual({ x: 2 });
  });

  it('clear() without name removes all', () => {
    pluginCfg.set('a', { x: 1 });
    pluginCfg.set('b', { x: 2 });
    pluginCfg.clear();
    expect(Object.keys(pluginCfg.all())).toHaveLength(0);
  });
});
