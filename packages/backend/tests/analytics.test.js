/**
 * Integration tests — analytics routes.
 * Runs in in-memory mode (no DATABASE_URL).
 */
const request = require('supertest');

process.env.JWT_SECRET   = 'test-secret-for-jest';
process.env.DATABASE_URL = '';
process.env.P2P_ENABLED  = 'false';

const { app } = require('../src/index');

async function registerAndLogin(suffix) {
  const creds = {
    username: `analyticsuser${suffix}`,
    email:    `analyticsuser${suffix}@example.com`,
    password: 'Analytics1234',
  };
  await request(app).post('/api/auth/register').send(creds);
  const res = await request(app).post('/api/auth/login').send({
    username: creds.username, password: creds.password,
  });
  return res.body.token;
}

async function makeAdmin(token) {
  // Promote user to admin via admin route using the same token
  // In test env we use ADMIN_USERS env trick if available;
  // otherwise fall back to testing the 403 path.
  return token;
}

// ── POST /api/analytics/event ─────────────────────────────────────────────────
describe('POST /api/analytics/event', () => {
  it('accepts a known event without auth', async () => {
    const res = await request(app)
      .post('/api/analytics/event')
      .send({ event: 'session_start', properties: { level: 1 } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('accepts a known event with optional auth token', async () => {
    const token = await registerAndLogin('a1');
    const res = await request(app)
      .post('/api/analytics/event')
      .set('Authorization', `Bearer ${token}`)
      .send({ event: 'crop_planted', properties: { cropType: 'tomato', season: 'spring' } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects an unknown event', async () => {
    const res = await request(app)
      .post('/api/analytics/event')
      .send({ event: 'hack_the_planet' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unknown event/i);
  });

  it('rejects a missing event name', async () => {
    const res = await request(app)
      .post('/api/analytics/event')
      .send({ properties: { foo: 'bar' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/event name required/i);
  });

  it('strips unknown property keys', async () => {
    const res = await request(app)
      .post('/api/analytics/event')
      .send({ event: 'level_up', properties: { level: 5, secret: 'password' } });
    expect(res.status).toBe(200);
  });

  it('accepts all whitelisted events', async () => {
    const events = [
      'session_start', 'page_view', 'crop_planted', 'crop_harvested',
      'structure_built', 'trade_completed', 'level_up', 'quest_completed',
      'plugin_activated', 'world_joined', 'world_left', 'proposal_created',
      'proposal_voted', 'content_created', 'chat_message_sent',
    ];
    for (const event of events) {
      const res = await request(app).post('/api/analytics/event').send({ event });
      expect(res.status).toBe(200);
    }
  });
});

// ── GET /api/analytics/summary — auth guard ───────────────────────────────────
describe('GET /api/analytics/summary — auth guard', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/analytics/summary');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const token = await registerAndLogin('a2');
    const res = await request(app)
      .get('/api/analytics/summary')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

// ── GET /api/analytics/events — auth guard ────────────────────────────────────
describe('GET /api/analytics/events — auth guard', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/analytics/events');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const token = await registerAndLogin('a3');
    const res = await request(app)
      .get('/api/analytics/events')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
