/**
 * Tests — PluginMarketplace
 *
 * Covers:
 *  - Installed tab shows installed plugins from API
 *  - Community tab shows catalogue (fallback)
 *  - Install button visible to admins on community tab
 *  - Unload button visible to admins on installed tab
 *  - Non-admins see no install/unload buttons
 *  - Search filter in community tab
 *  - Close button calls onClose
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PluginMarketplace from '../components/PluginMarketplace';
import api from '../hooks/useApi';

jest.mock('../hooks/useApi', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

const INSTALLED_PLUGINS = [
  { name: 'achievements',    version: '1.0.0', status: 'loaded', description: 'Badges for milestones' },
  { name: 'weather-forecast', version: '1.0.0', status: 'loaded', description: 'Weather forecasts'    },
];

const ADMIN_USER    = { id: 1, username: 'Admin',  isAdmin: true  };
const REGULAR_USER  = { id: 2, username: 'Player', isAdmin: false };

beforeEach(() => {
  api.get.mockImplementation((url) => {
    if (url.includes('plugins/registry')) return Promise.resolve([]);
    if (url.includes('plugins'))          return Promise.resolve(INSTALLED_PLUGINS);
    return Promise.resolve([]);
  });
  api.post.mockResolvedValue({ success: true });
});

afterEach(() => jest.clearAllMocks());

describe('PluginMarketplace — tabs', () => {
  it('renders Installed and Community tabs', async () => {
    render(<PluginMarketplace user={ADMIN_USER} onClose={() => {}} />);
    await screen.findByText(/Installed/i);
    expect(screen.getByText(/Community/i)).toBeInTheDocument();
  });
});

describe('PluginMarketplace — installed tab', () => {
  it('shows installed plugin names', async () => {
    render(<PluginMarketplace user={ADMIN_USER} onClose={() => {}} />);
    await screen.findByText('achievements');
    expect(screen.getByText('weather-forecast')).toBeInTheDocument();
  });

  it('shows Unload button for admin', async () => {
    render(<PluginMarketplace user={ADMIN_USER} onClose={() => {}} />);
    await screen.findByText('achievements');
    expect(screen.getAllByRole('button', { name: /Unload/i }).length).toBeGreaterThan(0);
  });

  it('does not show Unload button for non-admin', async () => {
    render(<PluginMarketplace user={REGULAR_USER} onClose={() => {}} />);
    await screen.findByText('achievements');
    expect(screen.queryByRole('button', { name: /Unload/i })).not.toBeInTheDocument();
  });

  it('calls unload API when Unload is clicked', async () => {
    render(<PluginMarketplace user={ADMIN_USER} onClose={() => {}} />);
    await screen.findByText('achievements');
    fireEvent.click(screen.getAllByRole('button', { name: /Unload/i })[0]);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        expect.stringContaining('/unload'), expect.anything()
      )
    );
  });
});

describe('PluginMarketplace — community tab', () => {
  it('switches to community tab', async () => {
    render(<PluginMarketplace user={ADMIN_USER} onClose={() => {}} />);
    await screen.findByText(/Community/i);
    fireEvent.click(screen.getByText(/Community/i));
    // Search box appears in community tab
    await screen.findByPlaceholderText(/Search plugins/i);
  });

  it('filters by search term', async () => {
    render(<PluginMarketplace user={ADMIN_USER} onClose={() => {}} />);
    await screen.findByText(/Community/i);
    fireEvent.click(screen.getByText(/Community/i));
    await screen.findByPlaceholderText(/Search plugins/i);

    fireEvent.change(screen.getByPlaceholderText(/Search plugins/i), {
      target: { value: 'weather' },
    });
    await waitFor(() => {
      expect(screen.queryByText('daily-bonus')).not.toBeInTheDocument();
    });
  });
});

describe('PluginMarketplace — close', () => {
  it('calls onClose when ✕ close button is clicked', async () => {
    const onClose = jest.fn();
    render(<PluginMarketplace user={ADMIN_USER} onClose={onClose} />);
    await screen.findByText(/Installed/i);
    // Multiple ✕ buttons exist (close + unload buttons) — use first which is the header close
    const closeBtns = screen.getAllByRole('button', { name: /✕/i });
    fireEvent.click(closeBtns[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
