/**
 * Leaderboard + season history (in-memory mode: no DB).
 */
const request = require('supertest');

process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.DATABASE_URL = '';
process.env.P2P_ENABLED = 'false';

const { app } = require('../src/index');

describe('GET /api/leaderboard — in-memory', () => {
  it('returns JSON array', async () => {
    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('accepts season=spring', async () => {
    const res = await request(app).get('/api/leaderboard?season=spring&by=xp');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects invalid season', async () => {
    const res = await request(app).get('/api/leaderboard?season=monsoon');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/leaderboard/history — no DB', () => {
  it('returns empty array for history list', async () => {
    const res = await request(app).get('/api/leaderboard/history?season=spring&by=xp');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns empty cycles', async () => {
    const res = await request(app).get('/api/leaderboard/history/cycles');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ cycles: [] });
  });

  it('returns 400 without season', async () => {
    const res = await request(app).get('/api/leaderboard/history?by=xp');
    expect(res.status).toBe(400);
  });
});
