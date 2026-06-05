const {
  normalizeLang,
  passwordReset,
  welcome,
  accountCreated,
  usernameReminder,
} = require('../src/services/emailTemplates');

describe('emailTemplates', () => {
  it('normalizes language codes', () => {
    expect(normalizeLang('nl-NL')).toBe('nl');
    expect(normalizeLang('en')).toBe('en');
    expect(normalizeLang('xx')).toBe('en');
  });

  it('renders Dutch password reset', () => {
    const mail = passwordReset({
      username: 'nick',
      resetUrl: 'https://example.com/reset?token=abc',
      lang: 'nl',
    });
    expect(mail.subject).toMatch(/Wachtwoord/i);
    expect(mail.text).toContain('nick');
    expect(mail.html).toContain('https://example.com/reset?token=abc');
  });

  it('renders English welcome', () => {
    const mail = welcome({ username: 'alice', appUrl: 'https://garden.test', lang: 'en' });
    expect(mail.subject).toMatch(/Welcome/i);
    expect(mail.text).toContain('alice');
  });

  it('renders username reminder', () => {
    const mail = usernameReminder({
      username: 'alice',
      appUrl: 'https://garden.test',
      lang: 'nl',
    });
    expect(mail.subject).toMatch(/gebruikersnaam/i);
    expect(mail.text).toContain('alice');
  });

  it('renders account created by admin', () => {
    const mail = accountCreated({
      username: 'bob',
      email: 'bob@test.com',
      resetUrl: 'https://garden.test/reset',
      createdByAdmin: true,
      lang: 'nl',
    });
    expect(mail.subject).toMatch(/aangemaakt/i);
    expect(mail.html).toContain('bob@test.com');
  });
});
