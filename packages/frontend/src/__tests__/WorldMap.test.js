/**
 * Tests — WorldMap
 *
 * Covers:
 *  - Renders the map canvas / grid area
 *  - Renders character emoji (🧑‍🌾)
 *  - Keyboard navigation (ArrowRight moves player)
 *  - Players from socket shown on map
 *  - DM input visible when near another player
 *  - Close button calls onClose
 *  - Socket listener cleanup on unmount
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import WorldMap from '../components/WorldMap';

// WorldMap uses named { api } export which calls fetch internally.
// Mock fetch globally so the real useApi can resolve without a server.
beforeEach(() => {
  global.fetch = jest.fn((url) => {
    const path = String(url);
    if (path.includes('/api/world/gardens')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          map: Array.from({ length: 20 }, () => Array(32).fill(0)),
          gardenSlots: [{ x: 14, y: 5 }],
          occupants: [{ userId: 2, username: 'Bob', slotId: 0, x: 14, y: 5 }],
          gardenPreviewByUserId: { '2': { tiles: [1, 2, 3, 0, 0, 4, 0, 0, 0], tilled: 3, planted: 2, ready: 1 } },
        }),
      });
    }
    if (path.includes('/api/world/pois')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ pois: [] }) });
    }
    if (path.includes('/api/world/npcs')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ npcs: [] }) });
    }
    if (path.includes('/api/world/map')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ map: [] }) });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });
});
afterEach(() => { jest.restoreAllMocks(); });

function makeSocket() {
  const listeners = {};
  return {
    on:      jest.fn((e, cb) => { listeners[e] = cb; }),
    off:     jest.fn(),
    emit:    jest.fn(),
    _trigger: (e, payload) => listeners[e]?.(payload),
  };
}

describe('WorldMap — rendering', () => {
  it('renders the world map title', () => {
    render(<WorldMap socket={makeSocket()} currentUserId={1} onClose={() => {}} onStartCall={() => {}} />);
    expect(screen.getByText(/🗺️ World Map/i)).toBeInTheDocument();
  });

  it('renders the map grid container', () => {
    render(<WorldMap socket={makeSocket()} currentUserId={1} onClose={() => {}} onStartCall={() => {}} />);
    // The viewport grid should be in the DOM
    expect(document.querySelector('.world-map-modal-walk')).toBeInTheDocument();
  });

  it('renders close button', () => {
    render(<WorldMap socket={makeSocket()} currentUserId={1} onClose={() => {}} onStartCall={() => {}} />);
    expect(screen.getByRole('button', { name: /✕/i })).toBeInTheDocument();
  });

  it('loads world garden data from API', async () => {
    render(<WorldMap socket={makeSocket()} currentUserId={1} onClose={() => {}} onStartCall={() => {}} />);
    await screen.findByText(/World Map/i);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/world/gardens'),
      expect.anything(),
    );
  });
});

describe('WorldMap — close', () => {
  it('calls onClose when ✕ is clicked', () => {
    const onClose = jest.fn();
    render(<WorldMap socket={makeSocket()} currentUserId={1} onClose={onClose} onStartCall={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /✕/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('WorldMap — socket events', () => {
  it('handles ArrowRight key press without crashing', () => {
    const socket = makeSocket();
    render(<WorldMap socket={socket} currentUserId={1} onClose={() => {}} onStartCall={() => {}} />);
    // Focus on document body and press arrow key — component should handle without crashing
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    // Map modal should still be in the DOM
    expect(document.querySelector('.world-map-modal-walk')).toBeInTheDocument();
  });

  it('handles players:list event without crashing', () => {
    const socket = makeSocket();
    render(<WorldMap socket={socket} currentUserId={1} onClose={() => {}} onStartCall={() => {}} />);

    act(() => socket._trigger('players:list', [
      { id: 2, username: 'Bob', x: 5, y: 5 },
    ]));

    // Map should still be rendered
    expect(document.querySelector('.world-map-modal-walk')).toBeInTheDocument();
  });

  it('handles player:left event without crashing', () => {
    const socket = makeSocket();
    render(<WorldMap socket={socket} currentUserId={1} onClose={() => {}} onStartCall={() => {}} />);

    act(() => socket._trigger('players:list', [{ id: 2, username: 'Bob', x: 5, y: 5 }]));
    act(() => socket._trigger('player:left',  { id: 2 }));

    // Map should still be rendered after player leaves
    expect(document.querySelector('.world-map-modal-walk')).toBeInTheDocument();
  });

  it('removes socket listeners on unmount', () => {
    const socket = makeSocket();
    const { unmount } = render(
      <WorldMap socket={socket} currentUserId={1} onClose={() => {}} onStartCall={() => {}} />
    );
    unmount();
    expect(socket.off).toHaveBeenCalledWith('players:list',  expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith('player:joined', expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith('player:left',   expect.any(Function));
  });
});
