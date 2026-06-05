/**
 * Tests — ChatPanel
 *
 * Covers:
 *  - Renders welcome System message on mount
 *  - Sends message via socket on Enter key
 *  - Sends message via socket on button click
 *  - Displays incoming chat:message events
 *  - Shows typing indicator
 *  - Shows error from chat:error event
 *  - Offline fallback (no socket) — message shown locally
 *  - Clears input after sending
 *  - Socket listener cleanup on unmount
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import ChatPanel from '../components/ChatPanel';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k }),
}));

// jsdom doesn't implement scrollIntoView
beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

function makeSocket() {
  const listeners = {};
  return {
    on:      jest.fn((e, cb) => { listeners[e] = cb; }),
    off:     jest.fn(),
    emit:    jest.fn(),
    _trigger: (e, payload) => listeners[e]?.(payload),
  };
}

describe('ChatPanel — initial render', () => {
  it('shows the System welcome message', () => {
    render(<ChatPanel socket={makeSocket()} username="Alice" />);
    expect(screen.getByText(/Welcome to AllOne Garden/i)).toBeInTheDocument();
  });
});

describe('ChatPanel — sending messages', () => {
  it('emits chat:message on Enter key', () => {
    const socket = makeSocket();
    render(<ChatPanel socket={socket} username="Alice" />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Hello!' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(socket.emit).toHaveBeenCalledWith('chat:message', { text: 'Hello!' });
  });

  it('emits chat:message on Send button click', () => {
    const socket = makeSocket();
    render(<ChatPanel socket={socket} username="Alice" />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Hey!' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(socket.emit).toHaveBeenCalledWith('chat:message', { text: 'Hey!' });
  });

  it('clears input after sending', () => {
    const socket = makeSocket();
    render(<ChatPanel socket={socket} username="Alice" />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Test' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('');
  });

  it('does not send empty messages', () => {
    const socket = makeSocket();
    render(<ChatPanel socket={socket} username="Alice" />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(socket.emit).not.toHaveBeenCalledWith('chat:message', expect.anything());
  });
});

describe('ChatPanel — receiving messages', () => {
  it('displays incoming chat:message event', async () => {
    const socket = makeSocket();
    render(<ChatPanel socket={socket} username="Alice" />);

    await act(async () => {
      socket._trigger('chat:message', {
        id: 99, username: 'Bob', text: 'Hi from Bob', timestamp: Date.now(),
      });
    });

    await screen.findByText('Hi from Bob');
  });
});

describe('ChatPanel — typing indicator', () => {
  it('shows typing indicator when someone is typing', () => {
    const socket = makeSocket();
    render(<ChatPanel socket={socket} username="Alice" />);

    act(() => socket._trigger('chat:typing', { username: 'Charlie', isTyping: true }));

    expect(screen.getByText(/Charlie.*typing/i)).toBeInTheDocument();
  });

  it('removes typing indicator when typing stops', async () => {
    const socket = makeSocket();
    render(<ChatPanel socket={socket} username="Alice" />);

    act(() => socket._trigger('chat:typing', { username: 'Charlie', isTyping: true }));
    act(() => socket._trigger('chat:typing', { username: 'Charlie', isTyping: false }));

    await waitFor(() =>
      expect(screen.queryByText(/Charlie.*typing/i)).not.toBeInTheDocument()
    );
  });
});

describe('ChatPanel — error handling', () => {
  it('shows error from chat:error event', async () => {
    const socket = makeSocket();
    render(<ChatPanel socket={socket} username="Alice" />);

    act(() => socket._trigger('chat:error', { message: 'Message too long' }));

    await screen.findByText(/Message too long/i);
  });
});

describe('ChatPanel — offline fallback', () => {
  it('shows message locally when no socket provided', () => {
    render(<ChatPanel socket={null} username="Alice" />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Offline msg' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('Offline msg')).toBeInTheDocument();
  });
});

describe('ChatPanel — cleanup', () => {
  it('removes socket listeners on unmount', () => {
    const socket = makeSocket();
    const { unmount } = render(<ChatPanel socket={socket} username="Alice" />);
    unmount();
    expect(socket.off).toHaveBeenCalledWith('chat:message', expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith('chat:typing', expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith('chat:error', expect.any(Function));
  });
});

describe('ChatPanel — group chat dedupe', () => {
  it('does not duplicate group messages on send + receive echo', async () => {
    const socket = makeSocket();
    render(<ChatPanel socket={socket} username="Alice" dmOnly isOpen />);

    await act(async () => {
      socket._trigger('group-chat:registered', {
        groupId: 'grp-test',
        name: 'AllOne',
        memberIds: ['1', '2'],
      });
    });

    fireEvent.click(await screen.findByText('AllOne'));

    const input = await screen.findByPlaceholderText('chat_group_placeholder');
    fireEvent.change(input, { target: { value: 'Hoi' } });
    fireEvent.click(screen.getByRole('button', { name: '➤' }));

    expect(socket.emit).toHaveBeenCalledWith('group-chat:message', { groupId: 'grp-test', text: 'Hoi' });

    await act(async () => {
      socket._trigger('group-chat:receive', {
        groupId: 'grp-test',
        from: 1,
        fromUsername: 'Alice',
        text: 'Hoi',
        timestamp: Date.now(),
      });
    });

    expect(screen.getAllByText('Hoi')).toHaveLength(1);
  });
});
