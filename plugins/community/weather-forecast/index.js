/**
 * Community plugin: weather-forecast
 * Generates a 5-day weather forecast whenever the day changes.
 * Broadcasts it to all connected clients via Socket.IO.
 *
 * License: MIT
 * Author: AllOne Garden Community
 */

const WEATHERS = ['sunny', 'cloudy', 'rainy', 'windy'];
const WEIGHTS   = [0.40,    0.30,    0.20,   0.10];   // probability per type

function weightedRandom(options, weights) {
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < options.length; i++) {
    cumulative += weights[i];
    if (r < cumulative) return options[i];
  }
  return options[options.length - 1];
}

function generateForecast(days = 5) {
  return Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    weather: weightedRandom(WEATHERS, WEIGHTS),
  }));
}

module.exports = {
  name: 'weather-forecast',
  version: '1.0.0',

  init(api) {
    api.log('Weather forecast plugin initialised');

    let currentForecast = generateForecast();

    // Regenerate forecast each day and broadcast to all clients
    api.on('onDayChange', ({ currentDay }) => {
      // Shift the forecast forward (consume day 1, append a new day at the end)
      currentForecast.shift();
      currentForecast.push({
        day: currentForecast.length + 1,
        weather: weightedRandom(WEATHERS, WEIGHTS),
      });

      // Re-number days relative to today
      const forecast = currentForecast.map((f, i) => ({
        day: currentDay + i + 1,
        weather: f.weather,
      }));

      api.broadcast('weather-forecast:update', { currentDay, forecast });
      api.log(`Forecast for day ${currentDay}: ${forecast.map((f) => f.weather).join(', ')}`);
    });

    // Serve the current forecast to any client that requests it
    // (client emits plugin:weather-forecast:request via socket)
    api.on('plugin:weather-forecast:request', ({ socket, currentDay }) => {
      const forecast = currentForecast.map((f, i) => ({
        day: currentDay + i + 1,
        weather: f.weather,
      }));
      api.sendTo(socket.id, 'weather-forecast:data', { forecast });
    });
  },
};
