/**
 * Tests — SeasonBanner
 *
 * Covers:
 *  - Renders nothing until socket data arrives
 *  - Listens on plugin:seasons:update and plugin:seasons:data
 *  - Emits plugin:seasons:request on mount
 *  - Displays season name, days left, yield multiplier
 *  - Displays bonus and penalty crops
 *  - Cleans up socket listeners on unmount
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import SeasonBanner from '../components/SeasonBanner';

function makeSocket() {
  const listeners = {};
  return {
    on:   jest.fn((event, cb) => { listeners[event] = cb; }),
    off:  jest.fn(),
    emit: jest.fn(),
    _trigger: (event, payload) => listeners[event]?.(payload),
  };
}

const SPRING_DATA = {
  season: 'Spring', emoji: '🌸', daysLeft: 5,
  bonusCrops: ['tomato'], penaltyCrops: [],
  yieldMult: 1.2,
};

describe('SeasonBanner — initial render', () => {
  it('renders nothing when no socket data yet', () => {
    const { container } = render(<SeasonBanner socket={makeSocket()} currentDay={1} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when socket is null', () => {
    const { container } = render(<SeasonBanner socket={null} currentDay={1} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('SeasonBanner — after data arrives', () => {
  it('displays season name after plugin:seasons:update event', () => {
    const socket = makeSocket();
    render(<SeasonBanner socket={socket} currentDay={1} />);
    act(() => socket._trigger('plugin:seasons:update', SPRING_DATA));
    expect(screen.getByText(/Spring/)).toBeInTheDocument();
  });

  it('displays season name after plugin:seasons:data event', () => {
    const socket = makeSocket();
    render(<SeasonBanner socket={socket} currentDay={1} />);
    act(() => socket._trigger('plugin:seasons:data', { ...SPRING_DATA, season: 'Summer', emoji: '☀️' }));
    expect(screen.getByText(/Summer/)).toBeInTheDocument();
  });

  it('displays days left', () => {
    const socket = makeSocket();
    render(<SeasonBanner socket={socket} currentDay={1} />);
    act(() => socket._trigger('plugin:seasons:update', SPRING_DATA));
    expect(screen.getByText(/5 days left/i)).toBeInTheDocument();
  });

  it('shows "+20% yield" when yieldMult=1.2', () => {
    const socket = makeSocket();
    render(<SeasonBanner socket={socket} currentDay={1} />);
    act(() => socket._trigger('plugin:seasons:update', SPRING_DATA));
    expect(screen.getByText(/\+20% yield/i)).toBeInTheDocument();
  });

  it('shows "−10% yield" when yieldMult=0.9', () => {
    const socket = makeSocket();
    render(<SeasonBanner socket={socket} currentDay={1} />);
    act(() => socket._trigger('plugin:seasons:update', { ...SPRING_DATA, yieldMult: 0.9 }));
    expect(screen.getByText(/−10% yield/i)).toBeInTheDocument();
  });

  it('hides yield badge when yieldMult === 1', () => {
    const socket = makeSocket();
    render(<SeasonBanner socket={socket} currentDay={1} />);
    act(() => socket._trigger('plugin:seasons:update', { ...SPRING_DATA, yieldMult: 1 }));
    expect(screen.queryByText(/% yield/i)).not.toBeInTheDocument();
  });

  it('displays bonus crop', () => {
    const socket = makeSocket();
    render(<SeasonBanner socket={socket} currentDay={1} />);
    act(() => socket._trigger('plugin:seasons:update', SPRING_DATA));
    expect(screen.getByText(/tomato/i)).toBeInTheDocument();
  });

  it('displays penalty crop', () => {
    const socket = makeSocket();
    render(<SeasonBanner socket={socket} currentDay={1} />);
    act(() => socket._trigger('plugin:seasons:update', { ...SPRING_DATA, penaltyCrops: ['carrot'] }));
    expect(screen.getByText(/carrot/i)).toBeInTheDocument();
  });

  it('shows "1 day left" (singular)', () => {
    const socket = makeSocket();
    render(<SeasonBanner socket={socket} currentDay={1} />);
    act(() => socket._trigger('plugin:seasons:update', { ...SPRING_DATA, daysLeft: 1 }));
    expect(screen.getByText(/1 day left/i)).toBeInTheDocument();
  });
});

describe('SeasonBanner — socket lifecycle', () => {
  it('emits plugin:seasons:request on mount', () => {
    const socket = makeSocket();
    render(<SeasonBanner socket={socket} currentDay={3} />);
    expect(socket.emit).toHaveBeenCalledWith('plugin:seasons:request', { currentDay: 3 });
  });

  it('calls socket.off on unmount', () => {
    const socket = makeSocket();
    const { unmount } = render(<SeasonBanner socket={socket} currentDay={1} />);
    unmount();
    expect(socket.off).toHaveBeenCalledWith('plugin:seasons:update', expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith('plugin:seasons:data', expect.any(Function));
  });
});
