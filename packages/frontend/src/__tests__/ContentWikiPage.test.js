/**
 * Tests — ContentWikiPage
 *
 * Covers:
 *  - Page structure (header, tabs, content grid)
 *  - Tab switching
 *  - Content card rendering for each type
 *  - Propose button visibility (logged in vs guest)
 *  - ProposalModal open/close
 *  - Proposal submission (success + error)
 *  - Dark mode toggle
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ContentWikiPage from '../components/ContentWikiPage';

import api from '../hooks/useApi';

// ── Mock fetch (public content endpoint) ─────────────────────────────────────
const MOCK_CONTENT = {
  plants: [
    {
      slug: 'tomato', name: 'Tomato', harvestEmoji: '🍅',
      growthDays: 3, baseCoins: 10,
      companionGood: [{ slug: 'carrot', bonus: 5 }],
      companionBad:  [],
    },
    {
      slug: 'carrot', name: 'Carrot', harvestEmoji: '🥕',
      growthDays: 2, baseCoins: 8,
      companionGood: [], companionBad: [],
    },
  ],
  structures: [
    { id: 'well', name: 'Well', emoji: '🪣', buildCost: 30, chargesPerDay: 3, description: 'Provides water.' },
  ],
  tools: [
    { id: 'hoe', name: 'Hoe', emoji: '⛏️', description: 'Tills soil.' },
  ],
  weather: [
    { id: 'sunny', name: 'Sunny', emoji: '☀️', waterBonus: 0, pestChance: 0.05, stormRollback: false },
  ],
};

// ── Mock api (proposal POST) ───────────────────────────────────────────────────
jest.mock('../hooks/useApi', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

// ── localStorage helpers ───────────────────────────────────────────────────────
let localStore = {};
beforeEach(() => {
  localStore = {};
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation((k) => localStore[k] ?? null);
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => { localStore[k] = v; });

  global.fetch = jest.fn().mockResolvedValue({
    json: () => Promise.resolve(MOCK_CONTENT),
  });

  jest.spyOn(document.documentElement, 'setAttribute');
  jest.clearAllMocks();

  // Re-apply fetch mock after clearAllMocks
  global.fetch = jest.fn().mockResolvedValue({
    json: () => Promise.resolve(MOCK_CONTENT),
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── Page structure ─────────────────────────────────────────────────────────────
describe('ContentWikiPage — page structure', () => {
  it('renders the page title in the header', async () => {
    render(<ContentWikiPage />);
    await screen.findByText(/Content Wiki/i);
  });

  it('renders the back link to AllOne Garden', async () => {
    render(<ContentWikiPage />);
    const link = await screen.findByRole('link', { name: /AllOne Garden/i });
    expect(link).toHaveAttribute('href', '/');
  });

  it('renders all four tab buttons', async () => {
    render(<ContentWikiPage />);
    await waitFor(() => {
      expect(screen.getByText(/🌱 Plants/i)).toBeInTheDocument();
      expect(screen.getByText(/🏗️ Structures/i)).toBeInTheDocument();
      expect(screen.getByText(/🔧 Tools/i)).toBeInTheDocument();
      expect(screen.getByText(/☁️ Weather/i)).toBeInTheDocument();
    });
  });

  it('renders item count badge for plants tab after load', async () => {
    render(<ContentWikiPage />);
    await screen.findByText('(2)'); // 2 plants
  });

  it('renders the dark-mode toggle button', async () => {
    render(<ContentWikiPage />);
    expect(screen.getByTitle(/Toggle dark mode/i)).toBeInTheDocument();
  });
});

// ── Tab switching ──────────────────────────────────────────────────────────────
describe('ContentWikiPage — tab switching', () => {
  it('shows plant cards by default', async () => {
    render(<ContentWikiPage />);
    await screen.findByText('Tomato');
    expect(screen.getByText('Carrot')).toBeInTheDocument();
  });

  it('switches to Structures tab', async () => {
    render(<ContentWikiPage />);
    await screen.findByText('Tomato');

    fireEvent.click(screen.getByText(/🏗️ Structures/i));
    await screen.findByText('Well');
  });

  it('switches to Tools tab', async () => {
    render(<ContentWikiPage />);
    await screen.findByText('Tomato');

    fireEvent.click(screen.getByText(/🔧 Tools/i));
    await screen.findByText('Hoe');
  });

  it('switches to Weather tab', async () => {
    render(<ContentWikiPage />);
    await screen.findByText('Tomato');

    fireEvent.click(screen.getByText(/☁️ Weather/i));
    await screen.findByText('Sunny');
  });
});

// ── Plant cards ────────────────────────────────────────────────────────────────
describe('ContentWikiPage — plant cards', () => {
  it('shows growth days badge', async () => {
    render(<ContentWikiPage />);
    await screen.findByText(/3d/);
  });

  it('shows coins badge', async () => {
    render(<ContentWikiPage />);
    await screen.findByText(/🪙 10/);
  });

  it('shows companion badge when companionGood is present', async () => {
    render(<ContentWikiPage />);
    await screen.findByText(/💚.*carrot/i);
  });
});

// ── Structure cards ────────────────────────────────────────────────────────────
describe('ContentWikiPage — structure cards', () => {
  it('shows build cost badge', async () => {
    render(<ContentWikiPage />);
    await screen.findByText('Tomato');
    fireEvent.click(screen.getByText(/🏗️ Structures/i));
    await screen.findByText(/30 coins/i);
  });

  it('shows charges/day badge when > 0', async () => {
    render(<ContentWikiPage />);
    await screen.findByText('Tomato');
    fireEvent.click(screen.getByText(/🏗️ Structures/i));
    await screen.findByText(/3\/day/i);
  });
});

// ── Propose button visibility ──────────────────────────────────────────────────
describe('ContentWikiPage — propose button', () => {
  it('shows Propose button when logged in', async () => {
    localStore['garden_token'] = 'valid-jwt';
    render(<ContentWikiPage />);
    await screen.findByRole('button', { name: /Propose plant/i });
  });

  it('does not show Propose button when logged out', async () => {
    render(<ContentWikiPage />);
    await screen.findByText('Tomato');
    expect(screen.queryByText(/✏️ Propose/i)).not.toBeInTheDocument();
  });

  it('shows "Log in to propose" hint when logged out', async () => {
    render(<ContentWikiPage />);
    await screen.findByText(/Log in to propose/i);
  });
});

// ── ProposalModal ──────────────────────────────────────────────────────────────
describe('ContentWikiPage — proposal modal', () => {
  beforeEach(() => { localStore['garden_token'] = 'valid-jwt'; });

  it('opens modal when Propose button is clicked', async () => {
    render(<ContentWikiPage />);
    await screen.findByRole('button', { name: /Propose plant/i });
    fireEvent.click(screen.getByRole('button', { name: /Propose plant/i }));
    await screen.findByText(/Propose new plant/i);
  });

  it('closes modal when Cancel is clicked', async () => {
    render(<ContentWikiPage />);
    await screen.findByRole('button', { name: /Propose plant/i });
    fireEvent.click(screen.getByRole('button', { name: /Propose plant/i }));
    await screen.findByText(/Propose new plant/i);

    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() =>
      expect(screen.queryByText(/Propose new plant/i)).not.toBeInTheDocument()
    );
  });

  it('closes modal when ✕ close button is clicked', async () => {
    render(<ContentWikiPage />);
    await screen.findByRole('button', { name: /Propose plant/i });
    fireEvent.click(screen.getByRole('button', { name: /Propose plant/i }));
    await screen.findByText(/Propose new plant/i);

    // Click the ✕ button
    fireEvent.click(screen.getByText('✕'));
    await waitFor(() =>
      expect(screen.queryByText(/Propose new plant/i)).not.toBeInTheDocument()
    );
  });

  it('shows validation error when slug is empty and submit is clicked', async () => {
    render(<ContentWikiPage />);
    await screen.findByRole('button', { name: /Propose plant/i });
    fireEvent.click(screen.getByRole('button', { name: /Propose plant/i }));
    await screen.findByText(/Propose new plant/i);

    fireEvent.click(screen.getByText(/📬 Submit proposal/i));
    await screen.findByText(/slug is required/i);
  });
});

// ── Proposal submission ────────────────────────────────────────────────────────
describe('ContentWikiPage — proposal submission', () => {
  beforeEach(() => {
    localStore['garden_token'] = 'valid-jwt';
    api.post.mockResolvedValue({ success: true, proposal: { id: 'p1', status: 'pending' } });
  });

  it('shows success message on successful submission', async () => {
    render(<ContentWikiPage />);
    await screen.findByRole('button', { name: /Propose plant/i });
    fireEvent.click(screen.getByRole('button', { name: /Propose plant/i }));
    await screen.findByText(/Propose new plant/i);

    // Use placeholder text to target the modal fields specifically
    // (a search bar is also in the DOM and would shift index-based selectors)
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. strawberry/i), { target: { value: 'melon' } });
    fireEvent.change(screen.getByPlaceholderText(/^strawberry$/i),      { target: { value: 'Melon' } });

    fireEvent.click(screen.getByText(/📬 Submit proposal/i));

    await screen.findByText(/Proposal submitted/i);
  });

  it('shows error message when API call fails', async () => {
    api.post.mockRejectedValue(new Error('Server error'));
    render(<ContentWikiPage />);
    await screen.findByRole('button', { name: /Propose plant/i });
    fireEvent.click(screen.getByRole('button', { name: /Propose plant/i }));
    await screen.findByText(/Propose new plant/i);

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. strawberry/i), { target: { value: 'melon' } });
    fireEvent.change(screen.getByPlaceholderText(/^strawberry$/i),      { target: { value: 'Melon' } });

    fireEvent.click(screen.getByText(/📬 Submit proposal/i));

    await screen.findByText(/Failed/i);
  });
});

// ── Dark mode ─────────────────────────────────────────────────────────────────
describe('ContentWikiPage — dark mode', () => {
  it('shows 🌙 by default (light mode)', async () => {
    render(<ContentWikiPage />);
    expect(screen.getByText('🌙')).toBeInTheDocument();
  });

  it('toggles to ☀️ when dark mode button is clicked', async () => {
    render(<ContentWikiPage />);
    fireEvent.click(screen.getByTitle(/Toggle dark mode/i));
    await screen.findByText('☀️');
  });

  it('persists dark mode preference to localStorage', async () => {
    render(<ContentWikiPage />);
    fireEvent.click(screen.getByTitle(/Toggle dark mode/i));
    await waitFor(() => expect(localStore['garden_dark']).toBe('true'));
  });

  it('restores dark mode from localStorage on mount', async () => {
    localStore['garden_dark'] = 'true';
    render(<ContentWikiPage />);
    await screen.findByText('☀️');
  });
});
