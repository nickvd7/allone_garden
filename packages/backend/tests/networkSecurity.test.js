const {
  parseAllowedOrigins,
  buildCorsOriginValidator,
  parseTrustProxy,
} = require('../src/config/networkSecurity');

describe('networkSecurity config helpers', () => {
  describe('parseAllowedOrigins', () => {
    it('returns localhost fallback when env is empty', () => {
      expect(parseAllowedOrigins('')).toEqual(['http://localhost:3000']);
      expect(parseAllowedOrigins(undefined)).toEqual(['http://localhost:3000']);
    });

    it('parses comma-separated origins and deduplicates', () => {
      expect(parseAllowedOrigins('https://app.example.com, https://admin.example.com, https://app.example.com'))
        .toEqual(['https://app.example.com', 'https://admin.example.com']);
    });
  });

  describe('buildCorsOriginValidator', () => {
    it('allows configured browser origin', (done) => {
      const validator = buildCorsOriginValidator(['https://app.example.com']);
      validator('https://app.example.com', (err, ok) => {
        expect(err).toBeNull();
        expect(ok).toBe(true);
        done();
      });
    });

    it('allows requests without origin header', (done) => {
      const validator = buildCorsOriginValidator(['https://app.example.com']);
      validator(undefined, (err, ok) => {
        expect(err).toBeNull();
        expect(ok).toBe(true);
        done();
      });
    });

    it('rejects unknown origin', (done) => {
      const validator = buildCorsOriginValidator(['https://app.example.com']);
      validator('https://evil.example.com', (err, ok) => {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toMatch(/not allowed/i);
        expect(ok).toBeUndefined();
        done();
      });
    });
  });

  describe('parseTrustProxy', () => {
    it('defaults to 1 in production', () => {
      expect(parseTrustProxy('', 'production')).toBe(1);
    });

    it('defaults to false outside production', () => {
      expect(parseTrustProxy('', 'development')).toBe(false);
    });

    it('parses explicit numeric value', () => {
      expect(parseTrustProxy('2', 'production')).toBe(2);
    });

    it('parses explicit boolean value', () => {
      expect(parseTrustProxy('true', 'development')).toBe(true);
      expect(parseTrustProxy('false', 'production')).toBe(false);
    });
  });
});
