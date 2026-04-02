/**
 * GameContentContext — provides dynamic game content to all components.
 *
 * On mount the provider fetches GET /api/content (which returns the full
 * merged set of plants, structures, tools, and weather) and stores it in
 * context.  Components consume it via the useGameContent() hook.
 *
 * Falls back to local defaultContent if the server is unreachable.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../hooks/useApi';
import {
  PLANTS, STRUCTURES, TOOLS, WEATHER,
  buildGrowthStages, buildCropCoins, buildPlantEmojis, buildCompanions,
} from '../data/defaultContent';

// ── Default (fallback) derived tables ─────────────────────────────────────────
const DEFAULT_CONTENT = {
  plants:     PLANTS,
  structures: STRUCTURES,
  tools:      TOOLS,
  weather:    WEATHER,
  // Pre-computed lookups (re-built whenever plants change)
  growthStages: buildGrowthStages(PLANTS),
  cropCoins:    buildCropCoins(PLANTS),
  plantEmojis:  buildPlantEmojis(PLANTS),
  companions:   buildCompanions(PLANTS),
};

const GameContentContext = createContext(DEFAULT_CONTENT);

// ── Provider ──────────────────────────────────────────────────────────────────
export function GameContentProvider({ children }) {
  const [content, setContent] = useState(DEFAULT_CONTENT);

  useEffect(() => {
    api.get('/api/content')
      .then((data) => {
        if (!data) return;
        const plants     = data.plants     || PLANTS;
        const structures = data.structures || STRUCTURES;
        const tools      = data.tools      || TOOLS;
        const weather    = data.weather    || WEATHER;

        setContent({
          plants,
          structures,
          tools,
          weather,
          // Rebuild derived lookup tables
          growthStages: buildGrowthStages(plants),
          cropCoins:    buildCropCoins(plants),
          plantEmojis:  buildPlantEmojis(plants),
          companions:   buildCompanions(plants),
        });
      })
      .catch(() => {
        // Network error — keep defaults, silently swallow
      });
  }, []);

  return (
    <GameContentContext.Provider value={content}>
      {children}
    </GameContentContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useGameContent() {
  return useContext(GameContentContext);
}

export default GameContentContext;
