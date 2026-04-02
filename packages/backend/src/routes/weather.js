/**
 * Weather routes — real-world weather via Open-Meteo (free, no API key needed).
 *
 * GET /api/weather/current?lat=52.37&lon=4.90
 *   Returns current conditions: temperature, description, WMO code, and a
 *   suggested in-game weather type that maps to the garden's weather system.
 */
const express = require('express');
const router  = express.Router();
const fetch   = require('node-fetch');

// ── WMO weather code → human-readable + in-game mapping ──────────────────────
// Full WMO table: https://open-meteo.com/en/docs#weathervariables
const WMO_MAP = {
  0:  { label: 'Clear sky',           game: 'sunny' },
  1:  { label: 'Mainly clear',        game: 'sunny' },
  2:  { label: 'Partly cloudy',       game: 'cloudy' },
  3:  { label: 'Overcast',            game: 'cloudy' },
  45: { label: 'Fog',                 game: 'cloudy' },
  48: { label: 'Depositing rime fog', game: 'cloudy' },
  51: { label: 'Light drizzle',       game: 'rainy' },
  53: { label: 'Moderate drizzle',    game: 'rainy' },
  55: { label: 'Dense drizzle',       game: 'rainy' },
  61: { label: 'Slight rain',         game: 'rainy' },
  63: { label: 'Moderate rain',       game: 'rainy' },
  65: { label: 'Heavy rain',          game: 'rainy' },
  71: { label: 'Slight snow',         game: 'windy' },
  73: { label: 'Moderate snow',       game: 'windy' },
  75: { label: 'Heavy snow',          game: 'windy' },
  77: { label: 'Snow grains',         game: 'windy' },
  80: { label: 'Slight showers',      game: 'rainy' },
  81: { label: 'Moderate showers',    game: 'rainy' },
  82: { label: 'Violent showers',     game: 'stormy' },
  85: { label: 'Slight snow showers', game: 'windy' },
  86: { label: 'Heavy snow showers',  game: 'windy' },
  95: { label: 'Thunderstorm',        game: 'stormy' },
  96: { label: 'Thunderstorm w/ hail', game: 'stormy' },
  99: { label: 'Thunderstorm w/ heavy hail', game: 'stormy' },
};

// Simple in-memory cache: avoid hammering Open-Meteo on every request
const cache = new Map(); // key: "lat,lon" → { data, expires }
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ── GET /api/weather/current ──────────────────────────────────────────────────
router.get('/current', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'lat and lon query params required (e.g. ?lat=52.37&lon=4.90)' });
  }

  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    return res.json({ ...cached.data, cached: true });
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast`
      + `?latitude=${lat}&longitude=${lon}`
      + `&current_weather=true`
      + `&hourly=relative_humidity_2m`
      + `&forecast_days=1`;

    const upstream = await fetch(url, { timeout: 5000 });
    if (!upstream.ok) {
      return res.status(502).json({ error: 'Open-Meteo unavailable', status: upstream.status });
    }

    const json = await upstream.json();
    const cw   = json.current_weather;
    const wmo  = WMO_MAP[cw.weathercode] || { label: 'Unknown', game: 'sunny' };

    const data = {
      temperature:    cw.temperature,
      windspeed:      cw.windspeed,
      weathercode:    cw.weathercode,
      description:    wmo.label,
      gameWeather:    wmo.game,   // maps to garden weather types
      isDay:          cw.is_day === 1,
      unit:           json.current_weather_units?.temperature || '°C',
    };

    cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
    return res.json({ ...data, cached: false });
  } catch (err) {
    return res.status(503).json({ error: 'Could not fetch weather data', detail: err.message });
  }
});

module.exports = router;
