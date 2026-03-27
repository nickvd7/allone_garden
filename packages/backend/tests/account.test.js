/**
 * Integration tests — account routes.
 *
 * Runs in in-memory mode (no DATABASE_URL). Routes that require a real DB
 * (password change, export, delete) return 503 — we verify that boundary.
 * Password reset is fully testable in-memory.
 */
const request = require('supertest');

process.env.JWT_SECRET   = 'test-secret-for-jest';
process.env.DATABASE_URL = '';
process.env.P2P_ENABLED  = 'false';
process.env.NODE_ENV     = 'test';

const { app } = require('../src/index');

// ── Helpers ───────────────────────────────────────────────────────────────────
async function makeUser(suffix) {
  const creds = {
    username: `acctuser${suffix}`,
    email:    `acctuser${suffix}@example.com`,
    password: 'Account1234',
  };
  await request(app).post('/api/auth/register').send(creds);
  const loginRes = await request(app).post('/api/auth/login').send({
    username: creds.username,
    password: creds.password,
  });
  return { token: loginRes.body.token, ...creds };
}

// ── Auth guards ───────────────────────────────────────────────────────────────
describe('Account routes — auth guards', () => {
  it('PATCH /api/account/password returns 401 without token', async () => {
    const res = await request(app)
      .patch('/api/account/password')
      .send({ currentPassword: 'x', newPassword: 'NewPass123' });
    expect(res.status).toBe(401);
  });

  it('GET /api/account/export returns 401 without token', async () => {
    const res = await request(app).get('/api/account/export');
    expect(res.status).toBe(401);
  });

  it('DELETE /api/account returns 401 without token', async () => {
    const res = await request(app)
      .delete('/api/account')
      .send({ password: 'anything' });
    expect(res.status).toBe(401);
  });
});

// ── Validation ────────────────────────────────────────────────────────────────
describe('PATCH /api/account/password — validation', () => {
  let token;
  beforeAll(async () => { ({ token } = await makeUser('pwval')); });

  it('rejects missing newPassword', async () => {
    const res = await request(app)
      .patch('/api/account/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Account1234' });
    expect(res.status).toBe(400);
  });

  it('rejects short newPassword (<8 chars)', async () => {
    const res = await request(app)
      .patch('/api/account/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Account1234', newPassword: 'Ab1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8/);
  });

  it('rejects newPassword without uppercase', async () => {
    const res = await request(app)
      .patch('/api/account/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Account1234', newPassword: 'nocaps123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/uppercase/i);
  });

  it('rejects newPassword without a number', async () => {
    const res = await request(app)
      .patch('/api/account/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Account1234', newPassword: 'NoNumbers!' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/number/i);
  });

  it('returns 503 when database is not connected', async () => {
    const res = await request(app)
      .patch('/api/account/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Account1234', newPassword: 'NewPass9!' });
    expect(res.status).toBe(503);
  });
});

// ── Export ────────────────────────────────────────────────────────────────────
describe('GET /api/account/export', () => {
  let token;
  beforeAll(async () => { ({ token } = await makeUser('export')); });

  it('returns 503 when database is not connected', async () => {
    const res = await request(app)
      .get('/api/account/export')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(503);
  });
});

// ── Delete account ────────────────────────────────────────────────────────────
describe('DELETE /api/account', () => {
  let token;
  beforeAll(async () => { ({ token } = await makeUser('del')); });

  it('rejects missing password', async () => {
    const res = await request(app)
      .delete('/api/account')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.status).toBe(400);
  });

  it('returns 503 when database is not connected', async () => {
    const res = await request(app)
      .delete('/api/account')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'Account1234' });
    expect(res.status).toBe(503);
  });
});

// ── Password reset (in-memory) ────────────────────────────────────────────────
describe('POST /api/auth/forgot-password + reset-password', () => {
  const email = 'resetme@example.com';

  beforeAll(async () => {
    await request(app).post('/api/auth/register').send({
      username: 'resetuser',
      email,
      password: 'Original1',
    });
  });

  it('returns success even for unknown email (no user enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('issues a reset token (visible in test/dev mode)', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // In test/in-memory mode the token is returned so tests can use it
    expect(res.body).toHaveProperty('resetToken');
  });

  it('resets the password with a valid token then allows login', async () => {
    const forgot = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email });
    const { resetToken } = forgot.body;

    const reset = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: resetToken, newPassword: 'Changed9!' });
    expect(reset.status).toBe(200);
    expect(reset.body.success).toBe(true);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'resetuser', password: 'Changed9!' });
    expect(login.status).toBe(200);
    expect(login.body).toHaveProperty('token');
  });

  it('rejects reuse of the same reset token', async () => {
    const forgot = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email });
    const { resetToken } = forgot.body;

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: resetToken, newPassword: 'First9Use!' });

    // Second use of same token
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: resetToken, newPassword: 'Second9Use!' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid/unknown token', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'completely-made-up-token', newPassword: 'NewPass9!' });
    expect(res.status).toBe(400);
  });

  it('rejects weak new password during reset', async () => {
    const forgot = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email });
    const { resetToken } = forgot.body;

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: resetToken, newPassword: 'weak' });
    expect(res.status).toBe(400);
  });
});
