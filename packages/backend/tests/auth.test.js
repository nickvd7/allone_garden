/**
 * Integration tests — authentication routes.
 *
 * Uses supertest + in-memory mode (no DATABASE_URL set) so they
 * run without any external dependencies.
 */
const request = require('supertest');

// Ensure in-memory mode (no real DB)
process.env.JWT_SECRET    = 'test-secret-for-jest';
process.env.DATABASE_URL  = '';
process.env.P2P_ENABLED   = 'false';

const { app } = require('../src/index');

describe('POST /api/auth/register', () => {
  it('rejects missing fields', async () => {
    const res = await request(app).post('/api/auth/register').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects short username', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'ab',
      email: 'ab@example.com',
      password: 'Password1',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/username/i);
  });

  it('rejects weak password (no number)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'validuser',
      email: 'valid@example.com',
      password: 'NoNumbers!',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/number/i);
  });

  it('registers a new user successfully', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'testuser',
      email: 'testuser@example.com',
      password: 'Secure1234',
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.username).toBe('testuser');
  });

  it('rejects duplicate username', async () => {
    await request(app).post('/api/auth/register').send({
      username: 'dupuser',
      email: 'dup1@example.com',
      password: 'Secure1234',
    });
    const res = await request(app).post('/api/auth/register').send({
      username: 'dupuser',
      email: 'dup2@example.com',
      password: 'Secure1234',
    });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  const credentials = { username: 'logintest', email: 'login@example.com', password: 'Login1234' };

  beforeAll(() =>
    request(app).post('/api/auth/register').send(credentials)
  );

  it('returns token on valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      username: credentials.username,
      password: credentials.password,
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('rejects wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      username: credentials.username,
      password: 'WrongPass1',
    });
    expect(res.status).toBe(401);
  });

  it('rejects non-existent user with same timing (no info leak)', async () => {
    const res = await request(app).post('/api/auth/login').send({
      username: 'ghostuser',
      password: 'Anything1',
    });
    // Should return 401, not 404 — do not reveal whether the account exists
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  let token;

  beforeAll(async () => {
    await request(app).post('/api/auth/register').send({
      username: 'meuser', email: 'me@example.com', password: 'MePass123',
    });
    const login = await request(app).post('/api/auth/login').send({
      username: 'meuser', password: 'MePass123',
    });
    token = login.body.token;
  });

  it('returns user when authenticated', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('meuser');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with tampered token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer tampered.jwt.token');
    expect(res.status).toBe(401);
  });
});
