/**
 * Tests — AdminPanel
 *
 * Covers:
 *  - Renders main tab buttons
 *  - Overview tab shows stat cards from API
 *  - Players tab shows player rows
 *  - Error state when API fails
 *  - Close button calls onClose
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AdminPanel from '../components/AdminPanel';
import api from '../hooks/useApi';

// Mock all child panels that would load their own data
jest.mock('../components/WorldBuilder',       () => () => <div>WorldBuilder</div>);
jest.mock('../components/PluginConfigurator', () => () => <div>PluginConfigurator</div>);
jest.mock('../components/ContentCreator',     () => () => <div>ContentCreator</div>);
jest.mock('../components/ProposalsPanel',     () => () => <div>ProposalsPanel</div>);

jest.mock('../hooks/useApi', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

const MOCK_STATS = {
  server:   { uptimeFormatted: '1h 0m', nodeVersion: 'v18.0.0', platform: 'linux', arch: 'x64' },
  players:  { online: 5 },
  plugins:  [{ name: 'achievements', version: '1.0.0' }],
  database: { totalUsers: 42, totalGardens: 38, activeListings: 7, chatMessages: 120 },
  memory:   { heapUsedMB: 64, heapTotalMB: 256, rssMB: 128 },
  cpu:      { load1: 0.5, load5: 0.3, load15: 0.2 },
};

const MOCK_PLAYERS = {
  players: [
    { id: 1, username: 'Alice', level: 5, xp: 500, coins: 200, createdAt: new Date().toISOString() },
    { id: 2, username: 'Bob',   level: 3, xp: 300, coins: 100, createdAt: new Date().toISOString() },
  ],
};

const MOCK_USERS = {
  users: [
    { id: 1, username: 'Alice', email: 'alice@test.com', level: 5, preferred_language: 'nl', isAdmin: false },
    { id: 2, username: 'Bob', email: 'bob@test.com', level: 3, preferred_language: 'en', isAdmin: false },
  ],
  total: 2,
};

beforeEach(() => {
  api.get.mockImplementation((url) => {
    if (url.includes('stats')) return Promise.resolve(MOCK_STATS);
    if (url.includes('/users')) return Promise.resolve(MOCK_USERS);
    if (url.includes('players')) return Promise.resolve(MOCK_PLAYERS);
    if (url.includes('peers')) return Promise.resolve([]);
    if (url.includes('analytics')) return Promise.resolve({ rows: [], source: 'db' });
    if (url.includes('push/logs')) return Promise.resolve({ logs: [], note: '' });
    return Promise.resolve({});
  });
});

afterEach(() => jest.clearAllMocks());

describe('AdminPanel — tabs', () => {
  it('renders core tab buttons including Push', async () => {
    render(<AdminPanel onClose={() => {}} />);
    await screen.findByText(/📊 Overview/i);
    expect(screen.getByText(/👥 Gebruikers/i)).toBeInTheDocument();
    expect(screen.getByText(/🔌 Plugins/i)).toBeInTheDocument();
    expect(screen.getByText(/🌍 Peers/i)).toBeInTheDocument();
    expect(screen.getByText(/🔔 Push/i)).toBeInTheDocument();
  });
});

describe('AdminPanel — push tab', () => {
  it('shows push log rows when API returns logs', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('stats')) return Promise.resolve(MOCK_STATS);
      if (url.includes('/users')) return Promise.resolve(MOCK_USERS);
    if (url.includes('players')) return Promise.resolve(MOCK_PLAYERS);
      if (url.includes('peers')) return Promise.resolve([]);
      if (url.includes('analytics')) return Promise.resolve({ rows: [], source: 'db' });
      if (url.includes('push/logs')) {
        return Promise.resolve({
          logs: [
            {
              id: 1,
              created_at: '2026-03-30T12:00:00.000Z',
              title: 'Test',
              token_count: 10,
              sent: 9,
              failures: 1,
              mode: 'fcm',
              source: 'admin',
            },
          ],
        });
      }
      return Promise.resolve({});
    });
    render(<AdminPanel onClose={() => {}} />);
    await screen.findByText(/📊 Overview/i);
    fireEvent.click(screen.getByText(/🔔 Push/i));
    await screen.findByText('Test');
    expect(screen.getByText('9')).toBeInTheDocument();
  });
});

describe('AdminPanel — overview', () => {
  it('shows total players from DB stats', async () => {
    render(<AdminPanel onClose={() => {}} />);
    await screen.findByText('42');
  });

  it('shows total gardens from DB stats', async () => {
    render(<AdminPanel onClose={() => {}} />);
    await screen.findByText('38');
  });

  it('shows loaded plugin name', async () => {
    render(<AdminPanel onClose={() => {}} />);
    await screen.findByText(/achievements/i);
  });
});

describe('AdminPanel — players tab', () => {
  it('shows player usernames on Gebruikers tab', async () => {
    render(<AdminPanel onClose={() => {}} />);
    await screen.findByText(/👥 Gebruikers/i);
    fireEvent.click(screen.getByText(/👥 Gebruikers/i));
    await screen.findByText('Alice');
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });
});

describe('AdminPanel — error state', () => {
  it('shows error message when API fails', async () => {
    api.get.mockRejectedValue(new Error('Forbidden'));
    render(<AdminPanel onClose={() => {}} />);
    await screen.findByText(/Forbidden/i);
  });
});

describe('AdminPanel — close', () => {
  it('calls onClose when ✕ is clicked', async () => {
    const onClose = jest.fn();
    render(<AdminPanel onClose={onClose} />);
    await screen.findByText(/📊 Overview/i);
    fireEvent.click(screen.getByRole('button', { name: /✕/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
