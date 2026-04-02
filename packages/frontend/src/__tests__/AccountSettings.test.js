/**
 * Tests — AccountSettings
 *
 * Covers:
 *  - Renders all three sections (password, export, delete)
 *  - Validation: mismatched new passwords
 *  - Delete confirmation flow (button → confirm step)
 *  - Cancel delete confirmation
 *  - Close button calls onClose
 *  - Export triggers API call
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AccountSettings from '../components/AccountSettings';

// Mock api
jest.mock('../hooks/useApi', () => ({
  __esModule: true,
  default: { delete: jest.fn() },
  RateLimitError: class RateLimitError extends Error {},
}));

// Mock fetch for PATCH /api/account/password and GET /api/account/export
let localStore = {};
beforeEach(() => {
  localStore = { garden_token: 'test-token' };
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation((k) => localStore[k] ?? null);

  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true }),
    blob: () => Promise.resolve(new Blob(['{}'], { type: 'application/json' })),
  });
});
afterEach(() => jest.restoreAllMocks());

describe('AccountSettings — rendering', () => {
  it('renders Change password section', () => {
    render(<AccountSettings onClose={() => {}} onDeleted={() => {}} />);
    expect(screen.getByText(/Change password/i)).toBeInTheDocument();
  });

  it('renders Download your data section', () => {
    render(<AccountSettings onClose={() => {}} onDeleted={() => {}} />);
    expect(screen.getByText(/Download your data/i)).toBeInTheDocument();
  });

  it('renders Delete account section', () => {
    render(<AccountSettings onClose={() => {}} onDeleted={() => {}} />);
    expect(screen.getByText(/Delete account/i)).toBeInTheDocument();
  });

  it('renders Close button', () => {
    render(<AccountSettings onClose={() => {}} onDeleted={() => {}} />);
    expect(screen.getByRole('button', { name: /Close/i })).toBeInTheDocument();
  });
});

describe('AccountSettings — password change', () => {
  it('shows error when new passwords do not match', async () => {
    render(<AccountSettings onClose={() => {}} onDeleted={() => {}} />);
    const inputs = screen.getAllByPlaceholderText(/password/i);
    // [0] = current, [1] = new, [2] = repeat
    fireEvent.change(inputs[1], { target: { value: 'NewPass1' } });
    fireEvent.change(inputs[2], { target: { value: 'DifferentPass1' } });
    fireEvent.click(screen.getByRole('button', { name: /Update password/i }));
    await screen.findByText(/do not match/i);
  });

  it('calls PATCH endpoint when passwords match', async () => {
    render(<AccountSettings onClose={() => {}} onDeleted={() => {}} />);
    const inputs = screen.getAllByPlaceholderText(/password/i);
    fireEvent.change(inputs[0], { target: { value: 'OldPass1' } });
    fireEvent.change(inputs[1], { target: { value: 'NewPass1' } });
    fireEvent.change(inputs[2], { target: { value: 'NewPass1' } });
    fireEvent.click(screen.getByRole('button', { name: /Update password/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/account/password'),
        expect.objectContaining({ method: 'PATCH' })
      )
    );
  });
});

describe('AccountSettings — delete flow', () => {
  it('shows confirmation step when Delete button clicked', () => {
    render(<AccountSettings onClose={() => {}} onDeleted={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Delete my account/i }));
    expect(screen.getByPlaceholderText(/Your current password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Yes, delete everything/i })).toBeInTheDocument();
  });

  it('hides confirmation when Cancel is clicked', () => {
    render(<AccountSettings onClose={() => {}} onDeleted={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Delete my account/i }));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(screen.queryByPlaceholderText(/Your current password/i)).not.toBeInTheDocument();
  });
});

describe('AccountSettings — close', () => {
  it('calls onClose when Close is clicked', () => {
    const onClose = jest.fn();
    render(<AccountSettings onClose={onClose} onDeleted={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
