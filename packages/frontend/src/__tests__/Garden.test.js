import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Garden from '../components/Garden';

// Helper — build a fresh array of 24 empty plots (the standard 4×6 grid)
function makePlots(overrides = []) {
  return Array.from({ length: 24 }, (_, i) => ({
    tilled:      false,
    planted:     false,
    plantType:   null,
    waterLevel:  0,
    fertilized:  false,
    daysPlanted: 0,
    pest:        false,
    ...overrides[i],
  }));
}

// Default props shared across tests
const BASE_PROPS = {
  selectedTool:  null,
  selectedSeed:  'tomato',
  currentDay:    1,
  weather:       'sunny',
  structures:    {},
  onUpdateGame:  jest.fn(),
};

describe('Garden', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Grid rendering ──────────────────────────────────────────────────────────

  it('renders 24 plot buttons', () => {
    render(<Garden {...BASE_PROPS} plots={makePlots()} />);
    const plots = screen.getAllByRole('button', { name: /Plot \d+/i });
    expect(plots).toHaveLength(24);
  });

  it('shows the current day number', () => {
    render(<Garden {...BASE_PROPS} plots={makePlots()} currentDay={7} />);
    // day-display div text is exactly "📅 day 7" (t('day') → 'day' via mock)
    expect(screen.getByText('📅 day 7')).toBeInTheDocument();
  });

  it('shows a "Next Day" button', () => {
    render(<Garden {...BASE_PROPS} plots={makePlots()} />);
    expect(screen.getByRole('button', { name: /⏭/i })).toBeInTheDocument();
  });

  it('shows the weather icon for sunny weather', () => {
    render(<Garden {...BASE_PROPS} plots={makePlots()} weather="sunny" />);
    // weather-display div text is exactly "☀️ weather_sunny"
    expect(screen.getByText('☀️ weather_sunny')).toBeInTheDocument();
  });

  it('shows the active tool name when a tool is selected', () => {
    render(<Garden {...BASE_PROPS} plots={makePlots()} selectedTool="water" />);
    // The info div shows "Tool: water" (no emoji suffix because no seedInfo for non-plant tool)
    expect(screen.getByText('Tool: water')).toBeInTheDocument();
  });

  // ── Companion planting legend ───────────────────────────────────────────────

  it('does NOT show the companion legend when no plots are planted', () => {
    render(<Garden {...BASE_PROPS} plots={makePlots()} />);
    // companion-legend is conditionally rendered
    expect(screen.queryByText('💚 good neighbors')).not.toBeInTheDocument();
  });

  it('shows the companion legend when at least one plot is planted', () => {
    const plots = makePlots();
    plots[0] = { ...plots[0], tilled: true, planted: true, plantType: 'tomato' };
    render(<Garden {...BASE_PROPS} plots={plots} />);
    expect(screen.getByText('💚 good neighbors')).toBeInTheDocument();
    expect(screen.getByText('⚠️ bad neighbors')).toBeInTheDocument();
  });

  // ── Plot interactions ───────────────────────────────────────────────────────
  //
  // Garden calls onUpdateGame((prev) => newState).
  // We capture that updater function and call it with a synthetic prev-state
  // to assert the resulting state without a full store.

  function buildPrevState(plots, extra = {}) {
    return {
      plots,
      playerStats: { xp: 0, level: 1, coins: 100, plantsGrown: 0 },
      inventory: {},
      structures: {},
      selectedSeed: 'tomato',
      currentDay: 1,
      ...extra,
    };
  }

  function captureUpdater(props, plotIndex = 0) {
    let capturedUpdater = null;
    const onUpdateGame = jest.fn((fn) => { capturedUpdater = fn; });
    render(<Garden {...BASE_PROPS} {...props} onUpdateGame={onUpdateGame} />);
    const plots = screen.getAllByRole('button', { name: /Plot \d+/i });
    fireEvent.click(plots[plotIndex]);
    return capturedUpdater;
  }

  it('clicking a plot with no tool does NOT call onUpdateGame', () => {
    const onUpdateGame = jest.fn();
    render(<Garden {...BASE_PROPS} plots={makePlots()} selectedTool={null} onUpdateGame={onUpdateGame} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Plot \d+/i })[0]);
    expect(onUpdateGame).not.toHaveBeenCalled();
  });

  it('till tool sets plot.tilled = true on an untilled plot', () => {
    const plots = makePlots();
    const updater = captureUpdater({ plots, selectedTool: 'till' });
    expect(updater).not.toBeNull();

    const next = updater(buildPrevState(plots));
    expect(next.plots[0].tilled).toBe(true);
    expect(next.playerStats.xp).toBe(5); // tilling gives 5 XP
  });

  it('till tool does NOT re-till an already-tilled plot (no XP gained)', () => {
    const plots = makePlots([{ tilled: true }]);
    const updater = captureUpdater({ plots, selectedTool: 'till' });

    const next = updater(buildPrevState(plots));
    expect(next.playerStats.xp).toBe(0);
  });

  it('plant tool sets planted=true on a tilled empty plot', () => {
    const plots = makePlots([{ tilled: true }]);
    const updater = captureUpdater({ plots, selectedTool: 'plant' });

    const next = updater(buildPrevState(plots, { selectedSeed: 'carrot' }));
    expect(next.plots[0].planted).toBe(true);
    expect(next.plots[0].plantType).toBe('carrot');
    expect(next.playerStats.xp).toBe(10);
  });

  it('water tool increments waterLevel on a tilled plot', () => {
    const plots = makePlots([{ tilled: true, waterLevel: 1 }]);
    const updater = captureUpdater({ plots, selectedTool: 'water' });

    const next = updater(buildPrevState(plots));
    expect(next.plots[0].waterLevel).toBe(2);
  });

  it('water tool does NOT exceed waterLevel 3', () => {
    const plots = makePlots([{ tilled: true, waterLevel: 3 }]);
    const updater = captureUpdater({ plots, selectedTool: 'water' });

    const next = updater(buildPrevState(plots));
    expect(next.plots[0].waterLevel).toBe(3);
    expect(next.playerStats.xp).toBe(0);
  });

  it('spray tool removes the pest flag and grants XP', () => {
    const plots = makePlots([{ tilled: true, planted: true, plantType: 'tomato', pest: true }]);
    const updater = captureUpdater({ plots, selectedTool: 'spray' });

    const next = updater(buildPrevState(plots));
    expect(next.plots[0].pest).toBe(false);
    expect(next.playerStats.xp).toBe(3);
  });

  it('harvest tool clears a fully-grown plot and adds crop to inventory', () => {
    // Radish needs 1 day (GROWTH_STAGES.radish = [0, 1])
    const plots = makePlots([{ tilled: true, planted: true, plantType: 'radish', daysPlanted: 1 }]);
    const updater = captureUpdater({ plots, selectedTool: 'harvest' });

    const next = updater(buildPrevState(plots));
    expect(next.plots[0].planted).toBe(false);
    expect(next.plots[0].plantType).toBeNull();
    expect(next.inventory.radish).toBe(1);
    expect(next.playerStats.plantsGrown).toBe(1);
    expect(next.playerStats.xp).toBe(25);
  });

  it('harvest tool does nothing when crop is not ready yet', () => {
    // Tomato needs 3 days; only 1 day has passed
    const plots = makePlots([{ tilled: true, planted: true, plantType: 'tomato', daysPlanted: 1 }]);
    const updater = captureUpdater({ plots, selectedTool: 'harvest' });

    const next = updater(buildPrevState(plots));
    expect(next.plots[0].planted).toBe(true); // still planted
    expect(next.playerStats.xp).toBe(0);
  });

  // ── Next Day ────────────────────────────────────────────────────────────────

  it('"Next Day" button calls onUpdateGame', () => {
    const onUpdateGame = jest.fn();
    render(<Garden {...BASE_PROPS} plots={makePlots()} onUpdateGame={onUpdateGame} />);
    fireEvent.click(screen.getByRole('button', { name: /⏭/ }));
    expect(onUpdateGame).toHaveBeenCalledTimes(1);
  });

  it('Next Day advances currentDay by 1', () => {
    const plots = makePlots();
    const onUpdateGame = jest.fn();
    render(<Garden {...BASE_PROPS} plots={plots} currentDay={3} onUpdateGame={onUpdateGame} />);
    fireEvent.click(screen.getByRole('button', { name: /⏭/ }));

    const updater = onUpdateGame.mock.calls[0][0];
    const next = updater({ plots, currentDay: 3, weather: 'sunny', structures: {} });
    expect(next.currentDay).toBe(4);
  });

  it('Next Day grows planted crops by 1 day (when watered)', () => {
    const plots = makePlots([{ tilled: true, planted: true, plantType: 'tomato', daysPlanted: 0, waterLevel: 1 }]);
    const onUpdateGame = jest.fn();
    render(<Garden {...BASE_PROPS} plots={plots} weather="sunny" onUpdateGame={onUpdateGame} />);
    fireEvent.click(screen.getByRole('button', { name: /⏭/ }));

    const updater = onUpdateGame.mock.calls[0][0];
    const next = updater({ plots, currentDay: 1, weather: 'sunny', structures: {} });
    // Watered plot should grow by 1 day (waterBonus = 1), no pest assumed
    expect(next.plots[0].daysPlanted).toBeGreaterThanOrEqual(1);
  });
});
