/**
 * Public Cloudflare host keeps /api/health up and pauses the rest of the API.
 */
const request = require('supertest');

process.env.JWT_SECRET = 'test-secret-for-jest-0123456789-very-long';
process.env.DATABASE_URL = '';
process.env.P2P_ENABLED = 'false';
delete process.env.PUBLIC_SITE_MAINTENANCE;

const { app } = require('../src/index');
const { publicMaintenanceActive, PUBLIC_CONTACT_EMAIL } = require('../src/config/publicMaintenance');

describe('public site maintenance', () => {
  afterEach(() => {
    delete process.env.PUBLIC_SITE_MAINTENANCE;
  });

  it('pauses the API on allone.garden and names mail@030.dev', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Host', 'allone.garden')
      .send({ username: 'someone', password: 'Password1' });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Under construction');
    expect(res.body.contact).toBe('mail@030.dev');
    expect(PUBLIC_CONTACT_EMAIL).toBe('mail@030.dev');
  });

  it('still answers the deploy health check on the public host', async () => {
    const res = await request(app).get('/api/health').set('Host', 'www.allone.garden');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('leaves self-hosted hosts alone unless the flag is forced on', async () => {
    const open = await request(app).post('/api/auth/login').send({});
    expect(open.status).not.toBe(503);

    process.env.PUBLIC_SITE_MAINTENANCE = 'true';
    const paused = await request(app)
      .post('/api/auth/register')
      .set('Host', 'localhost')
      .send({});
    expect(paused.status).toBe(503);

    process.env.PUBLIC_SITE_MAINTENANCE = 'false';
    expect(publicMaintenanceActive('allone.garden')).toBe(false);
  });
});
