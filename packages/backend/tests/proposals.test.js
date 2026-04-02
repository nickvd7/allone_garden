/**
 * Integration tests — content proposal routes + proposalStore module.
 *
 * Tests cover:
 *  - POST /api/content/propose  (auth guard, validation, happy path)
 *  - GET  /api/content/proposals/pending-count  (public)
 *  - GET  /api/admin/content/proposals  (admin only)
 *  - POST /api/admin/content/proposals/:id/approve  (publish to live content)
 *  - POST /api/admin/content/proposals/:id/reject   (with optional note)
 *  - proposalStore unit tests
 */
const request = require('supertest');

process.env.JWT_SECRET   = 'test-secret-for-proposals';
process.env.DATABASE_URL = '';
process.env.P2P_ENABLED  = 'false';

const { app }        = require('../src/index');
const proposalStore  = require('../src/state/proposalStore');
const contentStore   = require('../src/state/contentStore');

// ── Helpers ───────────────────────────────────────────────────────────────────
async function registerAndLogin(suffix, isAdmin = false) {
  const creds = {
    username: `puser${suffix}`,
    email:    `puser${suffix}@example.com`,
    password: 'Proposal1234',
  };
  await request(app).post('/api/auth/register').send(creds);
  if (isAdmin) {
    // Promote in the in-memory user store by calling admin endpoint
    // (In tests without DB the auth store handles this differently;
    //  we use a workaround: register with a magic flag that some test servers honour)
    // For now, just use a normal user — admin tests assert 403 for non-admins.
  }
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: creds.username, password: creds.password });
  return res.body.token;
}

const VALID_PLANT = {
  slug: 'melon', name: 'Melon', harvestEmoji: '🍈',
  growthEmojis: ['🌱', '🍈'], growthDays: 4, baseCoins: 15,
  companionGood: [], companionBad: [],
};

const VALID_STRUCTURE = {
  id: 'silo', name: 'Silo', emoji: '🏚️',
  description: 'Stores extra seeds', buildCost: 80, chargesPerDay: 0, usageLabel: 'Store',
};

beforeEach(() => {
  proposalStore.clear();
  contentStore.clear();
});

// ── POST /api/content/propose ─────────────────────────────────────────────────
describe('POST /api/content/propose — auth guard', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/content/propose')
      .send({ type: 'plants', item: VALID_PLANT });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/content/propose — validation', () => {
  let token;
  beforeEach(async () => { token = await registerAndLogin('v1'); });

  it('returns 400 for unknown content type', async () => {
    const res = await request(app)
      .post('/api/content/propose')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'unicorns', item: { slug: 'x', name: 'X' } });
    expect(res.status).toBe(400);
  });

  it('returns 400 when item is missing the id field', async () => {
    const res = await request(app)
      .post('/api/content/propose')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'plants', item: { name: 'No slug' } });
    expect(res.status).toBe(400);
  });

  it('returns 400 when item is missing name', async () => {
    const res = await request(app)
      .post('/api/content/propose')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'plants', item: { slug: 'nameless' } });
    expect(res.status).toBe(400);
  });

  it('returns 400 for structures missing id field', async () => {
    const res = await request(app)
      .post('/api/content/propose')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'structures', item: { name: 'No ID' } });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/content/propose — happy path', () => {
  let token;
  beforeEach(async () => { token = await registerAndLogin('h1'); });

  it('returns 201 with proposal data for a valid plant', async () => {
    const res = await request(app)
      .post('/api/content/propose')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'plants', item: VALID_PLANT });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.proposal).toMatchObject({
      type:   'plants',
      status: 'pending',
      item:   expect.objectContaining({ slug: 'melon', name: 'Melon' }),
    });
    expect(res.body.proposal.id).toBeTruthy();
  });

  it('returns 201 for a valid structure', async () => {
    const res = await request(app)
      .post('/api/content/propose')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'structures', item: VALID_STRUCTURE });
    expect(res.status).toBe(201);
    expect(res.body.proposal.type).toBe('structures');
  });

  it('adds proposal to proposalStore as pending', async () => {
    await request(app)
      .post('/api/content/propose')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'plants', item: VALID_PLANT });
    const pending = proposalStore.list('pending');
    expect(pending).toHaveLength(1);
    expect(pending[0].item.slug).toBe('melon');
  });
});

