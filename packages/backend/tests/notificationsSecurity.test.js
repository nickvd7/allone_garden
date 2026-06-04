/**
 * Security tests — notifications surface (player proposals + content proposals).
 */
const request = require('supertest');

process.env.JWT_SECRET = 'test-secret-for-notifications-security-32chars';
process.env.DATABASE_URL = '';
process.env.P2P_ENABLED = 'false';

const { app } = require('../src/index');

async function registerAndLogin(suffix) {
  const creds = {
    username: `notif${suffix}`,
    email: `notif${suffix}@example.com`,
    password: 'NotifSecure1234',
  };
  await request(app).post('/api/auth/register').send(creds);
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: creds.username, password: creds.password });
  return { token: res.body.token, userId: res.body.user?.id, username: creds.username };
}

describe('Notifications — player proposals security', () => {
  it('GET /api/player-proposals requires authentication', async () => {
    const res = await request(app).get('/api/player-proposals');
    expect(res.status).toBe(401);
  });

  it('proposer cannot accept own outgoing proposal', async () => {
    const alice = await registerAndLogin(`prop${Date.now()}`);
    const bob = await registerAndLogin(`prb${Date.now()}`);

    const created = await request(app)
      .post('/api/player-proposals')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        toUserId: bob.userId,
        kind: 'trade',
        payload: { offerCrop: 'tomato', offerQty: 1, wantCrop: 'carrot', wantQty: 1 },
      });

    expect(created.status).toBe(201);

    const selfAccept = await request(app)
      .post(`/api/player-proposals/${created.body.id}/respond`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ action: 'accept' });

    expect(selfAccept.status).toBe(404);
  });

  it('third party cannot accept proposal between two other users', async () => {
    const alice = await registerAndLogin(`p3a${Date.now()}`);
    const bob = await registerAndLogin(`p3b${Date.now()}`);
    const carol = await registerAndLogin(`p3c${Date.now()}`);

    const created = await request(app)
      .post('/api/player-proposals')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ toUserId: bob.userId, kind: 'collaborate', payload: { task: 'shared_garden' } });

    const hijack = await request(app)
      .post(`/api/player-proposals/${created.body.id}/respond`)
      .set('Authorization', `Bearer ${carol.token}`)
      .send({ action: 'accept' });

    expect(hijack.status).toBe(404);
  });

  it('rejects invalid respond action', async () => {
    const alice = await registerAndLogin(`p4a${Date.now()}`);
    const bob = await registerAndLogin(`p4b${Date.now()}`);

    const created = await request(app)
      .post('/api/player-proposals')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ toUserId: bob.userId, kind: 'trade', payload: { offerCrop: 'tomato', offerQty: 1 } });

    const res = await request(app)
      .post(`/api/player-proposals/${created.body.id}/respond`)
      .set('Authorization', `Bearer ${bob.token}`)
      .send({ action: 'delete' });

    expect(res.status).toBe(400);
  });

  it('strips HTML/script from proposal message', async () => {
    const alice = await registerAndLogin(`p5a${Date.now()}`);
    const bob = await registerAndLogin(`p5b${Date.now()}`);

    const created = await request(app)
      .post('/api/player-proposals')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        toUserId: bob.userId,
        kind: 'collaborate',
        payload: { task: 'shared_garden' },
        message: '<script>alert(1)</script>Hello',
      });

    expect(created.status).toBe(201);
    expect(created.body.message).not.toMatch(/<script/i);
    expect(created.body.message).toContain('Hello');
  });

  it('list only includes proposals involving the authenticated user', async () => {
    const alice = await registerAndLogin(`p6a${Date.now()}`);
    const bob = await registerAndLogin(`p6b${Date.now()}`);
    const carol = await registerAndLogin(`p6c${Date.now()}`);

    await request(app)
      .post('/api/player-proposals')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ toUserId: bob.userId, kind: 'collaborate', payload: { task: 'x' } });

    const carolList = await request(app)
      .get('/api/player-proposals')
      .set('Authorization', `Bearer ${carol.token}`);

    expect(carolList.status).toBe(200);
    const unrelated = (carolList.body.proposals || []).filter(
      (p) => (
        (String(p.fromUserId) === String(alice.userId) && String(p.toUserId) === String(bob.userId))
        || (String(p.fromUserId) === String(bob.userId) && String(p.toUserId) === String(alice.userId))
      ),
    );
    expect(unrelated.length).toBe(0);
  });
});

describe('Notifications — content proposals security', () => {
  it('GET /api/content/proposals/mine requires authentication', async () => {
    const res = await request(app).get('/api/content/proposals/mine');
    expect(res.status).toBe(401);
  });

  it('non-admin cannot list admin content proposals', async () => {
    const user = await registerAndLogin(`c1${Date.now()}`);

    const res = await request(app)
      .get('/api/admin/content/proposals')
      .set('Authorization', `Bearer ${user.token}`);

    expect(res.status).toBe(403);
  });

  it('non-admin cannot approve content proposals via admin API', async () => {
    const user = await registerAndLogin(`c2${Date.now()}`);

    const res = await request(app)
      .post('/api/admin/content/proposals/fake-id/approve')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ note: '' });

    expect([403, 404]).toContain(res.status);
  });

  it('non-admin cannot reject content proposals via admin API', async () => {
    const user = await registerAndLogin(`c3${Date.now()}`);

    const res = await request(app)
      .post('/api/admin/content/proposals/fake-id/reject')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ note: 'nope' });

    expect([403, 404]).toContain(res.status);
  });

  it('authenticated user only sees own content proposals in /mine', async () => {
    const alice = await registerAndLogin(`c4a${Date.now()}`);
    const bob = await registerAndLogin(`c4b${Date.now()}`);

    await request(app)
      .post('/api/content/propose')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        type: 'plants',
        item: { slug: 'notif_test_plant', name: 'Notif Plant', description: 'Test' },
      });

    const bobMine = await request(app)
      .get('/api/content/proposals/mine')
      .set('Authorization', `Bearer ${bob.token}`);

    expect(bobMine.status).toBe(200);
    const slugs = (bobMine.body.proposals || []).map((p) => p.item?.slug);
    expect(slugs).not.toContain('notif_test_plant');
  });
});
