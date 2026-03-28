import React from 'react';

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
];

function StructuresPanel({ structures = {}, coins = 0, onBuild, onUseWell, onUseCompost }) {
  return (
    <div className="card structures-panel">
      <h3>🏗️ Structures</h3>
      <div className="structures-list">
        {STRUCTURE_DEFS.map((def) => {
          const state   = structures[def.id] || {};
          const isBuilt = !!state.built;
          const canBuild = coins >= def.buildCost;

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
                    title={canBuild ? `Build for 🪙${def.buildCost}` : `Need 🪙${def.buildCost}`}
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default StructuresPanel;