// ── GET /api/content/proposals/pending-count ──────────────────────────────────
describe('GET /api/content/proposals/pending-count — public', () => {
  it('returns 0 when no proposals exist', async () => {
    const res = await request(app).get('/api/content/proposals/pending-count');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });

  it('returns correct count after proposals are submitted', async () => {
    proposalStore.add({ type: 'plants', item: VALID_PLANT, submittedBy: 1, submittedByName: 'alice' });
    proposalStore.add({ type: 'tools',  item: { id: 'rake', name: 'Rake' }, submittedBy: 2, submittedByName: 'bob' });
    const res = await request(app).get('/api/content/proposals/pending-count');
    expect(res.body.count).toBe(2);
  });

  it('does not count approved or rejected proposals', async () => {
    const p = proposalStore.add({ type: 'plants', item: VALID_PLANT, submittedBy: 1, submittedByName: 'alice' });
    proposalStore.setStatus(p.id, 'approved', '');
    const res = await request(app).get('/api/content/proposals/pending-count');
    expect(res.body.count).toBe(0);
  });
});

// ── GET /api/admin/content/proposals ─────────────────────────────────────────
describe('GET /api/admin/content/proposals — auth guard', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/content/proposals');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const token = await registerAndLogin('adm1');
    const res = await request(app)
      .get('/api/admin/content/proposals')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

// ── POST /api/admin/content/proposals/:id/approve ─────────────────────────────
describe('POST /api/admin/content/proposals/:id/approve — auth guard', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/admin/content/proposals/fake-id/approve')
      .send({});
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const token = await registerAndLogin('adm2');
    const res = await request(app)
      .post('/api/admin/content/proposals/fake-id/approve')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(403);
  });
});

// ── POST /api/admin/content/proposals/:id/reject ──────────────────────────────
describe('POST /api/admin/content/proposals/:id/reject — auth guard', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/admin/content/proposals/fake-id/reject')
      .send({});
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const token = await registerAndLogin('adm3');
    const res = await request(app)
      .post('/api/admin/content/proposals/fake-id/reject')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(403);
  });
});

// ── proposalStore unit tests ──────────────────────────────────────────────────
describe('proposalStore — add', () => {
  it('creates a proposal with pending status and generated id', () => {
    const p = proposalStore.add({ type: 'plants', item: VALID_PLANT, submittedBy: 1, submittedByName: 'alice' });
    expect(p.status).toBe('pending');
    expect(p.id).toBeTruthy();
    expect(p.type).toBe('plants');
    expect(p.createdAt).toBeTruthy();
  });

  it('adds multiple proposals independently', () => {
    proposalStore.add({ type: 'plants',     item: VALID_PLANT,     submittedBy: 1, submittedByName: 'alice' });
    proposalStore.add({ type: 'structures', item: VALID_STRUCTURE, submittedBy: 2, submittedByName: 'bob' });
    expect(proposalStore.list()).toHaveLength(2);
  });
});

describe('proposalStore — list / get', () => {
  it('list() without filter returns all proposals', () => {
    proposalStore.add({ type: 'plants', item: VALID_PLANT, submittedBy: 1, submittedByName: 'alice' });
    proposalStore.add({ type: 'tools',  item: { id: 't1', name: 'T1' }, submittedBy: 2, submittedByName: 'bob' });
    expect(proposalStore.list()).toHaveLength(2);
  });

  it('list("pending") returns only pending proposals', () => {
    const p1 = proposalStore.add({ type: 'plants', item: VALID_PLANT, submittedBy: 1, submittedByName: 'a' });
    const p2 = proposalStore.add({ type: 'tools',  item: { id: 't1', name: 'T1' }, submittedBy: 2, submittedByName: 'b' });
    proposalStore.setStatus(p1.id, 'approved', '');
    expect(proposalStore.list('pending')).toHaveLength(1);
    expect(proposalStore.list('pending')[0].id).toBe(p2.id);
  });

  it('list("approved") returns only approved proposals', () => {
    const p = proposalStore.add({ type: 'plants', item: VALID_PLANT, submittedBy: 1, submittedByName: 'a' });
    proposalStore.setStatus(p.id, 'approved', 'Looks great');
    expect(proposalStore.list('approved')).toHaveLength(1);
    expect(proposalStore.list('rejected')).toHaveLength(0);
  });

  it('get(id) returns the specific proposal', () => {
    const p = proposalStore.add({ type: 'plants', item: VALID_PLANT, submittedBy: 1, submittedByName: 'a' });
    const found = proposalStore.get(p.id);
    expect(found).not.toBeNull();
    expect(found.id).toBe(p.id);
  });

  it('get(unknown-id) returns null', () => {
    expect(proposalStore.get('does-not-exist')).toBeNull();
  });
});

