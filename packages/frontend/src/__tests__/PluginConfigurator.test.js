/**
 * Tests — PluginConfigurator component
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PluginConfigurator from '../components/PluginConfigurator';

import api from '../hooks/useApi';

// Mock api
jest.mock('../hooks/useApi', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    put: jest.fn().mockResolvedValue({ success: true }),
  },
}));

const MOCK_STATS = {
  plugins: [
    { name: 'shop', version: '1.0.0', hash: 'abc123' },
    { name: 'events', version: '2.1.0', hash: 'def456' },
  ],
  server:   { uptime: 0, uptimeFormatted: '0m', nodeVersion: 'v18', platform: 'linux', arch: 'x64' },
  memory:   { heapUsedMB: 50, heapTotalMB: 100, rssMB: 60 },
  cpu:      { load1: '0.10', load5: '0.10', cores: 4, model: 'Test' },
  database: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  if (typeof api.put !== 'function') {
    api.put = jest.fn();
  }
  api.get.mockImplementation((path) => {
    if (path === '/api/admin/stats')       return Promise.resolve(MOCK_STATS);
    if (path.includes('/config'))         return Promise.resolve({ enabled: true });
    return Promise.resolve({});
  });
  api.put.mockResolvedValue({ success: true });
});

// ── Render ────────────────────────────────────────────────────────────────────
describe('PluginConfigurator — render', () => {
  it('shows both plugin names after loading', async () => {
    render(<PluginConfigurator />);
    await screen.findByText('shop');
    expect(screen.getByText('events')).toBeInTheDocument();
  });

  it('shows empty state when no plugins loaded', async () => {
    api.get.mockResolvedValue({ ...MOCK_STATS, plugins: [] });
    render(<PluginConfigurator />);
    await screen.findByText(/No plugins loaded/i);
  });

  it('shows error when stats request fails', async () => {
    api.get.mockRejectedValue(new Error('Network error'));
    render(<PluginConfigurator />);
    await screen.findByText(/Could not load plugins/i);
  });
});

// ── Per-plugin editor ─────────────────────────────────────────────────────────
describe('PluginConfigurator — plugin editor', () => {
  jest.setTimeout(15000);
  it('shows a textarea for each plugin config', async () => {
    render(<PluginConfigurator />);
    await screen.findByText('shop');
    const textareas = screen.getAllByRole('textbox');
    // One textarea per plugin
    expect(textareas.length).toBeGreaterThanOrEqual(2);
  });

  it('fetches config for each plugin', async () => {
    render(<PluginConfigurator />);
    await screen.findByText('shop');
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/api/admin/plugins/shop/config')
    );
    expect(api.get).toHaveBeenCalledWith('/api/admin/plugins/events/config');
  });

  // Helper: wait until all plugin editors have finished loading
  async function waitForEditorsReady() {
    await waitFor(
      () => {
        const saveBtns = screen.getAllByRole('button', { name: /save/i });
        expect(saveBtns.length).toBeGreaterThanOrEqual(2);
        saveBtns.forEach((b) => expect(b).not.toBeDisabled());
      },
      { timeout: 12000 }
    );
  }

  async function clickShopSave() {
    await waitFor(() => {
      const btn = screen.getAllByRole('button', { name: /save/i })[0];
      expect(btn).not.toBeDisabled();
      fireEvent.click(btn);
    });
  }

  it('calls api.put when Save is clicked', async () => {
    render(<PluginConfigurator />);
    await waitForEditorsReady();
    await clickShopSave();
    await waitFor(
      () =>
        expect(api.put).toHaveBeenCalledWith(
          '/api/admin/plugins/shop/config',
          expect.any(Object)
        ),
      { timeout: 12000 }
    );
  });

  it('shows success message after save', async () => {
    render(<PluginConfigurator />);
    await waitForEditorsReady();
    await clickShopSave();
    await screen.findByText('✅ Saved!', {}, { timeout: 12000 });
  });

  it('shows error for invalid JSON before saving', async () => {
    render(<PluginConfigurator />);
    await waitForEditorsReady();
    const textareas = screen.getAllByRole('textbox');
    fireEvent.change(textareas[0], { target: { value: 'NOT JSON' } });
    // Re-capture save buttons in case of re-render
    await waitFor(() => {
      const saveBtns = screen.getAllByRole('button', { name: /save/i });
      fireEvent.click(saveBtns[0]);
    });
    await screen.findByText(/Invalid JSON/i);
    expect(api.put).not.toHaveBeenCalled();
  });

  it('shows error when save request fails', async () => {
    api.put.mockRejectedValue(new Error('Server error'));
    render(<PluginConfigurator />);
    await waitForEditorsReady();
    await clickShopSave();
    await screen.findByText(/Save failed/i);
  });
});
