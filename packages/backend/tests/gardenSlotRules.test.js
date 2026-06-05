const {
  DEFAULT_PLAYER_GARDEN_SLOTS,
  NPC_HOMES,
  MAP_W,
  MAP_H,
  countGardenPlots,
  footprintsOverlap,
  filterNonOverlappingSlots,
  filterValidGardenSlots,
  isValidGardenCenter,
} = require('../src/utils/gardenSlotRules');
const { isGardenSuitableCenter } = require('../src/utils/worldBaseTerrain');

describe('gardenSlotRules', () => {
  it('default slots each have 9 on-map plots on grass', () => {
    DEFAULT_PLAYER_GARDEN_SLOTS.forEach((slot) => {
      expect(countGardenPlots(slot.x, slot.y)).toBe(9);
      expect(isGardenSuitableCenter(slot.x, slot.y)).toBe(true);
      expect(isValidGardenCenter(slot.x, slot.y)).toBe(true);
    });
  });

  it('NPC homes have 9 grass plots and do not overlap player slots', () => {
    NPC_HOMES.forEach((npc) => {
      expect(isGardenSuitableCenter(npc.x, npc.y)).toBe(true);
      DEFAULT_PLAYER_GARDEN_SLOTS.forEach((slot) => {
        expect(footprintsOverlap(npc, slot)).toBe(false);
      });
    });
  });

  it('default slots do not overlap each other', () => {
    for (let i = 0; i < DEFAULT_PLAYER_GARDEN_SLOTS.length; i += 1) {
      for (let j = i + 1; j < DEFAULT_PLAYER_GARDEN_SLOTS.length; j += 1) {
        expect(footprintsOverlap(DEFAULT_PLAYER_GARDEN_SLOTS[i], DEFAULT_PLAYER_GARDEN_SLOTS[j])).toBe(false);
      }
    }
  });

  it('rejects bottom-edge slots with fewer than 9 plots', () => {
    expect(isValidGardenCenter(11, 17)).toBe(false);
    expect(countGardenPlots(11, 17)).toBe(6);
  });

  it('rejects slots on water or mountains', () => {
    expect(isValidGardenCenter(25, 15)).toBe(false);
    expect(isValidGardenCenter(26, 9)).toBe(false);
  });

  it('filterNonOverlappingSlots drops overlapping custom slots', () => {
    const filtered = filterNonOverlappingSlots([
      { x: 2, y: 4 },
      { x: 2, y: 4 },
    ]);
    expect(filtered.length).toBe(1);
  });

  it('filterValidGardenSlots falls back to defaults when input is empty', () => {
    expect(filterValidGardenSlots([])).toEqual(DEFAULT_PLAYER_GARDEN_SLOTS);
  });

  it('keeps slots within map bounds', () => {
    filterValidGardenSlots(DEFAULT_PLAYER_GARDEN_SLOTS).forEach((slot) => {
      expect(slot.x).toBeGreaterThanOrEqual(0);
      expect(slot.y).toBeGreaterThanOrEqual(0);
      expect(slot.x).toBeLessThan(MAP_W);
      expect(slot.y).toBeLessThan(MAP_H);
    });
  });
});