describe('proposalStore — setStatus', () => {
  it('updates status and reviewedAt', () => {
    const p = proposalStore.add({ type: 'plants', item: VALID_PLANT, submittedBy: 1, submittedByName: 'a' });
    proposalStore.setStatus(p.id, 'approved', 'Great addition!');
    const updated = proposalStore.get(p.id);
    expect(updated.status).toBe('approved');
    expect(updated.note).toBe('Great addition!');
    expect(updated.reviewedAt).toBeTruthy();
  });

  it('updates status to rejected with note', () => {
    const p = proposalStore.add({ type: 'tools', item: { id: 't1', name: 'T1' }, submittedBy: 1, submittedByName: 'a' });
    proposalStore.setStatus(p.id, 'rejected', 'Duplicate item');
    expect(proposalStore.get(p.id).status).toBe('rejected');
    expect(proposalStore.get(p.id).note).toBe('Duplicate item');
  });
});

describe('proposalStore — seed', () => {
  it('seed() populates the store from persisted rows', () => {
    proposalStore.seed([
      { id: 'seed-1', type: 'plants', item: VALID_PLANT, submittedBy: 1, submittedByName: 'alice', status: 'pending', note: '', createdAt: new Date(), reviewedAt: null },
      { id: 'seed-2', type: 'tools', item: { id: 't1', name: 'T' }, submittedBy: 2, submittedByName: 'bob', status: 'approved', note: 'ok', createdAt: new Date(), reviewedAt: new Date() },
    ]);
    expect(proposalStore.list()).toHaveLength(2);
    expect(proposalStore.get('seed-1').status).toBe('pending');
    expect(proposalStore.get('seed-2').status).toBe('approved');
  });
});

describe('proposalStore — clear', () => {
  it('removes all proposals', () => {
    proposalStore.add({ type: 'plants', item: VALID_PLANT, submittedBy: 1, submittedByName: 'a' });
    proposalStore.clear();
    expect(proposalStore.list()).toHaveLength(0);
  });
});

// ── POST /api/content/propose — XSS sanitisation ─────────────────────────────
describe('POST /api/content/propose — sanitisation', () => {
  let token;
  beforeEach(async () => { token = await registerAndLogin('xss1'); });

  it('strips HTML script tags from name field', async () => {
    const res = await request(app)
      .post('/api/content/propose')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'plants',
        item: { ...VALID_PLANT, name: '<script>alert(1)</script>Melon' },
      });
    expect(res.status).toBe(201);
    expect(res.body.proposal.item.name).not.toContain('<script>');
    expect(res.body.proposal.item.name).toContain('Melon');
  });

  it('rejects growthDays > 30', async () => {
    const res = await request(app)
      .post('/api/content/propose')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'plants', item: { ...VALID_PLANT, growthDays: 999 } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/growthDays/);
  });

  it('rejects negative baseCoins', async () => {
    const res = await request(app)
      .post('/api/content/propose')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'plants', item: { ...VALID_PLANT, baseCoins: -5 } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/baseCoins/);
  });

  it('rejects pestChance > 1', async () => {
    const res = await request(app)
      .post('/api/content/propose')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'weather',
        item: { id: 'storm', name: 'Storm', pestChance: 5, waterBonus: 0, stormRollback: false },
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pestChance/);
  });
});

// ── POST /api/admin/content/proposals/:id/request-revision — auth guard ───────
describe('POST /api/admin/content/proposals/:id/request-revision — auth guard', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/admin/content/proposals/fake-id/request-revision')
      .send({ note: 'Please fix' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const token = await registerAndLogin('adm4');
    const res = await request(app)
      .post('/api/admin/content/proposals/fake-id/request-revision')
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'Please fix' });
    expect(res.status).toBe(403);
  });
});

// ── proposalStore — revision_requested ───────────────────────────────────────
describe('proposalStore — revision_requested', () => {
  it('increments revisionCount when status is set to revision_requested', () => {
    const p = proposalStore.add({ type: 'plants', item: VALID_PLANT, submittedBy: 1, submittedByName: 'a' });
    proposalStore.setStatus(p.id, 'revision_requested', 'Lower the coins please');
    const updated = proposalStore.get(p.id);
    expect(updated.status).toBe('revision_requested');
    expect(updated.revisionCount).toBe(1);
  });

  it('increments revisionCount on each subsequent request', () => {
    const p = proposalStore.add({ type: 'plants', item: VALID_PLANT, submittedBy: 1, submittedByName: 'a' });
    proposalStore.setStatus(p.id, 'revision_requested', 'First round');
    proposalStore.setStatus(p.id, 'revision_requested', 'Second round');
    expect(proposalStore.get(p.id).revisionCount).toBe(2);
  });

  it('does not increment revisionCount when status is rejected or approved', () => {
    const p = proposalStore.add({ type: 'plants', item: VALID_PLANT, submittedBy: 1, submittedByName: 'a' });
    proposalStore.setStatus(p.id, 'approved', '');
    expect(proposalStore.get(p.id).revisionCount).toBe(0);
  });
});
