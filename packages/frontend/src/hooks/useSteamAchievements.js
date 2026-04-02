/**
 * useSteamAchievements — thin wrapper around window.electronAPI.steamUnlockAchievement.
 *
 * Safe to call in any environment:
 *  - Outside Electron     → no-op
 *  - Electron, no Steam   → no-op (steamworks.js not available / Steam not running)
 *  - Electron + Steam     → unlocks the achievement via Steamworks SDK
 *
 * Achievement API names (must match your Steamworks dashboard exactly):
 *
 *   FIRST_HARVEST    — harvest the first crop
 *   GREEN_THUMB      — grow 10 plants total
 *   SEASONED_FARMER  — grow 50 plants total
 *   MASTER_GARDENER  — grow 100 plants total
 *   FIRST_SALE       — sell a crop for the first time
 *   BARN_BUILT       — build the barn
 *   GREENHOUSE_BUILT — build the greenhouse
 *   EGG_COLLECTOR    — collect eggs from the chicken coop
 *   MILK_COLLECTOR   — collect milk from the stable
 *   PLANT_ID         — identify a plant using photo recognition
 *   LEVEL_5          — reach player level 5
 *   LEVEL_10         — reach player level 10
 *
 * Usage:
 *   const { unlock } = useSteamAchievements();
 *   unlock('FIRST_HARVEST');
 */
import { useCallback } from 'react';

export function useSteamAchievements() {
  const unlock = useCallback((apiName) => {
    const api = window.electronAPI;
    if (!api?.steamUnlockAchievement) return;
    // Fire-and-forget — achievements are idempotent on Steam
    api.steamUnlockAchievement(apiName).catch(() => {});
  }, []);

  return { unlock };
}
