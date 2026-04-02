import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import GradendexView from '../components/GradendexView';

jest.mock('axios');

// ── Fixture data ──────────────────────────────────────────────────────────────
const TOMATO = {
  slug: 'tomato', name: 'Tomato', emoji: '🍅', category: 'plant',
  short_desc: 'Classic 3-day crop.', long_desc: 'Tasty **red** fruit.',
  growth_days: 3, base_coins: 15,
  companion_good: [{ slug: 'carrot', bonus: 20 }],
  companion_bad:  [{ slug: 'pumpkin', penalty: 10 }],
  tips: ['Water every day.', 'Pair with carrot.'],
  updated_by: 'admin', updated_at: '2025-01-01T00:00:00Z',
};

const WELL = {
  slug: 'well', name: 'Water Well', emoji: '🪣', category: 'structure',
  short_desc: 'Waters all plots at once.', long_desc: 'Useful structure.',
  growth_days: null, base_coins: null,
  companion_good: [], companion_bad: [], tips: [],
};

const ENTRIES = [TOMATO, WELL];

function setup(props = {}) {
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/api/gradendex')) {
      return Promise.resolve({ data: { entries: ENTRIES } });
    }
    if (url.endsWith('/api/gradendex/can-edit')) {
      return Promise.resolve({ data: { canEdit: true } });
    }
    return Promise.reject(new Error('Unknown URL'));
  });

  return render(<GradendexView {...props} />);
}

// ── Loading state ─────────────────────────────────────────────────────────────
describe('GradendexView — loading state', () => {
  it('shows loading text while fetching', () => {
    // Never resolves
    axios.get.mockReturnValue(new Promise(() => {}));
    render(<GradendexView />);
    expect(screen.getByText(/Loading Gradendex/i)).toBeInTheDocument();
  });
});

// ── Error state ───────────────────────────────────────────────────────────────
describe('GradendexView — error state', () => {
  it('shows error message when API call fails', async () => {
    axios.get.mockRejectedValue(new Error('Network error'));
    render(<GradendexView />);
    await screen.findByText(/Could not load Gradendex/i);
  });
});

// ── List view ─────────────────────────────────────────────────────────────────
describe('GradendexView — list view', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders entry cards after loading', async () => {
    setup();
    await screen.findByText('Tomato');
    expect(screen.getByText('Water Well')).toBeInTheDocument();
  });

  it('shows growth days and coins on plant cards', async () => {
    setup();
    await screen.findByText('Tomato');
    expect(screen.getByText(/3d/)).toBeInTheDocument();
    expect(screen.getByText(/🪙15/)).toBeInTheDocument();
  });

  it('does not show stats for structures with no growth_days', async () => {
    setup();
    await screen.findByText('Water Well');
    // Structure stat text (e.g. 📅 nulld) should NOT be present
    expect(screen.queryByText(/nulld/)).not.toBeInTheDocument();
  });

  it('shows category badges on cards', async () => {
    setup();
    await screen.findByText('Tomato');
    const plantBadges = screen.getAllByText('Plant');
    expect(plantBadges.length).toBeGreaterThan(0);
    expect(screen.getByText('Structure')).toBeInTheDocument();
  });

  it('shows "All", "Plants", "Structures" filter tabs', async () => {
    setup();
    await screen.findByText('Tomato');
    expect(screen.getByText(/All/)).toBeInTheDocument();
    expect(screen.getByText(/Plants/)).toBeInTheDocument();
    expect(screen.getByText(/Structures/)).toBeInTheDocument();
  });

  it('filters by Plants category', async () => {
    setup();
    await screen.findByText('Tomato');
    fireEvent.click(screen.getByText(/Plants/));
    expect(screen.getByText('Tomato')).toBeInTheDocument();
    expect(screen.queryByText('Water Well')).not.toBeInTheDocument();
  });

  it('filters by Structures category', async () => {
    setup();
    await screen.findByText('Tomato');
    fireEvent.click(screen.getByText(/Structures/));
    expect(screen.getByText('Water Well')).toBeInTheDocument();
    expect(screen.queryByText('Tomato')).not.toBeInTheDocument();
  });

  it('filters by search text', async () => {
    setup();
    await screen.findByText('Tomato');
    fireEvent.change(screen.getByPlaceholderText(/Search/i), { target: { value: 'Well' } });
    expect(screen.getByText('Water Well')).toBeInTheDocument();
    expect(screen.queryByText('Tomato')).not.toBeInTheDocument();
  });

  it('shows "no entries found" when search yields nothing', async () => {
    setup();
    await screen.findByText('Tomato');
    fireEvent.change(screen.getByPlaceholderText(/Search/i), { target: { value: 'xyzxyzxyz' } });
    expect(screen.getByText(/No entries found/i)).toBeInTheDocument();
  });

  it('does not show admin hint when no token provided', async () => {
    setup({ token: null });
    await screen.findByText('Tomato');
    expect(screen.queryByText(/Admin mode/)).not.toBeInTheDocument();
  });

  it('shows admin hint when user is an admin', async () => {
    setup({ token: 'mock-jwt-token' });
    await screen.findByText(/Admin mode/i);
  });
});

