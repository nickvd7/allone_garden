/**
 * Integration tests — admin routes.
 *
 * Tests run in in-memory mode (no DATABASE_URL).
 * Admin access granted via ADMIN_USERS env var.
 */
const request = require('supertest');

process.env.JWT_SECRET   = 'test-secret-for-jest';
process.env.DATABASE_URL = '';
process.env.P2P_ENABLED  = 'false';
process.env.NODE_ENV     = 'test';
process.env.ADMIN_USERS  = 'adminuser';

const { app } = require('../src/index');

// ── Helpers ───────────────────────────────────────────────────────────────────
async function makeUser(username) {
  await request(app).post('/api/auth/register').send({
    username,
    email: `${username}@example.com`,
    password: 'Admin1234',
  });
  const res = await request(app).post('/api/auth/login').send({
    username,
    password: 'Admin1234',
  });
  return res.body.token;
}

let adminToken;
let userToken;

beforeAll(async () => {
  adminToken = await makeUser('adminuser');
  userToken  = await makeUser('normaluser');
});

// ── Auth guard ────────────────────────────────────────────────────────────────
describe('Admin routes — auth guard', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/stats');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin/i);
  });
});

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
describe('GET /api/admin/stats', () => {
  it('returns server stats for admin', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('server');
    expect(res.body.server).toHaveProperty('uptime');
    expect(res.body.server).toHaveProperty('nodeVersion');
    expect(res.body).toHaveProperty('memory');
    expect(res.body.memory).toHaveProperty('heapUsedMB');
    expect(res.body).toHaveProperty('cpu');
    expect(res.body).toHaveProperty('plugins');
  });

  it('includes null database stats when not connected', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.database).toBeNull();
  });
});

// ── GET /api/admin/players ────────────────────────────────────────────────────
describe('GET /api/admin/players', () => {
  it('returns players array for admin', async () => {
    const res = await request(app)
      .get('/api/admin/players')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('players');
    expect(Array.isArray(res.body.players)).toBe(true);
  });

  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/players')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });
});

// ── GET /api/admin/plugins ────────────────────────────────────────────────────
describe('GET /api/admin/plugins', () => {
  it('returns plugins list for admin', async () => {
    const res = await request(app)
      .get('/api/admin/plugins')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/plugins')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });
});

// ── POST /api/admin/plugins/:name/reload ──────────────────────────────────────
describe('POST /api/admin/plugins/:name/reload', () => {
  it('responds with success for admin (even for unknown plugin)', async () => {
    const res = await request(app)
      .post('/api/admin/plugins/nonexistent/reload')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .post('/api/admin/plugins/someplugin/reload')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });
});

// ── GET /api/admin/peers ──────────────────────────────────────────────────────
describe('GET /api/admin/peers', () => {
  it('returns empty array in in-memory mode', async () => {
    const res = await request(app)
      .get('/api/admin/peers')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/peers')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });
});
