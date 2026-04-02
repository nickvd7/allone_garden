/**
 * Tests — ProposalsPanel
 *
 * Covers:
 *  - Filter buttons render
 *  - Loading / empty states
 *  - Proposal card rendering (status badge, type tag, action buttons)
 *  - Approve / reject / request-revision flows
 *  - Pagination (> PAGE_SIZE items)
 *  - Diff toggle (override proposal)
 *  - Toast notification after action
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProposalsPanel from '../components/ProposalsPanel';
import api from '../hooks/useApi';

// ── Mock api ──────────────────────────────────────────────────────────────────
jest.mock('../hooks/useApi', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

// ── Mock fetch (used for /api/content diff) ───────────────────────────────────
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ plants: [], structures: [], tools: [], weather: [] }),
  });
  api.post.mockResolvedValue({});
});

afterEach(() => jest.clearAllMocks());

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeProp(overrides = {}) {
  return {
    id: 'p1',
    type: 'plants',
    item: { slug: 'melon', name: 'Melon', growthDays: 4, baseCoins: 12 },
    submittedBy: 7,
    submittedByName: 'Alice',
    status: 'pending',
    note: '',
    revisionCount: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function setupGet(proposals) {
  api.get.mockResolvedValue({ proposals });
}

// ── Filter bar ────────────────────────────────────────────────────────────────
describe('ProposalsPanel — filter bar', () => {
  it('renders all four filter buttons', async () => {
    setupGet([]);
    render(<ProposalsPanel />);
    expect(screen.getByText(/⏳ Pending/i)).toBeInTheDocument();
    expect(screen.getByText(/🔄 Needs revision/i)).toBeInTheDocument();
    expect(screen.getByText(/✅ Approved/i)).toBeInTheDocument();
    expect(screen.getByText(/❌ Rejected/i)).toBeInTheDocument();
  });

  it('renders a Refresh button', async () => {
    setupGet([]);
    render(<ProposalsPanel />);
    expect(screen.getByText(/↻ Refresh/i)).toBeInTheDocument();
  });
});

// ── Empty / loading states ────────────────────────────────────────────────────
describe('ProposalsPanel — empty state', () => {
  it('shows "No pending proposals" when list is empty', async () => {
    setupGet([]);
    render(<ProposalsPanel />);
    await screen.findByText(/No pending proposals/i);
  });

  it('shows link to Content Wiki in empty pending state', async () => {
    setupGet([]);
    render(<ProposalsPanel />);
    await screen.findByRole('link', { name: /Content Wiki/i });
  });

  it('shows error message when API fails', async () => {
    api.get.mockRejectedValue(new Error('Network error'));
    render(<ProposalsPanel />);
    await screen.findByText(/Network error/i);
  });
});

// ── Proposal card ─────────────────────────────────────────────────────────────
describe('ProposalsPanel — proposal card', () => {
  it('renders item name and submitter', async () => {
    setupGet([makeProp()]);
    render(<ProposalsPanel />);
    await screen.findByText('Melon');
    expect(screen.getByText(/Alice/i)).toBeInTheDocument();
  });

  it('renders ⏳ Pending status badge', async () => {
    setupGet([makeProp()]);
    render(<ProposalsPanel />);
    await waitFor(() =>
      expect(screen.getAllByText(/⏳ Pending/i).length).toBeGreaterThan(0)
    );
  });

  it('renders 🌱 plant type tag', async () => {
    setupGet([makeProp()]);
    render(<ProposalsPanel />);
    await screen.findByText(/🌱 plant/i);
  });

  it('shows revision count badge when revisionCount > 0', async () => {
    setupGet([makeProp({ revisionCount: 2 })]);
    render(<ProposalsPanel />);
    await screen.findByText(/rev #2/i);
  });

  it('shows action buttons for pending proposal', async () => {
    setupGet([makeProp()]);
    render(<ProposalsPanel />);
    await waitFor(() => {
      expect(screen.getByText('✅ Approve')).toBeInTheDocument();
      expect(screen.getByText('✏️ Edit & Approve')).toBeInTheDocument();
      expect(screen.getByText('🔄 Request revision')).toBeInTheDocument();
      expect(screen.getByText('❌ Reject')).toBeInTheDocument();
    });
  });

  it('does not show action buttons for approved proposal', async () => {
    setupGet([makeProp({ status: 'approved' })]);
    render(<ProposalsPanel />);
    await screen.findByText('Melon');
    expect(screen.queryByText('✅ Approve')).not.toBeInTheDocument();
  });

  it('expands JSON on ▼ click', async () => {
    setupGet([makeProp()]);
    render(<ProposalsPanel />);
    await screen.findByText('Melon');
    fireEvent.click(screen.getByText('▼'));
    await screen.findByText(/"slug": "melon"/i);
  });
});

// ── Actions ───────────────────────────────────────────────────────────────────
describe('ProposalsPanel — actions', () => {
  it('calls approve API and shows toast on Approve click', async () => {
    setupGet([makeProp()]);
    api.get.mockResolvedValueOnce({ proposals: [makeProp()] })
           .mockResolvedValueOnce({ proposals: [] });
    render(<ProposalsPanel />);
    await screen.findByText('✅ Approve');

    fireEvent.click(screen.getByText('✅ Approve'));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        expect.stringContaining('/approve'), expect.any(Object)
      )
    );
    await screen.findByText(/approved and published/i);
  });

  it('shows rejection note input when Reject is clicked', async () => {
    setupGet([makeProp()]);
    render(<ProposalsPanel />);
    await screen.findByText('❌ Reject');

    fireEvent.click(screen.getByText('❌ Reject'));
    await screen.findByPlaceholderText(/Stats too powerful/i);
  });

  it('calls reject API with note', async () => {
    setupGet([makeProp()]);
    api.get.mockResolvedValueOnce({ proposals: [makeProp()] })
           .mockResolvedValueOnce({ proposals: [] });
    render(<ProposalsPanel />);
    await screen.findByText('❌ Reject');

    fireEvent.click(screen.getByText('❌ Reject'));
    await screen.findByPlaceholderText(/Stats too powerful/i);

    fireEvent.change(screen.getByPlaceholderText(/Stats too powerful/i), {
      target: { value: 'Too strong' },
    });
    fireEvent.click(screen.getByText('Confirm ❌'));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        expect.stringContaining('/reject'), { note: 'Too strong' }
      )
    );
  });

  it('shows revision note input when Request revision is clicked', async () => {
    setupGet([makeProp()]);
    render(<ProposalsPanel />);
    await screen.findByText('🔄 Request revision');

    fireEvent.click(screen.getByText('🔄 Request revision'));
    await screen.findByPlaceholderText(/lower baseCoins/i);
  });

  it('Send button is disabled when revision note is empty', async () => {
    setupGet([makeProp()]);
    render(<ProposalsPanel />);
    await screen.findByText('🔄 Request revision');

    fireEvent.click(screen.getByText('🔄 Request revision'));
    await screen.findByText('Send 🔄');
    expect(screen.getByText('Send 🔄')).toBeDisabled();
  });
});

// ── Diff view ─────────────────────────────────────────────────────────────────
describe('ProposalsPanel — diff view', () => {
  it('shows ✏️ override badge when item exists in live content', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        plants: [{ slug: 'melon', name: 'Melon', growthDays: 3, baseCoins: 10 }],
        structures: [], tools: [], weather: [],
      }),
    });
    setupGet([makeProp()]);
    render(<ProposalsPanel />);
    await screen.findByText(/✏️ override/i);
  });

  it('shows diff toggle button for override proposals', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        plants: [{ slug: 'melon', name: 'Melon', growthDays: 3, baseCoins: 10 }],
        structures: [], tools: [], weather: [],
      }),
    });
    setupGet([makeProp()]);
    render(<ProposalsPanel />);
    await screen.findByText(/▼ diff/i);

    fireEvent.click(screen.getByText(/▼ diff/i));
    await screen.findByText(/Changed fields vs. live version/i);
  });
});

// ── Pagination ────────────────────────────────────────────────────────────────
describe('ProposalsPanel — pagination', () => {
  it('shows page navigation when more than PAGE_SIZE proposals exist', async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      makeProp({ id: `p${i}`, item: { slug: `plant${i}`, name: `Plant ${i}` } })
    );
    setupGet(many);
    render(<ProposalsPanel />);
    await screen.findByText('← Prev');
    expect(screen.getByText('Next →')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // page 2 button
  });

  it('navigates to page 2 on Next click', async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      makeProp({ id: `p${i}`, item: { slug: `plant${i}`, name: `Plant ${i}` } })
    );
    setupGet(many);
    render(<ProposalsPanel />);
    await screen.findByText('Next →');

    fireEvent.click(screen.getByText('Next →'));
    await screen.findByText('Plant 10');
  });
});
