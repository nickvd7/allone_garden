/**
 * Tests — Inventory
 *
 * Covers:
 *  - Renders items from inventory prop
 *  - Shows emoji and count for each item
 *  - Sell button present for items with count > 0
 *  - No sell button for items with count = 0
 *  - Sell button calls onSell with correct (id, qty, price)
 *  - Unknown item falls back to ❓
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Inventory from '../components/Inventory';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k }),
}));

const MOCK_INVENTORY = {
  tomato:  3,
  carrot:  1,
  radish:  0,
};

describe('Inventory — rendering', () => {
  it('renders an entry for each inventory item', () => {
    render(<Inventory inventory={MOCK_INVENTORY} onSell={() => {}} />);
    expect(screen.getByText('×3')).toBeInTheDocument();
    expect(screen.getByText('×1')).toBeInTheDocument();
    expect(screen.getByText('×0')).toBeInTheDocument();
  });

  it('shows tomato emoji', () => {
    render(<Inventory inventory={{ tomato: 1 }} onSell={() => {}} />);
    expect(screen.getByText('🍅')).toBeInTheDocument();
  });

  it('shows carrot emoji', () => {
    render(<Inventory inventory={{ carrot: 2 }} onSell={() => {}} />);
    expect(screen.getByText('🥕')).toBeInTheDocument();
  });

  it('shows ❓ for unknown item', () => {
    render(<Inventory inventory={{ mystery: 1 }} onSell={() => {}} />);
    expect(screen.getByText('❓')).toBeInTheDocument();
  });

  it('renders the inventory heading', () => {
    render(<Inventory inventory={{}} onSell={() => {}} />);
    expect(screen.getByText(/🧺/)).toBeInTheDocument();
  });
});

describe('Inventory — sell button', () => {
  it('shows Sell button for items with count > 0', () => {
    render(<Inventory inventory={{ tomato: 3 }} onSell={() => {}} />);
    expect(screen.getByRole('button', { name: /Sell/i })).toBeInTheDocument();
  });

  it('does not show Sell button for items with count = 0', () => {
    render(<Inventory inventory={{ radish: 0 }} onSell={() => {}} />);
    expect(screen.queryByRole('button', { name: /Sell/i })).not.toBeInTheDocument();
  });

  it('calls onSell with correct arguments', () => {
    const onSell = jest.fn();
    render(<Inventory inventory={{ tomato: 3 }} onSell={onSell} />);
    fireEvent.click(screen.getByRole('button', { name: /Sell/i }));
    // PLANT_INFO.tomato.sellPrice = 10, qty = 1
    expect(onSell).toHaveBeenCalledWith('tomato', 1, 10);
  });

  it('calls onSell for carrot with correct price', () => {
    const onSell = jest.fn();
    render(<Inventory inventory={{ carrot: 2 }} onSell={onSell} />);
    fireEvent.click(screen.getByRole('button', { name: /Sell/i }));
    expect(onSell).toHaveBeenCalledWith('carrot', 1, 6);
  });
});

describe('Inventory — empty', () => {
  it('renders nothing in the grid when inventory is empty', () => {
    const { container } = render(<Inventory inventory={{}} onSell={() => {}} />);
    const grid = container.querySelector('.inventory-grid');
    expect(grid?.children.length ?? 0).toBe(0);
  });
});
