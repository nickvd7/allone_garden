/**
 * Tests — PlayersPanel
 *
 * Covers:
 *  - Renders demo players when no socket
 *  - Updates list on players:list event
 *  - Adds player on player:joined event
 *  - Removes player on player:left event
 *  - Visit button emits garden:visit + calls onVisit
 *  - Help button emits player:help + calls onHelp
 *  - Trade button calls onTrade
 *  - Shows player count in heading
 *  - Socket listener cleanup on unmount
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import PlayersPanel from '../components/PlayersPanel';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k }),
}));

function makeSocket() {
  const listeners = {};
  return {
    on:      jest.fn((e, cb) => { listeners[e] = cb; }),
    off:     jest.fn(),
    emit:    jest.fn(),
    _trigger: (e, payload) => listeners[e]?.(payload),
  };
}

const DEMO_PLAYER = { id: 10, username: 'TestUser', level: 5, server: 'local' };

describe('PlayersPanel — no socket (demo)', () => {
  it('renders demo player names', () => {
    render(<PlayersPanel socket={null} />);
    expect(screen.getByText('GardenGuru')).toBeInTheDocument();
    expect(screen.getByText('PlantLover')).toBeInTheDocument();
  });

  it('shows player count', () => {
    render(<PlayersPanel socket={null} />);
    expect(screen.getByText(/\(3\)/)).toBeInTheDocument();
  });
});

describe('PlayersPanel — socket events', () => {
  it('replaces demo players on players:list event', () => {
    const socket = makeSocket();
    render(<PlayersPanel socket={socket} />);

    act(() => socket._trigger('players:list', [DEMO_PLAYER]));

    expect(screen.queryByText('GardenGuru')).not.toBeInTheDocument();
    expect(screen.getByText('TestUser')).toBeInTheDocument();
  });

  it('adds player on player:joined', () => {
    const socket = makeSocket();
    render(<PlayersPanel socket={socket} />);
    act(() => socket._trigger('players:list', []));
    act(() => socket._trigger('player:joined', DEMO_PLAYER));
    expect(screen.getByText('TestUser')).toBeInTheDocument();
  });

  it('removes player on player:left', () => {
    const socket = makeSocket();
    render(<PlayersPanel socket={socket} />);
    act(() => socket._trigger('players:list', [DEMO_PLAYER]));
    act(() => socket._trigger('player:left', { id: 10 }));
    expect(screen.queryByText('TestUser')).not.toBeInTheDocument();
  });

  it('deduplicates on re-join', () => {
    const socket = makeSocket();
    render(<PlayersPanel socket={socket} />);
    act(() => socket._trigger('players:list', [DEMO_PLAYER]));
    act(() => socket._trigger('player:joined', DEMO_PLAYER)); // same id
    // Should still show only once
    expect(screen.getAllByText('TestUser').length).toBe(1);
  });

  it('shows zero count when list is only virtual users', () => {
    const socket = makeSocket();
    render(<PlayersPanel socket={socket} />);
    act(() =>
      socket._trigger('players:list', [
        { id: 'npc:1', username: 'Bot', virtual: true },
        { id: 'npc:2', username: 'NPC', virtual: true },
      ]),
    );
    expect(screen.getByText(/\(0\)/)).toBeInTheDocument();
    expect(screen.queryByText('Bot')).not.toBeInTheDocument();
  });

  it('excludes current user from list', () => {
    const socket = makeSocket();
    render(<PlayersPanel socket={socket} currentUserId={10} />);
    act(() => socket._trigger('players:list', [DEMO_PLAYER, { id: 11, username: 'Other', level: 1 }]));
    expect(screen.queryByText('TestUser')).not.toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.getByText(/\(1\)/)).toBeInTheDocument();
  });
});

describe('PlayersPanel — actions', () => {
  it('emits garden:visit and calls onVisit on Visit click', () => {
    const socket   = makeSocket();
    const onVisit  = jest.fn();
    render(<PlayersPanel socket={socket} onVisit={onVisit} />);
    act(() => socket._trigger('players:list', [DEMO_PLAYER]));

    // title is t('visit') → 'visit' (i18n mock returns key)
    fireEvent.click(screen.getByTitle('visit'));
    expect(socket.emit).toHaveBeenCalledWith('garden:visit', { targetUserId: 10 });
    expect(onVisit).toHaveBeenCalledWith(DEMO_PLAYER);
  });

  it('emits player:help and calls onHelp on Help click', () => {
    const socket  = makeSocket();
    const onHelp  = jest.fn();
    render(<PlayersPanel socket={socket} onHelp={onHelp} />);
    act(() => socket._trigger('players:list', [DEMO_PLAYER]));

    fireEvent.click(screen.getByTitle('help'));
    expect(socket.emit).toHaveBeenCalledWith('player:help', { targetUserId: 10, amount: 10 });
    expect(onHelp).toHaveBeenCalledWith(DEMO_PLAYER);
  });

  it('calls onTrade on Trade click', () => {
    const socket  = makeSocket();
    const onTrade = jest.fn();
    render(<PlayersPanel socket={socket} onTrade={onTrade} />);
    act(() => socket._trigger('players:list', [DEMO_PLAYER]));

    fireEvent.click(screen.getByTitle('trade'));
    expect(onTrade).toHaveBeenCalledWith(DEMO_PLAYER);
  });
});

describe('PlayersPanel — cleanup', () => {
  it('removes socket listeners on unmount', () => {
    const socket = makeSocket();
    const { unmount } = render(<PlayersPanel socket={socket} />);
    unmount();
    expect(socket.off).toHaveBeenCalledWith('players:list',   expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith('player:joined',  expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith('player:left',    expect.any(Function));
  });
});
