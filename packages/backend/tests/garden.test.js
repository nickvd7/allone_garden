/**
 * Integration tests — garden routes.
 *
 * All tests run in in-memory mode (no DATABASE_URL) so no external
 * dependencies are needed.
 */
const request = require('supertest');

process.env.JWT_SECRET   = 'test-secret-for-jest';
process.env.DATABASE_URL = '';
process.env.P2P_ENABLED  = 'false';

const { app } = require('../src/index');

// ── Helpers ───────────────────────────────────────────────────────────────────
async function registerAndLogin(suffix) {
  const creds = {
    username: `gardenuser${suffix}`,
    email:    `gardenuser${suffix}@example.com`,
    password: 'Garden1234',
  };
  await request(app).post('/api/auth/register').send(creds);
  const res = await request(app).post('/api/auth/login').send({
    username: creds.username,
    password: creds.password,
  });
  return res.body.token;
}

// ── Auth guard ────────────────────────────────────────────────────────────────
describe('GET /api/garden — auth guard', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/garden');
    expect(res.status).toBe(401);
  });

  it('returns 401 with a tampered token', async () => {
    const res = await request(app)
      .get('/api/garden')
      .set('Authorization', 'Bearer bad.token.here');
    expect(res.status).toBe(401);
  });
});

// ── Load garden ───────────────────────────────────────────────────────────────
describe('GET /api/garden', () => {
  let token;
  beforeAll(async () => { token = await registerAndLogin('load'); });

  it('returns a default garden on first load', async () => {
    const res = await request(app)
      .get('/api/garden')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.plots)).toBe(true);
    expect(res.body.plots.length).toBe(24);
    expect(res.body).toHaveProperty('currentDay');
    expect(res.body).toHaveProperty('weather');
  });
});

// ── Save garden ───────────────────────────────────────────────────────────────
describe('POST /api/garden', () => {
  let token;
  beforeAll(async () => { token = await registerAndLogin('save'); });

  it('saves and reloads garden state', async () => {
    const plots = Array(24).fill(null).map(() => ({
      tilled: true, planted: false, plantType: null,
      waterLevel: 0, fertilized: false, daysPlanted: 0,
    }));

    const saveRes = await request(app)
      .post('/api/garden')
      .set('Authorization', `Bearer ${token}`)
      .send({ plots, currentDay: 5, weather: 'rainy' });
    expect(saveRes.status).toBe(200);
    expect(saveRes.body.success).toBe(true);

    const loadRes = await request(app)
      .get('/api/garden')
      .set('Authorization', `Bearer ${token}`);
    expect(loadRes.body.currentDay).toBe(5);
    expect(loadRes.body.weather).toBe('rainy');
    expect(loadRes.body.plots[0].tilled).toBe(true);
  });

  it('rejects a save without plots', async () => {
    const res = await request(app)
      .post('/api/garden')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentDay: 1 });
    expect(res.status).toBe(400);
  });

  it('updates world garden preview after save', async () => {
    const plots = [
      { tilled: true, planted: true, plantType: 'tomato', waterLevel: 1, fertilized: false, daysPlanted: 3 },
      { tilled: true, planted: true, plantType: 'carrot', waterLevel: 0, fertilized: false, daysPlanted: 1 },
      ...Array(22).fill(null).map(() => ({
        tilled: false, planted: false, plantType: null,
        waterLevel: 0, fertilized: false, daysPlanted: 0,
      })),
    ];
    const saveRes = await request(app)
      .post('/api/garden')
      .set('Authorization', `Bearer ${token}`)
      .send({ plots, currentDay: 8, weather: 'sunny' });
    expect(saveRes.status).toBe(200);

    const projectionRes = await request(app)
      .get('/api/world/gardens')
      .set('Authorization', `Bearer ${token}`);
    expect(projectionRes.status).toBe(200);
    const me = projectionRes.body.occupants.find((o) => Number(o.userId) > 0);
    expect(me).toBeTruthy();
    const preview = projectionRes.body.gardenPreviewByUserId[String(me.userId)];
    expect(preview).toBeTruthy();
    expect(typeof preview.planted).toBe('number');
    expect(typeof preview.ready).toBe('number');
    expect(Array.isArray(preview.tiles)).toBe(true);
  });
});

