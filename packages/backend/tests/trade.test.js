/**
 * Integration tests — trade / marketplace routes.
 *
 * Runs in in-memory mode (no DATABASE_URL).
 */
const request = require('supertest');

process.env.JWT_SECRET    = 'test-secret-for-jest';
process.env.DATABASE_URL  = '';
process.env.P2P_ENABLED   = 'false';

const { app } = require('../src/index');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function registerAndLogin(username) {
  await request(app).post('/api/auth/register').send({
    username,
    email: `${username}@example.com`,
    password: 'Trade1234',
  });
  const res = await request(app).post('/api/auth/login').send({
    username,
    password: 'Trade1234',
  });
  return res.body.token;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/trade/listings', () => {
  it('returns an array (even when empty)', async () => {
    const res = await request(app).get('/api/trade/listings');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/trade/listings', () => {
  let token;

  beforeAll(async () => {
    token = await registerAndLogin('seller1');
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/trade/listings').send({
      cropId: 'tomato', quantity: 5, pricePerUnit: 10,
    });
    expect(res.status).toBe(401);
  });

  it('rejects negative quantity', async () => {
    const res = await request(app)
      .post('/api/trade/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ cropId: 'tomato', quantity: -1, pricePerUnit: 10 });
    expect(res.status).toBe(400);
  });

  it('rejects zero pricePerUnit', async () => {
    const res = await request(app)
      .post('/api/trade/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ cropId: 'tomato', quantity: 5, pricePerUnit: 0 });
    expect(res.status).toBe(400);
  });

  it('creates a listing in in-memory mode', async () => {
    const res = await request(app)
      .post('/api/trade/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ cropId: 'tomato', quantity: 5, pricePerUnit: 10 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ cropId: 'tomato', quantity: 5, pricePerUnit: 10 });
    expect(res.body.id).toBeDefined();
  });
});

describe('POST /api/trade/buy/:listingId', () => {
  let sellerToken, buyerToken, listingId;

  beforeAll(async () => {
    sellerToken = await registerAndLogin('seller2');
    buyerToken  = await registerAndLogin('buyer2');

    // Seller creates a listing
    const res = await request(app)
      .post('/api/trade/listings')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ cropId: 'carrot', quantity: 10, pricePerUnit: 5 });
    listingId = res.body.id;
  });

  it('requires authentication', async () => {
    const res = await request(app).post(`/api/trade/buy/${listingId}`).send({ quantity: 1 });
    expect(res.status).toBe(401);
  });

  it('prevents seller from buying own listing', async () => {
    const res = await request(app)
      .post(`/api/trade/buy/${listingId}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ quantity: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/own/i);
  });

  it('rejects buying more than available', async () => {
    const res = await request(app)
      .post(`/api/trade/buy/${listingId}`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ quantity: 999 });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent listing', async () => {
    const res = await request(app)
      .post('/api/trade/buy/99999')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ quantity: 1 });
    expect(res.status).toBe(404);
  });

  it('completes a valid purchase', async () => {
    const res = await request(app)
      .post(`/api/trade/buy/${listingId}`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ quantity: 2 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.quantity).toBe(2);
  });
});

describe('DELETE /api/trade/listings/:listingId', () => {
  let token, otherToken, listingId;

  beforeAll(async () => {
    token      = await registerAndLogin('canceller');
    otherToken = await registerAndLogin('other');

    const res = await request(app)
      .post('/api/trade/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ cropId: 'lettuce', quantity: 3, pricePerUnit: 2 });
    listingId = res.body.id;
  });

  it('prevents deleting someone else\'s listing', async () => {
    const res = await request(app)
      .delete(`/api/trade/listings/${listingId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });

  it('allows owner to cancel listing', async () => {
    const res = await request(app)
      .delete(`/api/trade/listings/${listingId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
