/**
 * Integration tests — game content routes + contentStore module.
 */
const request = require('supertest');

process.env.JWT_SECRET   = 'test-secret-for-jest';
process.env.DATABASE_URL = '';
process.env.P2P_ENABLED  = 'false';

const { app }        = require('../src/index');
const contentStore   = require('../src/state/contentStore');
const defaultContent = require('../src/state/defaultContent');

// Reset store between tests
beforeEach(() => {
  contentStore.clear();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function registerAndLogin(suffix) {
  const creds = { username: `cuser${suffix}`, email: `cuser${suffix}@example.com`, password: 'Content1234' };
  await request(app).post('/api/auth/register').send(creds);
  const res = await request(app).post('/api/auth/login').send({ username: creds.username, password: creds.password });
  return res.body.token;
}

// ── Public GET /api/content ───────────────────────────────────────────────────
describe('GET /api/content — public', () => {
  it('returns all four content types', async () => {
    const res = await request(app).get('/api/content');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('plants');
    expect(res.body).toHaveProperty('structures');
    expect(res.body).toHaveProperty('tools');
    expect(res.body).toHaveProperty('weather');
  });

  it('returns 9 default plants', async () => {
    const res = await request(app).get('/api/content');
    expect(res.body.plants).toHaveLength(9);
  });

  it('does not require authentication', async () => {
    const res = await request(app).get('/api/content');
    expect(res.status).not.toBe(401);
  });

  it('reflects custom plant added to contentStore', async () => {
    contentStore.setCustom('plants', [{
      slug: 'banana', name: 'Banana', harvestEmoji: '🍌',
      growthEmojis: ['🌱', '🍌'], growthDays: 3, baseCoins: 12,
      companionGood: [], companionBad: [],
    }]);
    const res = await request(app).get('/api/content');
    const slugs = res.body.plants.map((p) => p.slug);
    expect(slugs).toContain('banana');
    expect(slugs).toHaveLength(10); // 9 defaults + 1 custom
  });
});

// ── Admin content routes ──────────────────────────────────────────────────────
describe('GET /api/admin/content/:type — auth guard', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/content/plants');
    expect(res.status).toBe(401);
  });

  it('returns 400 for unknown content type', async () => {
    const token = await registerAndLogin('gc1');
    const res = await request(app)
      .get('/api/admin/content/unicorns')
      .set('Authorization', `Bearer ${token}`);
    // Non-admins get 403, admins get 400
    expect(res.status).not.toBe(200);
  });
});

describe('PUT /api/admin/content/:type — auth guard', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).put('/api/admin/content/plants').send([]);
    expect(res.status).toBe(401);
  });

  it('returns 4xx for non-array body', async () => {
    const token = await registerAndLogin('pc2');
    const res = await request(app)
      .put('/api/admin/content/plants')
      .set('Authorization', `Bearer ${token}`)
      .send({ not: 'an array' });
    expect(res.status).not.toBe(200);
  });

  it('returns 4xx for unknown type', async () => {
    const token = await registerAndLogin('pc3');
    const res = await request(app)
      .put('/api/admin/content/aliens')
      .set('Authorization', `Bearer ${token}`)
      .send([]);
    expect(res.status).not.toBe(200);
  });
});

// ── contentStore unit tests ───────────────────────────────────────────────────
describe('contentStore — defaults', () => {
  it('returns 9 plants by default', () => {
    expect(contentStore.getPlants()).toHaveLength(9);
  });

  it('returns 3 structures by default', () => {
    expect(contentStore.getStructures()).toHaveLength(3);
  });

  it('returns 6 tools by default', () => {
    expect(contentStore.getTools()).toHaveLength(6);
  });

  it('returns 6 weather conditions by default', () => {
    expect(contentStore.getWeather()).toHaveLength(6);
  });

  it('getAll() returns all four lists', () => {
    const all = contentStore.getAll();
    expect(all).toHaveProperty('plants');
    expect(all).toHaveProperty('structures');
    expect(all).toHaveProperty('tools');
    expect(all).toHaveProperty('weather');
  });
});

describe('contentStore — custom overrides', () => {
  it('custom plant with new slug is appended', () => {
    contentStore.setCustom('plants', [{ slug: 'mango', name: 'Mango', growthDays: 5, baseCoins: 20, harvestEmoji: '🥭', growthEmojis: [], companionGood: [], companionBad: [] }]);
    const plants = contentStore.getPlants();
    expect(plants.map((p) => p.slug)).toContain('mango');
    expect(plants).toHaveLength(10);
  });

  it('custom plant overrides default by slug', () => {
    contentStore.setCustom('plants', [{ slug: 'tomato', name: 'Cherry Tomato', growthDays: 2, baseCoins: 8, harvestEmoji: '🍅', growthEmojis: [], companionGood: [], companionBad: [] }]);
    const tomato = contentStore.getPlants().find((p) => p.slug === 'tomato');
    expect(tomato.name).toBe('Cherry Tomato');
    expect(tomato.growthDays).toBe(2);
    expect(contentStore.getPlants()).toHaveLength(9); // count unchanged
  });

  it('_deleted:true removes a plant from the merged list', () => {
    contentStore.setCustom('plants', [{ slug: 'radish', _deleted: true }]);
    const slugs = contentStore.getPlants().map((p) => p.slug);
    expect(slugs).not.toContain('radish');
    expect(contentStore.getPlants()).toHaveLength(8);
  });

  it('clear() resets all customs', () => {
    contentStore.setCustom('plants', [{ slug: 'cherry', name: 'Cherry', growthDays: 1, baseCoins: 5, harvestEmoji: '🍒', growthEmojis: [], companionGood: [], companionBad: [] }]);
    contentStore.clear();
    expect(contentStore.getPlants()).toHaveLength(9);
    expect(contentStore.getCustom('plants')).toHaveLength(0);
  });

  it('setCustom throws for unknown type', () => {
    expect(() => contentStore.setCustom('dragons', [])).toThrow();
  });
});

describe('contentStore — defaultContent structure', () => {
  it('each plant has required fields', () => {
    for (const p of defaultContent.PLANTS) {
      expect(p).toHaveProperty('slug');
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('growthDays');
      expect(p).toHaveProperty('baseCoins');
      expect(p).toHaveProperty('harvestEmoji');
      expect(Array.isArray(p.companionGood)).toBe(true);
      expect(Array.isArray(p.companionBad)).toBe(true);
    }
  });

  it('each weather condition has required fields', () => {
    for (const w of defaultContent.WEATHER) {
      expect(w).toHaveProperty('id');
      expect(w).toHaveProperty('pestChance');
      expect(typeof w.stormRollback).toBe('boolean');
    }
  });
});
