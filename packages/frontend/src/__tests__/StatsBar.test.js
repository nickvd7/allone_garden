/**
 * Tests — StatsBar
 *
 * Covers:
 *  - Level, coins, plants grown display
 *  - XP progress bar percentage
 *  - XP label shows current/max
 *  - aria attributes on progress bar
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import StatsBar from '../components/StatsBar';

// i18n mock
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k }),
}));

const DEFAULT_STATS = { xp: 250, coins: 500, level: 3, plantsGrown: 12 };

describe('StatsBar — display values', () => {
  it('renders level value', () => {
    render(<StatsBar stats={DEFAULT_STATS} />);
    expect(screen.getByText(/⭐ 3/)).toBeInTheDocument();
  });

  it('renders coins value', () => {
    render(<StatsBar stats={DEFAULT_STATS} />);
    expect(screen.getByText(/🪙 500/)).toBeInTheDocument();
  });

  it('renders plants grown value', () => {
    render(<StatsBar stats={DEFAULT_STATS} />);
    expect(screen.getByText(/🌱 12/)).toBeInTheDocument();
  });

  it('renders XP label with current and max', () => {
    render(<StatsBar stats={DEFAULT_STATS} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '250');
    expect(bar).toHaveAttribute('aria-valuemax', '900');
  });
});

describe('StatsBar — XP progress bar', () => {
  it('renders a progressbar role element', () => {
    render(<StatsBar stats={DEFAULT_STATS} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('sets aria-valuenow to xp', () => {
    render(<StatsBar stats={DEFAULT_STATS} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '250');
  });

  it('sets aria-valuemax to xpForLevel(level)', () => {
    render(<StatsBar stats={DEFAULT_STATS} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '900');
  });

  it('caps progress width at 100% when xp exceeds max', () => {
    render(<StatsBar stats={{ ...DEFAULT_STATS, xp: 9999 }} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.style.width).toBe('100%');
  });

  it('correctly calculates ~27.8% width for xp=250 at level 3', () => {
    render(<StatsBar stats={DEFAULT_STATS} />);
    const bar = screen.getByRole('progressbar');
    const pct = parseFloat(bar.style.width);
    // 250/900 ≈ 27.78
    expect(pct).toBeCloseTo(27.78, 0);
  });
});

describe('StatsBar — edge cases', () => {
  it('renders with zero values', () => {
    render(<StatsBar stats={{ xp: 0, coins: 0, level: 1, plantsGrown: 0 }} />);
    expect(screen.getByText(/⭐ 1/)).toBeInTheDocument();
    expect(screen.getByText(/🪙 0/)).toBeInTheDocument();
  });
});
