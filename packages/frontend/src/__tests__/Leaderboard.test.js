/**
 * Tests — Leaderboard
 *
 * Covers:
 *  - Renders with loading state
 *  - Displays rows from API
 *  - Medal emojis for top 3
 *  - Sort tabs (XP / Coins / Plants)
 *  - Current user row highlighted
 *  - Close button calls onClose
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Leaderboard from '../components/Leaderboard';
import api from '../hooks/useApi';

jest.mock('../hooks/useApi', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

const MOCK_ROWS = [
  { id: 1, username: 'Alice',   xp: 5000, coins: 300, plantsGrown: 80 },
  { id: 2, username: 'Bob',     xp: 3000, coins: 200, plantsGrown: 50 },
  { id: 3, username: 'Charlie', xp: 1500, coins: 150, plantsGrown: 30 },
  { id: 4, username: 'Diana',   xp: 800,  coins: 90,  plantsGrown: 15 },
];

beforeEach(() => {
  api.get.mockImplementation((url) => {
    if (String(url).includes('history/cycles')) return Promise.resolve({ cycles: [] });
    return Promise.resolve(MOCK_ROWS);
  });
});

afterEach(() => jest.clearAllMocks());

describe('Leaderboard — rendering', () => {
  it('renders the title', async () => {
    render(<Leaderboard currentUserId={99} onClose={() => {}} />);
    expect(screen.getByText(/🏆 Leaderboard/i)).toBeInTheDocument();
  });

  it('shows player names after load', async () => {
    render(<Leaderboard currentUserId={99} onClose={() => {}} />);
    await screen.findByText('Alice');
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('shows 🥇 for first place', async () => {
    render(<Leaderboard currentUserId={99} onClose={() => {}} />);
    await screen.findByText('Alice');
    expect(screen.getByText('🥇')).toBeInTheDocument();
  });

  it('shows 🥈 for second place', async () => {
    render(<Leaderboard currentUserId={99} onClose={() => {}} />);
    await screen.findByText('Bob');
    expect(screen.getByText('🥈')).toBeInTheDocument();
  });

  it('shows 🥉 for third place', async () => {
    render(<Leaderboard currentUserId={99} onClose={() => {}} />);
    await screen.findByText('Charlie');
    expect(screen.getByText('🥉')).toBeInTheDocument();
  });
});

describe('Leaderboard — sort tabs', () => {
  it('renders XP, Coins, and Plants sort buttons', async () => {
    render(<Leaderboard currentUserId={99} onClose={() => {}} />);
    expect(screen.getByText(/⭐ XP/i)).toBeInTheDocument();
    expect(screen.getByText(/🪙 Coins/i)).toBeInTheDocument();
    expect(screen.getByText(/🌱 Plants/i)).toBeInTheDocument();
  });

  it('calls API with by=coins when Coins tab clicked', async () => {
    render(<Leaderboard currentUserId={99} onClose={() => {}} />);
    await screen.findByText('Alice');
    fireEvent.click(screen.getByText(/🪙 Coins/i));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/api/leaderboard?by=coins')
    );
  });

  it('calls API with by=plants when Plants tab clicked', async () => {
    render(<Leaderboard currentUserId={99} onClose={() => {}} />);
    await screen.findByText('Alice');
    fireEvent.click(screen.getByText(/🌱 Plants/i));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/api/leaderboard?by=plants')
    );
  });
});

describe('Leaderboard — current user highlight', () => {
  it('renders "(you)" indicator for current user', async () => {
    render(<Leaderboard currentUserId={2} onClose={() => {}} />);
    await screen.findByText('Bob');
    // Component renders "(you)" in a sub-span next to the username
    expect(screen.getByText(/\(you\)/i)).toBeInTheDocument();
  });
});

describe('Leaderboard — close', () => {
  it('calls onClose when close button is clicked', async () => {
    const onClose = jest.fn();
    render(<Leaderboard currentUserId={99} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows empty state when API returns empty', async () => {
    api.get.mockResolvedValue([]);
    render(<Leaderboard currentUserId={99} onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.queryByText('Alice')).not.toBeInTheDocument()
    );
  });
});
