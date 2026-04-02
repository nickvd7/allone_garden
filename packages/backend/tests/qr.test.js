/**
 * Integration tests — QR routes.
 */
const request = require('supertest');

process.env.JWT_SECRET   = 'test-secret-for-jest';
process.env.DATABASE_URL = '';
process.env.P2P_ENABLED  = 'false';

const { app } = require('../src/index');

async function registerAndLogin(suffix) {
  const creds = { username: `qruser${suffix}`, email: `qruser${suffix}@example.com`, password: 'QrTest1234' };
  await request(app).post('/api/auth/register').send(creds);
  const res = await request(app).post('/api/auth/login').send({ username: creds.username, password: creds.password });
  return res.body.token;
}

// ── GET /api/qr/code/:slug ─────────────────────────────────────────────────────
describe('GET /api/qr/code/:plantSlug', () => {
  it('returns an SVG for a known plant', async () => {
    const res = await request(app).get('/api/qr/code/tomato').buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/svg/);
    // res.text works when content is buffered as text
    const body = res.text || (res.body instanceof Buffer ? res.body.toString() : String(res.body));
    expect(body).toContain('<svg');
  });

  it('returns 404 for an unknown plant', async () => {
    const res = await request(app).get('/api/qr/code/durian');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/unknown plant/i);
  });

  it('works for all built-in plants', async () => {
    const plants = ['tomato','carrot','lettuce','radish','corn','potato','pumpkin','sunflower','blueberry'];
    for (const slug of plants) {
      const res = await request(app).get(`/api/qr/code/${slug}`);
      expect(res.status).toBe(200);
    }
  });
});

// ── GET /api/qr/sheet ─────────────────────────────────────────────────────────
describe('GET /api/qr/sheet', () => {
  it('requires auth', async () => {
    const res = await request(app).get('/api/qr/sheet');
    expect(res.status).toBe(401);
  });

  it('returns plant list for authenticated user', async () => {
    const token = await registerAndLogin('s1');
    const res = await request(app).get('/api/qr/sheet').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.plants)).toBe(true);
    expect(res.body.plants.length).toBeGreaterThan(0);
    expect(res.body.plants[0]).toHaveProperty('slug');
    expect(res.body.plants[0]).toHaveProperty('qrUrl');
  });
});

// ── POST /api/qr/scan ─────────────────────────────────────────────────────────
describe('POST /api/qr/scan', () => {
  it('accepts a valid AllOne Garden QR code', async () => {
    const res = await request(app).post('/api/qr/scan').send({ code: 'allonegarden:plant:tomato' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.slug).toBe('tomato');
    expect(res.body.name).toBe('Tomato');
  });

  it('rejects a non-AllOne QR code', async () => {
    const res = await request(app).post('/api/qr/scan').send({ code: 'https://example.com/product/123' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/not an allone garden/i);
  });

  it('rejects an unknown plant slug', async () => {
    const res = await request(app).post('/api/qr/scan').send({ code: 'allonegarden:plant:durian' });
    expect(res.status).toBe(404);
  });

  it('rejects missing code', async () => {
    const res = await request(app).post('/api/qr/scan').send({});
    expect(res.status).toBe(400);
  });

  it('trims whitespace from scanned codes', async () => {
    const res = await request(app).post('/api/qr/scan').send({ code: '  allonegarden:plant:carrot  ' });
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('carrot');
  });
});
