'use strict';

const {
  assertSafeRemoteUrl,
  _hostMatchesAllowlist,
  _isHostnameAllowed,
} = require('../src/utils/pluginUrlSecurity');

describe('pluginUrlSecurity allowlist', () => {
  const orig = process.env.PLUGIN_DOWNLOAD_ALLOWED_HOSTS;

  afterEach(() => {
    if (orig === undefined) delete process.env.PLUGIN_DOWNLOAD_ALLOWED_HOSTS;
    else process.env.PLUGIN_DOWNLOAD_ALLOWED_HOSTS = orig;
  });

  it('matches exact hosts', () => {
    expect(_hostMatchesAllowlist('raw.githubusercontent.com', ['raw.githubusercontent.com'])).toBe(
      true
    );
    expect(_hostMatchesAllowlist('evil.com', ['raw.githubusercontent.com'])).toBe(false);
  });

  it('matches wildcard *.suffix hosts', () => {
    expect(_hostMatchesAllowlist('foo.bar.cdn.com', ['*.bar.cdn.com'])).toBe(true);
    expect(_hostMatchesAllowlist('bar.cdn.com', ['*.bar.cdn.com'])).toBe(true);
  });

  it('uses default GitHub-related hosts when env is unset', () => {
    delete process.env.PLUGIN_DOWNLOAD_ALLOWED_HOSTS;
    expect(_isHostnameAllowed('raw.githubusercontent.com')).toBe(true);
    expect(_isHostnameAllowed('evil.example')).toBe(false);
  });
});

describe('assertSafeRemoteUrl', () => {
  it('rejects http', async () => {
    await expect(assertSafeRemoteUrl('http://raw.githubusercontent.com/x')).rejects.toThrow(/https/i);
  });

  it('rejects loopback IPv4 literal', async () => {
    await expect(assertSafeRemoteUrl('https://127.0.0.1/path')).rejects.toThrow();
  });

  it('rejects URLs with credentials', async () => {
    await expect(
      assertSafeRemoteUrl('https://user:pass@raw.githubusercontent.com/foo')
    ).rejects.toThrow(/credentials/i);
  });
});
