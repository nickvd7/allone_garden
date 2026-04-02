import React from 'react';
import { useTranslation } from 'react-i18next';
import { useGameContent } from '../context/GameContentContext';

const TOOLS = [
  { id: 'till',      emoji: '⛏️',  labelKey: 'tool_till' },
  { id: 'plant',     emoji: '🌱',  labelKey: 'tool_plant' },
  { id: 'water',     emoji: '💧',  labelKey: 'tool_water' },
  { id: 'fertilize', emoji: '⭐',  labelKey: 'tool_fertilize' },
  { id: 'spray',     emoji: '🧴',  labelKey: 'tool_spray' },
  { id: 'harvest',   emoji: '🧺',  labelKey: 'tool_harvest' },
];

const SEEDS = [
  { id: 'tomato',     emoji: '🍅', labelKey: 'plant_tomato',     days: 3 },
  { id: 'carrot',     emoji: '🥕', labelKey: 'plant_carrot',     days: 2 },
  { id: 'lettuce',    emoji: '🥬', labelKey: 'plant_lettuce',    days: 2 },
  { id: 'radish',     emoji: '🌸', labelKey: 'plant_radish',     days: 1 },
  { id: 'corn',       emoji: '🌽', labelKey: 'plant_corn',       days: 4 },
  { id: 'potato',     emoji: '🥔', labelKey: 'plant_potato',     days: 3 },
  { id: 'pumpkin',    emoji: '🎃', labelKey: 'plant_pumpkin',    days: 5 },
  { id: 'sunflower',  emoji: '🌻', labelKey: 'plant_sunflower',  days: 2 },
  { id: 'blueberry',  emoji: '🫐', labelKey: 'plant_blueberry',  days: 4 },
];

function ToolsPanel({ selectedTool, selectedSeed, onToolSelect, onSeedSelect }) {
  const { t } = useTranslation();
  const { plants: contextPlants } = useGameContent();

  // Custom plants = context plants whose slug isn't in the built-in SEEDS list
  const builtInSlugs = new Set(SEEDS.map((s) => s.id));
  const customSeeds  = contextPlants
    .filter((p) => !builtInSlugs.has(p.slug))
    .map((p) => ({ id: p.slug, emoji: p.harvestEmoji, label: p.name, days: p.growthDays }));

  const handleToolClick = (toolId) => {
    // Clicking the active tool deselects it
    onToolSelect(selectedTool === toolId ? null : toolId);
  };

  return (
    <div className="card">
      <h3>🔧 {t('tools')}</h3>

      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          className={`tool-btn ${selectedTool === tool.id ? 'active' : ''}`}
          onClick={() => handleToolClick(tool.id)}
          title={t(tool.labelKey)}
        >
          {tool.emoji} {t(tool.labelKey)}
        </button>
      ))}

      <div className="section-title">{t('seeds')}</div>

      <select
        className="seed-select"
        value={selectedSeed}
        onChange={(e) => onSeedSelect(e.target.value)}
        disabled={selectedTool !== 'plant'}
      >
        {/* Built-in seeds use i18n keys */}
        {SEEDS.map((seed) => (
          <option key={seed.id} value={seed.id}>
            {seed.emoji} {t(seed.labelKey)} ({seed.days}d)
          </option>
        ))}
        {/* Custom plants added by admins */}
        {customSeeds.length > 0 && (
          <optgroup label="🌿 Custom Plants">
            {customSeeds.map((seed) => (
              <option key={seed.id} value={seed.id}>
                {seed.emoji} {seed.label} ({seed.days}d)
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}

export { SEEDS };
export default ToolsPanel;
