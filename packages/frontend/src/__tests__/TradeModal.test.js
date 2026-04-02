/**
 * Tests — TradeModal
 *
 * Covers:
 *  - Renders three tab buttons (Browse, Sell, Live Prices)
 *  - Browse tab loads and shows listings
 *  - Empty state when no listings
 *  - Own listings show "Your listing" instead of Buy button
 *  - Sell tab renders crop selector and quantity/price inputs
 *  - Sell form submission calls API
 *  - Live prices tab shows "Connect to server" when socket is null
 *  - Close button calls onClose
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TradeModal from '../components/TradeModal';
import api from '../hooks/useApi';

jest.mock('../hooks/useApi', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

const MOCK_LISTINGS = [
  { id: 1, seller_id: 99, seller_name: 'Alice', crop_id: 'tomato', quantity: 5, price_per_unit: 12 },
  { id: 2, seller_id: 42, seller_name: 'Me',    crop_id: 'carrot', quantity: 3, price_per_unit: 7  },
];

const DEFAULT_PROPS = {
  inventory: { tomato: 3, carrot: 1 },
  coins: 200,
  userId: 42,
  socket: null,
  onBuy: jest.fn(),
  onClose: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('garden_token', 'test-token');
  api.get.mockResolvedValue(MOCK_LISTINGS);
  api.post.mockResolvedValue({ success: true });
});

afterEach(() => {
  localStorage.removeItem('garden_token');
  localStorage.removeItem('garden_guest_market_v1');
});

describe('TradeModal — tabs', () => {
  it('renders Browse, Sell, and Prices tabs', async () => {
    render(<TradeModal {...DEFAULT_PROPS} />);
    expect(screen.getByText(/🛒 Browse/i)).toBeInTheDocument();
    expect(screen.getByText(/📦 Sell/i)).toBeInTheDocument();
    expect(screen.getByText(/📈 Prices/i)).toBeInTheDocument();
  });

  it('shows Browse tab by default', async () => {
    render(<TradeModal {...DEFAULT_PROPS} />);
    await screen.findByText('Alice');
  });
});

describe('TradeModal — Browse tab', () => {
  it('shows listings from API', async () => {
    render(<TradeModal {...DEFAULT_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText(/🍅/)).toBeInTheDocument();
    });
  });

  it('shows "Your listing" for own listings', async () => {
    render(<TradeModal {...DEFAULT_PROPS} />);
    await screen.findByText(/Your listing/i);
  });

  it('shows Buy button for other sellers listings', async () => {
    render(<TradeModal {...DEFAULT_PROPS} />);
    await screen.findByRole('button', { name: /Buy/i });
  });

  it('shows empty state when no listings', async () => {
    api.get.mockResolvedValue([]);
    render(<TradeModal {...DEFAULT_PROPS} />);
    await screen.findByText(/Nog geen aanbod/i);
  });
});

describe('TradeModal — Sell tab', () => {
  it('shows crop selector on Sell tab', async () => {
    render(<TradeModal {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText(/📦 Sell/i));
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('submits sell form and calls API', async () => {
    render(<TradeModal {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText(/📦 Sell/i));

    // Submit with defaults
    fireEvent.click(screen.getByRole('button', { name: /List for sale/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/trade/listings', expect.any(Object))
    );
  });
});

describe('TradeModal — Live Prices tab', () => {
  it('shows "Connect to server" message when socket is null', async () => {
    render(<TradeModal {...DEFAULT_PROPS} socket={null} />);
    fireEvent.click(screen.getByText(/📈 Prices/i));
    expect(screen.getByText(/Connect to server/i)).toBeInTheDocument();
  });
});

describe('TradeModal — close', () => {
  it('calls onClose when ✕ is clicked', () => {
    const onClose = jest.fn();
    render(<TradeModal {...DEFAULT_PROPS} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /✕/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('TradeModal — guest (no token)', () => {
  beforeEach(() => {
    localStorage.removeItem('garden_token');
    localStorage.removeItem('garden_guest_market_v1');
  });

  it('shows local market banner and NPC listings without API', async () => {
    render(
      <TradeModal
        {...DEFAULT_PROPS}
        userId={0}
        onSellDeduct={jest.fn()}
      />
    );
    await screen.findByText(/Lokale markt/i);
    const npcRows = await screen.findAllByText(/Reizende handelaar/i);
    expect(npcRows.length).toBeGreaterThan(0);
    expect(api.get).not.toHaveBeenCalled();
  });
});
