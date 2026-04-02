/**
 * @allone-garden/core — Weather system
 *
 * Deterministic weather rolling, season effects, and WMO → game-weather mapping.
 *
 * MIT License
 */

'use strict';

/** All possible in-game weather types */
const WEATHER_TYPES = ['sunny', 'cloudy', 'rainy', 'windy', 'storm', 'drought'];

/**
 * Roll next-day weather given a random value in [0, 1).
 *
 * @param {number} roll      — pre-generated random value (inject for testability)
 * @param {string} [season]  — 'spring'|'summer'|'autumn'|'winter' (future: affects probabilities)
 * @returns {string} weather type
 */
function rollWeather(roll, season) {
  // 10% storm, 10% drought, 80% normal
  if (roll < 0.10) return 'storm';
  if (roll < 0.20) return 'drought';
  const normal = ['sunny', 'cloudy', 'rainy', 'windy'];
  return normal[Math.floor((roll - 0.20) / 0.80 * normal.length)];
}

/**
 * Map an Open-Meteo WMO weather code to an in-game weather type.
 * @param {number} wmoCode
 * @returns {string}
 */
function wmoToGameWeather(wmoCode) {
  if (wmoCode === 0 || wmoCode === 1)           return 'sunny';
  if (wmoCode === 2 || wmoCode === 3)           return 'cloudy';
  if (wmoCode >= 45 && wmoCode <= 48)           return 'cloudy';
  if (wmoCode >= 51 && wmoCode <= 67)           return 'rainy';
  if (wmoCode >= 71 && wmoCode <= 77)           return 'windy';
  if (wmoCode >= 80 && wmoCode <= 82)           return 'rainy';
  if (wmoCode >= 85 && wmoCode <= 86)           return 'windy';
  if (wmoCode === 95 || wmoCode >= 96)          return 'storm';
  return 'sunny';
}

/**
 * Determine the season from a day number (1-indexed, 28 days per season).
 * @param {number} day
 * @returns {'spring'|'summer'|'autumn'|'winter'}
 */
function seasonFromDay(day) {
  const seasons = ['spring', 'summer', 'autumn', 'winter'];
  return seasons[Math.floor(((day - 1) % 112) / 28)];
}

module.exports = { WEATHER_TYPES, rollWeather, wmoToGameWeather, seasonFromDay };
