/**
 * @allone-garden/core
 *
 * MIT-licensed game logic for AllOne Garden.
 * Safe to use in mods, forks, plugins, and community tools.
 *
 * The private server/client code (authentication, database, networking) lives
 * in packages/backend and packages/frontend — those remain proprietary.
 * This package contains only the pure, framework-agnostic game rules.
 */

'use strict';

const plants     = require('./plants');
const growth     = require('./growth');
const weather    = require('./weather');
const companions = require('./companions');

module.exports = {
  // Plants
  PLANTS:          plants.PLANTS,
  PLANTS_BY_SLUG:  plants.PLANTS_BY_SLUG,
  getPlant:        plants.getPlant,

  // Growth
  getGrowthStage:  growth.getGrowthStage,
  dailyGrowthDelta: growth.dailyGrowthDelta,
  dailyWaterLevel: growth.dailyWaterLevel,
  pestChance:      growth.pestChance,

  // Weather
  WEATHER_TYPES:   weather.WEATHER_TYPES,
  rollWeather:     weather.rollWeather,
  wmoToGameWeather: weather.wmoToGameWeather,
  seasonFromDay:   weather.seasonFromDay,

  // Companions
  getCompanionEffect:  companions.getCompanionEffect,
  getNeighbourIndices: companions.getNeighbourIndices,
};
