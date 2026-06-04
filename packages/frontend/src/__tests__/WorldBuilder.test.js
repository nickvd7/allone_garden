/**
 * Tests — WorldBuilder component
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WorldBuilder from '../components/WorldBuilder';

import api from '../hooks/useApi';

// Mock api
jest.mock('../hooks/useApi', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue(null),
    put: jest.fn().mockResolvedValue({ success: true }),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue(null); // no custom map
  api.put.mockResolvedValue({ success: true });
});

// ── Render ────────────────────────────────────────────────────────────────────
describe('WorldBuilder — render', () => {
  it('renders the heading', async () => {
    render(<WorldBuilder onClose={() => {}} />);
    await screen.findByText(/World Builder/i);
  });

  it('renders the tile palette buttons', async () => {
    render(<WorldBuilder onClose={() => {}} />);
    // Wait for initial load to settle
    await screen.findByText(/No custom map on server/i);
    expect(screen.getByText(/🌿 Grass/i)).toBeInTheDocument();
    expect(screen.getByText(/🟤 Path/i)).toBeInTheDocument();
    expect(screen.getByText(/🌊 Water/i)).toBeInTheDocument();
    expect(screen.getByText(/🌲 Tree/i)).toBeInTheDocument();
    expect(screen.getByText(/🏡 Garden/i)).toBeInTheDocument();
  });

  it('renders 32×20 = 640 grid cells', async () => {
    render(<WorldBuilder onClose={() => {}} />);
    await screen.findByRole('grid');
    const cells = screen.getAllByRole('gridcell');
    expect(cells).toHaveLength(32 * 20);
  });

  it('renders Save, Load, and Reset buttons', async () => {
    render(<WorldBuilder onClose={() => {}} />);
    await screen.findByLabelText(/Save map/i);
    expect(screen.getByLabelText(/Save map/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Load map/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Reset map/i)).toBeInTheDocument();
  });

  it('renders inline without overlay when inline=true', async () => {
    const { container } = render(<WorldBuilder inline />);
    await screen.findByText(/World Builder/i);
    // No fixed-overlay div when inline
    const overlay = container.querySelector('[style*="position: fixed"]');
    expect(overlay).toBeNull();
  });
});

// ── Load ──────────────────────────────────────────────────────────────────────
describe('WorldBuilder — load from server', () => {
  it('shows status when no custom map on server', async () => {
    api.get.mockResolvedValue(null);
    render(<WorldBuilder onClose={() => {}} />);
    await screen.findByText(/No custom map on server/i);
  });

  it('shows "Map loaded" when server returns a map', async () => {
    const fakeMap = Array.from({ length: 14 }, () => Array(22).fill(0));
    api.get.mockResolvedValue({ map: fakeMap, gardenSlots: [] });
    render(<WorldBuilder onClose={() => {}} />);
    await screen.findByText(/Map loaded from server/i);
  });
});

// ── Palette selection ─────────────────────────────────────────────────────────
describe('WorldBuilder — palette selection', () => {
  it('selects a tile type on click', async () => {
    render(<WorldBuilder onClose={() => {}} />);
    await screen.findByText(/No custom map on server/i);
    const pathBtn = screen.getByText(/🟤 Path/i);
    fireEvent.click(pathBtn);
    expect(pathBtn).toBeInTheDocument();
  });
});

// ── Reset ─────────────────────────────────────────────────────────────────────
describe('WorldBuilder — reset', () => {
  it('shows reset status message', async () => {
    render(<WorldBuilder onClose={() => {}} />);
    // Wait until the initial load is done and the button is enabled
    await waitFor(() => expect(screen.getByLabelText(/Reset map/i)).not.toBeDisabled());
    fireEvent.click(screen.getByLabelText(/Reset map/i));
    await screen.findByText(/Reset to default map/i);
  });
});

// ── Save ──────────────────────────────────────────────────────────────────────
describe('WorldBuilder — save', () => {
  it('calls api.put with map and gardenSlots on save', async () => {
    render(<WorldBuilder onClose={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText(/Save map/i)).not.toBeDisabled());
    fireEvent.click(screen.getByLabelText(/Save map/i));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/admin/world',
      expect.objectContaining({
        map: expect.any(Array),
        gardenSlots: expect.any(Array),
      })
    ));
  });

  it('shows success message after save', async () => {
    render(<WorldBuilder onClose={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText(/Save map/i)).not.toBeDisabled());
    fireEvent.click(screen.getByLabelText(/Save map/i));
    await screen.findByText(/Map saved/i);
  });

  it('shows error message when save fails', async () => {
    api.put.mockRejectedValue(new Error('Network error'));
    render(<WorldBuilder onClose={() => {}} />);
    // Wait until the initial load is done and button is enabled
    await waitFor(() => expect(screen.getByLabelText(/Save map/i)).not.toBeDisabled());
    fireEvent.click(screen.getByLabelText(/Save map/i));
    await screen.findByText(/Save failed/i);
  });
});

// ── Close ─────────────────────────────────────────────────────────────────────
describe('WorldBuilder — close button', () => {
  it('calls onClose when ✕ is clicked', async () => {
    const onClose = jest.fn();
    render(<WorldBuilder onClose={onClose} />);
    await screen.findByText('✕');
    fireEvent.click(screen.getByText('✕'));
    expect(onClose).toHaveBeenCalled();
  });
});
