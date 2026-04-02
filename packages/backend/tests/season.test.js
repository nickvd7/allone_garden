const { seasonIndexFromDay, seasonBoundariesCrossed } = require('../src/utils/season');

describe('utils/season', () => {
  it('seasonIndexFromDay groups 28-day blocks in a 112-day year', () => {
    expect(seasonIndexFromDay(1)).toBe(0);
    expect(seasonIndexFromDay(28)).toBe(0);
    expect(seasonIndexFromDay(29)).toBe(1);
    expect(seasonIndexFromDay(112)).toBe(3);
    expect(seasonIndexFromDay(113)).toBe(0);
  });

  it('seasonBoundariesCrossed detects one boundary (spring → summer)', () => {
    const b = seasonBoundariesCrossed(28, 29);
    expect(b).toEqual([{ cycle: 0, season_index: 0 }]);
  });

  it('seasonBoundariesCrossed detects year rollover', () => {
    const b = seasonBoundariesCrossed(112, 113);
    expect(b.some((x) => x.season_index === 3 && x.cycle === 0)).toBe(true);
  });

  it('returns empty when day does not advance', () => {
    expect(seasonBoundariesCrossed(10, 10)).toEqual([]);
    expect(seasonBoundariesCrossed(30, 10)).toEqual([]);
  });
});
