/**
 * Integration tests — village shop & trade execution on proposal accept.
 */
const request = require('supertest');

process.env.JWT_SECRET = 'test-secret-village-shop-at-least-32-chars';
process.env.DATABASE_URL = '';
process.env.P2P_ENABLED = 'false';
process.env.NODE_ENV = 'test';

const { app, stopNpcWorldTick } = require('../src/index');

afterAll(() => {
  stopNpcWorldTick?.();
});

async function registerAndLogin(suffix) {
  const creds = {
    username: `vsuser${suffix}`,
    email: `vsuser${suffix}@example.com`,
    password: 'Proposal1234',
  };
  await request(app).post('/api/auth/register').send(creds);
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: creds.username, password: creds.password });
  return { token: res.body.token, userId: res.body.user?.id };
}

describe('POST /api/village/shop/buy', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/village/shop/buy')
      .send({ shopId: 'tools-shop', productId: 'spray-pack' });
    expect(res.status).toBe(401);
  });

  it('purchases spray with coins in memory mode', async () => {
    const user = await registerAndLogin(`shop${Date.now()}`);
    const res = await request(app)
      .post('/api/village/shop/buy')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ shopId: 'tools-shop', productId: 'spray-pack' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.inventory.spray).toBe(5);
    expect(res.body.coins).toBe(88);
  });

  it('rejects unknown product', async () => {
    const user = await registerAndLogin(`bad${Date.now()}`);
    const res = await request(app)
      .post('/api/village/shop/buy')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ shopId: 'tools-shop', productId: 'fake-item' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/player-proposals accept — trade swap', () => {
  it('swaps inventory between two players on accept', async () => {
    const alice = await registerAndLogin(`ta${Date.now()}`);
    const bob = await registerAndLogin(`tb${Date.now()}`);

    const garden = require('../src/routes/garden');
    garden.getMemInventory(alice.userId).tomato = 3;
    garden.getMemInventory(bob.userId).carrot = 2;

    const created = await request(app)
      .post('/api/player-proposals')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        toUserId: bob.userId,
        kind: 'trade',
        message: 'Ruil?',
        payload: { offer: { tomato: 1 }, request: { carrot: 1 } },
      });
    expect(created.status).toBe(201);

    const accepted = await request(app)
      .post(`/api/player-proposals/${created.body.id}/respond`)
      .set('Authorization', `Bearer ${bob.token}`)
      .send({ action: 'accept' });

    expect(accepted.status).toBe(200);
    expect(accepted.body.inventory.carrot).toBe(1);
    expect(accepted.body.inventory.tomato).toBe(1);
  });
});
