/**
 * Tests — ContentCreator admin component
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ContentCreator from '../components/ContentCreator';

import api from '../hooks/useApi';

// Mock api
jest.mock('../hooks/useApi', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    put: jest.fn().mockResolvedValue({ success: true }),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  // Default: server returns empty custom lists
  api.get.mockResolvedValue([]);
  api.put.mockResolvedValue({ success: true });
});

// ── Render ────────────────────────────────────────────────────────────────────
describe('ContentCreator — render', () => {
  it('renders the four tab buttons', async () => {
    render(<ContentCreator />);
    await screen.findByText(/🌱 Plants/i);
    expect(screen.getByText(/🏗️ Structures/i)).toBeInTheDocument();
    expect(screen.getByText(/🔧 Tools/i)).toBeInTheDocument();
    expect(screen.getByText(/☁️ Weather/i)).toBeInTheDocument();
  });

  it('shows the 9 default plant names in the list', async () => {
    render(<ContentCreator />);
    await screen.findByText(/Tomato/i);
    expect(screen.getByText(/Carrot/i)).toBeInTheDocument();
    expect(screen.getByText(/Pumpkin/i)).toBeInTheDocument();
  });

  it('shows a "+ New plant" button', async () => {
    render(<ContentCreator />);
    await screen.findByText(/\+ New plant/i);
  });
});

// ── Tab switching ─────────────────────────────────────────────────────────────
describe('ContentCreator — tab switching', () => {
  it('switches to Structures tab and shows default structures', async () => {
    render(<ContentCreator />);
    await screen.findByText(/🏗️ Structures/i);
    fireEvent.click(screen.getByText(/🏗️ Structures/i));
    await screen.findByText(/Well/i);
    expect(screen.getByText(/Compost Bin/i)).toBeInTheDocument();
  });

  it('switches to Tools tab and shows default tools', async () => {
    render(<ContentCreator />);
    await screen.findByText(/🔧 Tools/i);
    fireEvent.click(screen.getByText(/🔧 Tools/i));
    await screen.findByText(/Harvest/i);
  });

  it('switches to Weather tab and shows default weather', async () => {
    render(<ContentCreator />);
    await screen.findByText(/☁️ Weather/i);
    fireEvent.click(screen.getByText(/☁️ Weather/i));
    await screen.findByText(/Sunny/i);
    expect(screen.getByText(/Drought/i)).toBeInTheDocument();
  });
});

// ── Selecting an item ─────────────────────────────────────────────────────────
describe('ContentCreator — item selection', () => {
  it('clicking a plant opens the edit form', async () => {
    render(<ContentCreator />);
    await screen.findByText(/Tomato/i);
    fireEvent.click(screen.getByText(/Tomato/i));
    await screen.findByText(/Editing a built-in item/i);
  });

  it('shows Save and Delete buttons after selecting an item', async () => {
    render(<ContentCreator />);
    await screen.findByText(/Tomato/i);
    fireEvent.click(screen.getByText(/Tomato/i));
    await screen.findByText(/💾 Save/i);
    expect(screen.getByText(/🗑️/i)).toBeInTheDocument();
  });
});

// ── New item ──────────────────────────────────────────────────────────────────
describe('ContentCreator — new item', () => {
  it('clicking "+ New plant" shows a blank form with "New custom item" hint', async () => {
    render(<ContentCreator />);
    await screen.findByText(/\+ New plant/i);
    fireEvent.click(screen.getByText(/\+ New plant/i));
    await screen.findByText(/New custom item/i);
  });
});

// ── Save ──────────────────────────────────────────────────────────────────────
describe('ContentCreator — save', () => {
  it('calls api.put when Save is clicked on a selected item', async () => {
    render(<ContentCreator />);
    await screen.findByText(/Tomato/i);
    fireEvent.click(screen.getByText(/Tomato/i));
    await screen.findByText(/💾 Save/i);
    fireEvent.click(screen.getByText(/💾 Save/i));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        '/api/admin/content/plants',
        expect.any(Array)
      )
    );
  });

  it('shows ✅ Saved! after a successful save', async () => {
    render(<ContentCreator />);
    await screen.findByText(/Tomato/i);
    fireEvent.click(screen.getByText(/Tomato/i));
    await screen.findByText(/💾 Save/i);
    fireEvent.click(screen.getByText(/💾 Save/i));
    await screen.findByText(/✅ Saved!/i);
  });

  it('shows error when save fails', async () => {
    api.put.mockRejectedValue(new Error('Network error'));
    render(<ContentCreator />);
    await screen.findByText(/Tomato/i);
    fireEvent.click(screen.getByText(/Tomato/i));
    await screen.findByText(/💾 Save/i);
    fireEvent.click(screen.getByText(/💾 Save/i));
    await screen.findByText(/Save failed/i);
  });

  it('shows validation error if ID is missing when saving a new item', async () => {
    render(<ContentCreator />);
    await screen.findByText(/\+ New plant/i);
    fireEvent.click(screen.getByText(/\+ New plant/i));
    await screen.findByText(/💾 Save/i);
    // Don't fill in any fields — slug is empty
    fireEvent.click(screen.getByText(/💾 Save/i));
    await screen.findByText(/ID \/ slug is required/i);
    expect(api.put).not.toHaveBeenCalled();
  });
});

// ── Cancel ────────────────────────────────────────────────────────────────────
describe('ContentCreator — cancel', () => {
  it('Cancel button hides the form', async () => {
    render(<ContentCreator />);
    await screen.findByText(/Tomato/i);
    fireEvent.click(screen.getByText(/Tomato/i));
    await screen.findByText(/Cancel/i);
    fireEvent.click(screen.getByText(/Cancel/i));
    await waitFor(() =>
      expect(screen.queryByText(/Editing a built-in item/i)).not.toBeInTheDocument()
    );
  });
});
