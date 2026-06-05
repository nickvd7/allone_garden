const {
  hasDailyContent,
  hasWeeklyContent,
} = require('../src/services/digestService');
const { sanitizeStats, levelFromXp } = require('../src/lib/playerStats');
const { activityDigest, weeklyDigest } = require('../src/services/emailTemplates');

describe('playerStats', () => {
  it('computes level from xp', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
  });

  it('sanitizes stats within bounds', () => {
    expect(sanitizeStats({ xp: 500, coins: 120, plantsGrown: 3 })).toEqual({
      xp: 500,
      coins: 120,
      plantsGrown: 3,
      level: 3,
    });
  });

  it('rejects invalid input', () => {
    expect(sanitizeStats(null)).toBeNull();
    expect(sanitizeStats({ xp: -5 })).toMatchObject({ xp: 0 });
  });
});

describe('digest content rules', () => {
  it('daily digest when messages, proposals or trades exist', () => {
    expect(hasDailyContent({ dmCount: 0, groupCount: 0 })).toBe(false);
    expect(hasDailyContent({ dmCount: 1, groupCount: 0 })).toBe(true);
    expect(hasDailyContent({ dmCount: 0, groupCount: 0, pendingProposals: 1 })).toBe(true);
    expect(hasDailyContent({ dmCount: 0, groupCount: 0, tradesSold: 1 })).toBe(true);
    expect(hasDailyContent({ dmCount: 0, groupCount: 0, wikiRevisions: 1 })).toBe(true);
  });

  it('weekly digest when active with stats or messages', () => {
    expect(hasWeeklyContent({
      dmCount: 0, groupCount: 0, pendingProposals: 0,
      activeThisWeek: false, xp: 100, plantsGrown: 2, currentDay: 5,
    })).toBe(false);
    expect(hasWeeklyContent({
      dmCount: 1, groupCount: 0, pendingProposals: 0,
      activeThisWeek: false, xp: 0, plantsGrown: 0, currentDay: 1,
    })).toBe(true);
    expect(hasWeeklyContent({
      dmCount: 0, groupCount: 0, pendingProposals: 0,
      activeThisWeek: true, xp: 50, plantsGrown: 0, currentDay: 3,
    })).toBe(true);
  });
});

describe('activityDigest email template', () => {
  it('includes message and trade counts', () => {
    const mail = activityDigest({
      username: 'Barbara',
      dmCount: 2,
      groupCount: 1,
      pendingTradeProposals: 1,
      pendingCollaborateProposals: 1,
      appUrl: 'https://allone.garden',
      lang: 'nl',
    });
    expect(mail.subject).toMatch(/meldingen/i);
    expect(mail.text).toContain('2 nieuwe directe berichten');
    expect(mail.text).toContain('1 nieuw ruilvoorstel');
    expect(mail.text).toContain('1 samenwerkverzoek');
  });
});

describe('weeklyDigest email template', () => {
  it('includes garden stats and season', () => {
    const mail = weeklyDigest({
      username: 'Barbara',
      level: 3,
      xp: 450,
      coins: 120,
      plantsGrown: 8,
      currentDay: 14,
      seasonKey: 'spring',
      dmCount: 2,
      groupCount: 0,
      pendingProposals: 1,
      appUrl: 'https://allone.garden',
      lang: 'nl',
    });
    expect(mail.subject).toMatch(/weekoverzicht/i);
    expect(mail.text).toContain('Level 3');
    expect(mail.text).toContain('lente');
    expect(mail.text).toContain('2 berichten ontvangen');
  });
});