// ── Garden actions ────────────────────────────────────────────────────────────
describe('POST /api/garden/action', () => {
  let token;

  beforeAll(async () => {
    token = await registerAndLogin('action');
    // Start with a clean default garden
    await request(app)
      .get('/api/garden')
      .set('Authorization', `Bearer ${token}`);
  });

  it('tills a plot', async () => {
    const res = await request(app)
      .post('/api/garden/action')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'till', plotIndex: 0 });
    expect(res.status).toBe(200);
    expect(res.body.plot.tilled).toBe(true);
  });

  it('plants on a tilled plot', async () => {
    const res = await request(app)
      .post('/api/garden/action')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'plant', plotIndex: 0, payload: { plantType: 'tomato' } });
    expect(res.status).toBe(200);
    expect(res.body.plot.planted).toBe(true);
    expect(res.body.plot.plantType).toBe('tomato');
  });

  it('waters a planted plot', async () => {
    const res = await request(app)
      .post('/api/garden/action')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'water', plotIndex: 0 });
    expect(res.status).toBe(200);
    expect(res.body.plot.waterLevel).toBeGreaterThan(0);
  });

  it('fertilizes a plot', async () => {
    const res = await request(app)
      .post('/api/garden/action')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'fertilize', plotIndex: 0 });
    expect(res.status).toBe(200);
    expect(res.body.plot.fertilized).toBe(true);
  });

  it('harvests a plot and resets its state', async () => {
    // Tomato requires 3 daysPlanted before it can be harvested.
    // Save the garden with the tomato already ripe so the harvest succeeds.
    await request(app)
      .post('/api/garden')
      .set('Authorization', `Bearer ${token}`)
      .send({
        plots: [
          {
            tilled: true, planted: true, plantType: 'tomato',
            waterLevel: 1, fertilized: false, daysPlanted: 3,
          },
          ...Array(23).fill({
            tilled: false, planted: false, plantType: null,
            waterLevel: 0, fertilized: false, daysPlanted: 0,
          }),
        ],
        currentDay: 1,
        weather: 'sunny',
      });

    const res = await request(app)
      .post('/api/garden/action')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'harvest', plotIndex: 0 });
    expect(res.status).toBe(200);
    expect(res.body.plot.planted).toBe(false);
    expect(res.body.plot.plantType).toBeNull();
  });

  it('rejects planting on an untilled plot', async () => {
    // plot 1 has never been tilled
    const res = await request(app)
      .post('/api/garden/action')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'plant', plotIndex: 1, payload: { plantType: 'carrot' } });
    expect(res.status).toBe(200); // action succeeds but plot stays unplanted
    expect(res.body.plot.planted).toBe(false);
  });

  it('rejects an unknown action type', async () => {
    const res = await request(app)
      .post('/api/garden/action')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'explode', plotIndex: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/action/i);
  });

  it('rejects an out-of-range plot index', async () => {
    const res = await request(app)
      .post('/api/garden/action')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'till', plotIndex: 999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/plotIndex/i);
  });
});

// ── Next day ──────────────────────────────────────────────────────────────────
describe('POST /api/garden/nextday', () => {
  let token;

  beforeAll(async () => {
    token = await registerAndLogin('nextday');
    // Create and save a garden first
    const plots = Array(24).fill(null).map(() => ({
      tilled: false, planted: false, plantType: null,
      waterLevel: 0, fertilized: false, daysPlanted: 0,
    }));
    await request(app)
      .post('/api/garden')
      .set('Authorization', `Bearer ${token}`)
      .send({ plots, currentDay: 1, weather: 'sunny' });
  });

  it('advances the day and returns new weather', async () => {
    const res = await request(app)
      .post('/api/garden/nextday')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.currentDay).toBe(2);
    expect(['sunny', 'cloudy', 'rainy', 'windy', 'storm', 'drought']).toContain(res.body.weather);
    expect(Array.isArray(res.body.plots)).toBe(true);
  });

  it('returns 404 when no garden exists yet', async () => {
    // New user who has never loaded their garden
    const t = await registerAndLogin('nodaygarden');
    const res = await request(app)
      .post('/api/garden/nextday')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);
  });
});
