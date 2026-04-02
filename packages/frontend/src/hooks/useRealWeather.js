/**
 * useRealWeather — fetch real-world weather via the backend Open-Meteo proxy.
 *
 * Usage:
 *   const { weather, loading, error, requestLocation } = useRealWeather();
 *
 * Returns:
 *   weather: { temperature, windspeed, description, gameWeather, isDay, unit } | null
 *   loading: boolean
 *   error:   string | null
 *   requestLocation: () => void  — trigger geolocation + fetch
 *
 * `gameWeather` is one of: 'sunny' | 'cloudy' | 'rainy' | 'stormy' | 'windy'
 * and can be used to optionally sync in-game weather with real-world conditions.
 */
import { useState, useCallback } from 'react';

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export function useRealWeather() {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const fetchWeather = useCallback(async (lat, lon) => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`${BASE}/api/weather/current?lat=${lat}&lon=${lon}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Weather fetch failed');
      setWeather(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported by this browser');
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => fetchWeather(coords.latitude, coords.longitude),
      (err) => {
        setLoading(false);
        setError(err.message || 'Location permission denied');
      },
      { timeout: 8000 }
    );
  }, [fetchWeather]);

  return { weather, loading, error, requestLocation };
}

export default useRealWeather;