// ── Entry detail view ─────────────────────────────────────────────────────────
describe('GradendexView — entry detail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens detail when a card is clicked', async () => {
    setup();
    await screen.findByText('Tomato');
    fireEvent.click(screen.getByRole('button', { name: /View Tomato/i }));
    await screen.findByText('← Back to list');
  });

  it('shows entry name in detail view', async () => {
    setup();
    await screen.findByText('Tomato');
    fireEvent.click(screen.getByRole('button', { name: /View Tomato/i }));
    await waitFor(() => {
      // Name rendered as h2 in detail view
      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toHaveTextContent('Tomato');
    });
  });

  it('shows growth days and coins in detail stats', async () => {
    setup();
    await screen.findByText('Tomato');
    fireEvent.click(screen.getByRole('button', { name: /View Tomato/i }));
    await waitFor(() => {
      expect(screen.getByText('15 coins')).toBeInTheDocument();
      expect(screen.getAllByText('3 days').length).toBeGreaterThan(0);
    });
  });

  it('shows companion planting info', async () => {
    setup();
    await screen.findByText('Tomato');
    fireEvent.click(screen.getByRole('button', { name: /View Tomato/i }));
    await waitFor(() => {
      expect(
        screen.getByText((_, el) =>
          el.tagName === 'SPAN' &&
          (el.textContent || '').includes('💚') &&
          (el.textContent || '').includes('Carrot') &&
          (el.textContent || '').includes('20%')
        )
      ).toBeInTheDocument();
      expect(
        screen.getByText((_, el) =>
          el.tagName === 'SPAN' &&
          (el.textContent || '').includes('⚠️') &&
          (el.textContent || '').includes('Pumpkin')
        )
      ).toBeInTheDocument();
    });
  });

  it('renders tips list', async () => {
    setup();
    await screen.findByText('Tomato');
    fireEvent.click(screen.getByRole('button', { name: /View Tomato/i }));
    await waitFor(() => {
      // Fixture has two tips; each is looked up as gradendex.entries.tomato.tips.{i}
      expect(screen.getByText(/Tomato \+ Carrot is one of the strongest/i)).toBeInTheDocument();
      expect(screen.getByText(/Add a lettuce border/i)).toBeInTheDocument();
    });
  });

  it('renders bold markdown in long_desc', async () => {
    setup();
    await screen.findByText('Tomato');
    fireEvent.click(screen.getByRole('button', { name: /View Tomato/i }));
    await waitFor(() => {
      const strong = screen.getAllByText('3 days').find((el) => el.tagName === 'STRONG');
      expect(strong).toBeTruthy();
    });
  });

  it('goes back to list when Back button clicked', async () => {
    setup();
    await screen.findByText('Tomato');
    fireEvent.click(screen.getByRole('button', { name: /View Tomato/i }));
    await screen.findByText('← Back to list');
    fireEvent.click(screen.getByText('← Back to list'));
    expect(screen.getByText('Tomato')).toBeInTheDocument();
    expect(screen.getByText('Water Well')).toBeInTheDocument();
  });

  it('shows Edit button when canEdit is true', async () => {
    setup({ token: 'mock-jwt-token' });
    await screen.findByText('Tomato');
    fireEvent.click(screen.getByRole('button', { name: /View Tomato/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /✏️ Edit/i })).toBeInTheDocument();
    });
  });

  it('does not show Edit button without token', async () => {
    setup({ token: null });
    await screen.findByText('Tomato');
    fireEvent.click(screen.getByRole('button', { name: /View Tomato/i }));
    await screen.findByText('← Back to list');
    expect(screen.queryByRole('button', { name: /✏️ Edit/i })).not.toBeInTheDocument();
  });
});

// ── Edit form ─────────────────────────────────────────────────────────────────
describe('GradendexView — edit form', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the edit form when Edit button clicked', async () => {
    setup({ token: 'mock-jwt-token' });
    await screen.findByText('Tomato');
    fireEvent.click(screen.getByRole('button', { name: /View Tomato/i }));
    await screen.findByRole('button', { name: /✏️ Edit/i });
    fireEvent.click(screen.getByRole('button', { name: /✏️ Edit/i }));
    expect(screen.getByRole('button', { name: /💾 Save changes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
  });

  it('cancels edit and returns to detail view', async () => {
    setup({ token: 'mock-jwt-token' });
    await screen.findByText('Tomato');
    fireEvent.click(screen.getByRole('button', { name: /View Tomato/i }));
    await screen.findByRole('button', { name: /✏️ Edit/i });
    fireEvent.click(screen.getByRole('button', { name: /✏️ Edit/i }));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    // Back in detail view
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Tomato');
  });

  it('submits edit form and updates entry', async () => {
    const updatedEntry = { ...TOMATO, name: 'Super Tomato' };
    axios.put = jest.fn().mockResolvedValue({ data: { entry: updatedEntry } });

    setup({ token: 'mock-jwt-token' });
    await screen.findByText('Tomato');
    fireEvent.click(screen.getByRole('button', { name: /View Tomato/i }));
    await screen.findByRole('button', { name: /✏️ Edit/i });
    fireEvent.click(screen.getByRole('button', { name: /✏️ Edit/i }));

    // Change name
    const nameInput = screen.getByDisplayValue('Tomato');
    fireEvent.change(nameInput, { target: { value: 'Super Tomato' } });

    fireEvent.click(screen.getByRole('button', { name: /💾 Save changes/i }));

    await waitFor(() => {
      expect(axios.put).toHaveBeenCalledWith(
        expect.stringContaining('/api/gradendex/tomato'),
        expect.objectContaining({ name: 'Super Tomato' }),
        expect.objectContaining({ headers: { Authorization: 'Bearer mock-jwt-token' } })
      );
    });
  });
});
