/**
 * Integration tests — player trade/collaboration proposals API.
 */
const request = require('supertest');

process.env.JWT_SECRET = 'test-secret-for-player-proposals-at-least-32';
process.env.DATABASE_URL = '';
process.env.P2P_ENABLED = 'false';

const { app } = require('../src/index');

async function registerAndLogin(suffix) {
  const creds = {
    username: `ppuser${suffix}`,
    email: `ppuser${suffix}@example.com`,
    password: 'Proposal1234',
  };
  await request(app).post('/api/auth/register').send(creds);
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: creds.username, password: creds.password });
  return { token: res.body.token, userId: res.body.user?.id };
}

describe('GET /api/player-proposals — auth', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/player-proposals');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/player-proposals — validation', () => {
  let alice;
  let bob;

  beforeEach(async () => {
    alice = await registerAndLogin(`a${Date.now()}`);
    bob = await registerAndLogin(`b${Date.now()}`);
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/player-proposals')
      .send({ toUserId: bob.userId, kind: 'trade', payload: {} });
    expect(res.status).toBe(401);
  });

  it('returns 400 when sending to self', async () => {
    const res = await request(app)
      .post('/api/player-proposals')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ toUserId: alice.userId, kind: 'trade', payload: {} });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid kind', async () => {
    const res = await request(app)
      .post('/api/player-proposals')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ toUserId: bob.userId, kind: 'hack', payload: {} });
    expect(res.status).toBe(400);
  });

  it('returns 400 for oversized payload', async () => {
    const huge = { data: 'x'.repeat(600) };
    const res = await request(app)
      .post('/api/player-proposals')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ toUserId: bob.userId, kind: 'trade', payload: huge });
    expect(res.status).toBe(400);
  });

  it('creates a sanitized trade proposal', async () => {
    const res = await request(app)
      .post('/api/player-proposals')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        toUserId: bob.userId,
        kind: 'trade',
        payload: { offerCrop: 'tomato', offerQty: 3, wantCrop: 'carrot', wantQty: 2 },
        message: 'Ruil?',
      });
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe('trade');
    expect(res.body.payload.offerCrop).toBe('tomato');
    expect(res.body.message).toBe('Ruil?');
  });
});

describe('POST /api/player-proposals/:id/respond — auth', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/player-proposals/1/respond')
      .send({ action: 'accept' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when responder is not the recipient', async () => {
    const alice = await registerAndLogin(`r1${Date.now()}`);
    const bob = await registerAndLogin(`r2${Date.now()}`);
    const carol = await registerAndLogin(`r3${Date.now()}`);

    const created = await request(app)
      .post('/api/player-proposals')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ toUserId: bob.userId, kind: 'collaborate', payload: { plotIndex: 1 } });

    const res = await request(app)
      .post(`/api/player-proposals/${created.body.id}/respond`)
      .set('Authorization', `Bearer ${carol.token}`)
      .send({ action: 'accept' });
    expect(res.status).toBe(404);
  });
});
