import React from 'react';
import { useGameContent } from '../context/GameContentContext';

// Static built-in structure definitions — exported for backward compatibility
export const STRUCTURE_DEFS = [
  {
    id: 'well',
    name: 'Water Well',
    emoji: '🪣',
    description: 'Water all tilled plots at once. 3 charges per day.',
    buildCost: 50,
    chargesPerDay: 3,
    usageLabel: 'Draw Water',
  },
  {
    id: 'compost',
    name: 'Compost Heap',
    emoji: '🌿',
    description: 'Every 3 harvests generates a free fertilizer charge.',
    buildCost: 30,
    chargesPerDay: null,
    usageLabel: 'Fertilize All',
  },
  {
    id: 'greenhouse',
    name: 'Greenhouse',
    emoji: '🏡',
    description: 'Passive: shields your garden from storm & drought damage.',
    buildCost: 80,
    chargesPerDay: null,
    usageLabel: null,
  },
  // ── Farm tier ─────────────────────────────────────────────────────────────
  {
    id: 'barn',
    name: 'Barn',
    emoji: '🏚️',
    description: 'Unlocks animals. Required before building a Chicken Coop or Stable.',
    buildCost: 120,
    chargesPerDay: null,
    usageLabel: null,
  },
  {
    id: 'chickenCoop',
    name: 'Chicken Coop',
    emoji: '🐔',
    description: 'Your chickens lay 1 egg every 2 days. Collect to earn 🪙8.',
    buildCost: 60,
    chargesPerDay: null,
    usageLabel: 'Collect Eggs',
    requires: 'barn',
  },
  {
    id: 'stable',
    name: 'Stable',
    emoji: '🐄',
    description: 'Your cow produces 1 milk every 3 days. Collect to earn 🪙12.',
    buildCost: 100,
    chargesPerDay: null,
    usageLabel: 'Collect Milk',
    requires: 'barn',
  },
  {
    id: 'silo',
    name: 'Silo',
    emoji: '🌾',
    description: 'Passive: all crop sales earn +20% coins.',
    buildCost: 90,
    chargesPerDay: null,
    usageLabel: null,
  },
];

function StructuresPanel({
  structures = {},
  coins = 0,
  onBuild,
  onUseWell,
  onUseCompost,
  onCollectEggs,
  onCollectMilk,
  hideTitle = false,
}) {
  const { structures: contentStructures } = useGameContent();
  // Keep the built-in STRUCTURE_DEFS as the base; append any custom structures from context
  // (those whose id isn't in the built-in list) so admins can add new structure types.
  const builtInIds    = new Set(STRUCTURE_DEFS.map((d) => d.id));
  const customExtras  = contentStructures.filter((s) => !builtInIds.has(s.id));
  const allDefs       = [...STRUCTURE_DEFS, ...customExtras];

  return (
    <div className="card structures-panel">
      {!hideTitle && <h3>🏗️ Structures</h3>}
      <div className="structures-list">
        {allDefs.map((def) => {
          const state   = structures[def.id] || {};
          const isBuilt = !!state.built;
          // Check prerequisite structure (e.g. barn required for coop/stable)
          const prereqMet = !def.requires || !!structures[def.requires]?.built;
          const canBuild = coins >= def.buildCost && prereqMet;

          return (
            <div key={def.id} className={`structure-item${isBuilt ? ' structure-item--built' : ''}`}>
              <div className="structure-top">
                <span className="structure-emoji" role="img" aria-label={def.name}>
                  {def.emoji}
                </span>
                <div className="structure-info">
                  <div className="structure-name">{def.name}</div>
                  <div className="structure-desc">{def.description}</div>
                </div>
                {!isBuilt ? (
                  <button
                    className="btn btn-primary structure-build-btn"
                    disabled={!canBuild}
                    onClick={() => onBuild(def.id)}
                    title={
                      !prereqMet
                        ? `Requires ${def.requires} first`
                        : canBuild
                          ? `Build for 🪙${def.buildCost}`
                          : `Need 🪙${def.buildCost}`
                    }
                  >
                    🔨 {def.buildCost}🪙
                  </button>
                ) : (
                  <span className="structure-tag">✅ Built</span>
                )}
              </div>

              {/* Per-structure action row */}
              {isBuilt && def.id === 'well' && (
                <div className="structure-action-row">
                  <span className="structure-charges" title="Charges refresh each day">
                    💧 {state.charges ?? def.chargesPerDay}/{def.chargesPerDay}
                  </span>
                  <button
                    className="btn btn-secondary structure-use-btn"
                    disabled={(state.charges ?? 0) <= 0}
                    onClick={onUseWell}
                  >
                    {def.usageLabel}
                  </button>
                </div>
              )}

              {isBuilt && def.id === 'compost' && (
                <div className="structure-action-row">
                  <span className="structure-charges">
                    🌿 {state.charges || 0} charge{state.charges !== 1 ? 's' : ''}
                    {' · '}
                    <span title="Harvests until next charge">
                      🔄 {state.harvestsUntilNext ?? 3}/3 harvests
                    </span>
                  </span>
                  <button
                    className="btn btn-secondary structure-use-btn"
                    disabled={(state.charges || 0) <= 0}
                    onClick={onUseCompost}
                  >
                    {def.usageLabel}
                  </button>
                </div>
              )}

              {isBuilt && def.id === 'greenhouse' && (
                <div className="structure-action-row">
                  <span className="structure-active">🌡️ Active — protecting against storms &amp; drought</span>
                </div>
              )}

              {isBuilt && def.id === 'barn' && (
                <div className="structure-action-row">
                  <span className="structure-active">🏚️ Animals unlocked — build Coop &amp; Stable</span>
                </div>
              )}

              {isBuilt && def.id === 'chickenCoop' && (
                <div className="structure-action-row">
                  <span className="structure-charges">
                    🥚 {state.eggReady ? 'Egg ready!' : `${2 - (state.daysSinceEgg || 0)} day(s) until next egg`}
                  </span>
                  <button
                    className="btn btn-secondary structure-use-btn"
                    disabled={!state.eggReady}
                    onClick={onCollectEggs}
                  >
                    🥚 Collect Eggs
                  </button>
                </div>
              )}

              {isBuilt && def.id === 'stable' && (
                <div className="structure-action-row">
                  <span className="structure-charges">
                    🥛 {state.milkReady ? 'Milk ready!' : `${3 - (state.daysSinceMilk || 0)} day(s) until next milk`}
                  </span>
                  <button
                    className="btn btn-secondary structure-use-btn"
                    disabled={!state.milkReady}
                    onClick={onCollectMilk}
                  >
                    🥛 Collect Milk
                  </button>
                </div>
              )}

              {isBuilt && def.id === 'silo' && (
                <div className="structure-action-row">
                  <span className="structure-active">🌾 Active — +20% coins on all crop sales</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default StructuresPanel;
