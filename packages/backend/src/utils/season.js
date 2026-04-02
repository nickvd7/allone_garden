/**
 * In-game season from garden day (112-day year, 4×28 days) — matches client core/weather.
 */

function seasonIndexFromDay(day) {
  const d = Math.max(1, Number(day) || 1);
  return Math.floor(((d - 1) % 112) / 28);
}

/**
 * Each step from oldDay+1..newDay: if season or year-cycle changes, the previous season closed.
 * @returns {Array<{ cycle: number, season_index: number }>}
 */
function seasonBoundariesCrossed(oldDay, newDay) {
  const out = [];
  if (newDay <= oldDay) return out;
  for (let d = oldDay + 1; d <= newDay; d++) {
    const prevSeason = seasonIndexFromDay(d - 1);
    const prevCycle = Math.floor((d - 2) / 112);
    const currSeason = seasonIndexFromDay(d);
    const currCycle = Math.floor((d - 1) / 112);
    if (prevSeason !== currSeason || prevCycle !== currCycle) {
      out.push({
        cycle:         Math.floor((d - 2) / 112),
        season_index:  seasonIndexFromDay(d - 1),
      });
    }
  }
  return out;
}

module.exports = { seasonIndexFromDay, seasonBoundariesCrossed };
