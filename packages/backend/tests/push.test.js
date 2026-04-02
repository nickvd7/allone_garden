/**
 * Push token registration (mobile device tokens).
 */
const request = require('supertest');

process.env.JWT_SECRET = 'test-secret-for-jest-0123456789-very-long';
process.env.DATABASE_URL = '';
process.env.P2P_ENABLED = 'false';

const { app } = require('../src/index');

describe('POST /api/push/register', () => {
  let token;

  beforeAll(async () => {
    const reg = await request(app).post('/api/auth/register').send({
      username: 'pushtest',
      email: 'pushtest@example.com',
      password: 'Secure1234',
    });
    token = reg.body.token;
  });

  it('rejects without auth', async () => {
    const res = await request(app).post('/api/push/register').send({
      token: 'a'.repeat(32),
    });
    expect(res.status).toBe(401);
  });

  it('rejects invalid token', async () => {
    const res = await request(app)
      .post('/api/push/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: 'short' });
    expect(res.status).toBe(400);
  });

  it('stores a valid token', async () => {
    const res = await request(app)
      .post('/api/push/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: 'fcm-token-' + 'x'.repeat(40), platform: 'android' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('accepts transport=fcm explicitly', async () => {
    const res = await request(app)
      .post('/api/push/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: 'fcm-token-' + 'z'.repeat(40), platform: 'android', transport: 'fcm' });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/push/analytics', () => {
  let token;
  beforeAll(async () => {
    const reg = await request(app).post('/api/auth/register').send({
      username: 'pushanalytic',
      email: 'pushanalytic@example.com',
      password: 'Secure1234',
    });
    token = reg.body.token;
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/push/analytics').send({ event: 'opened' });
    expect(res.status).toBe(401);
  });

  it('records event when authenticated', async () => {
    const res = await request(app)
      .post('/api/push/analytics')
      .set('Authorization', `Bearer ${token}`)
      .send({ event: 'opened' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('DELETE /api/push/register', () => {
  let token;

  beforeAll(async () => {
    const reg = await request(app).post('/api/auth/register').send({
      username: 'pushtest2',
      email: 'pushtest2@example.com',
      password: 'Secure1234',
    });
    token = reg.body.token;
  });

  it('clears token', async () => {
    await request(app)
      .post('/api/push/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: 'fcm-token-' + 'y'.repeat(40) });

    const res = await request(app)
      .delete('/api/push/register')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
