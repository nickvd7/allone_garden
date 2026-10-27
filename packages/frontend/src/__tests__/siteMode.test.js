import { isHomepageOnlySite, publicSitePath, PUBLIC_CONTACT_EMAIL } from '../siteMode';

describe('siteMode', () => {
  it('uses mail@030.dev as the public login contact', () => {
    expect(PUBLIC_CONTACT_EMAIL).toBe('mail@030.dev');
  });

  it('keeps a normal self-hosted host on the full game', () => {
    expect(isHomepageOnlySite('localhost', '')).toBe(false);
    expect(isHomepageOnlySite('garden.example.com', undefined)).toBe(false);
  });

  it('publishes only the homepage on the Cloudflare hosts', () => {
    expect(isHomepageOnlySite('allone.garden', '')).toBe(true);
    expect(isHomepageOnlySite('www.allone.garden', '')).toBe(true);
    expect(isHomepageOnlySite('allone.pages.dev', '')).toBe(true);
  });

  it('lets an explicit flag override the hostname', () => {
    expect(isHomepageOnlySite('allone.garden', 'false')).toBe(false);
    expect(isHomepageOnlySite('localhost', 'true')).toBe(true);
  });

  it('sends login and register to the construction screen', () => {
    expect(publicSitePath('/')).toBe('home');
    expect(publicSitePath('/home')).toBe('home');
    expect(publicSitePath('/login')).toBe('auth');
    expect(publicSitePath('/register')).toBe('auth');
    expect(publicSitePath('/plugins')).toBe('other');
  });
});
