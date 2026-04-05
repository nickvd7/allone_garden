/**
 * Ensures guest sockets cannot drive game / plugin event-bus spam.
 */
const gameHandler = require('../src/socket/game');

describe('socket gameHandler — authentication', () => {
  function makeSocket(userId) {
    const handlers = {};
    return {
      userId,
      username: userId ? 'player1' : 'Guest',
      on(event, fn) {
        handlers[event] = fn;
      },
      emit: jest.fn(),
      broadcast: { emit: jest.fn() },
      _handlers: handlers,
    };
  }

  it('rejects game:action for guests with game:error', () => {
    const socket = makeSocket(null);
    const io = { emit: jest.fn() };
    const eventBus = { emit: jest.fn() };
    gameHandler(socket, io, eventBus);

    socket._handlers['game:action']({
      type: 'water',
      plotIndex: 0,
      payload: {},
    });

    expect(socket.emit).toHaveBeenCalledWith(
      'game:error',
      expect.objectContaining({ code: 'AUTH_REQUIRED' })
    );
    expect(socket.broadcast.emit).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('rejects game:nextday for guests', () => {
    const socket = makeSocket(null);
    const io = { emit: jest.fn() };
    const eventBus = { emit: jest.fn() };
    gameHandler(socket, io, eventBus);

    socket._handlers['game:nextday']({ currentDay: 2, weather: 'sunny' });

    expect(socket.emit).toHaveBeenCalledWith(
      'game:error',
      expect.objectContaining({ code: 'AUTH_REQUIRED' })
    );
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('allows game:action when socket.userId is set', () => {
    const socket = makeSocket(42);
    const io = { emit: jest.fn() };
    const eventBus = { emit: jest.fn() };
    gameHandler(socket, io, eventBus);

    socket._handlers['game:action']({
      type: 'water',
      plotIndex: 1,
      payload: {},
    });

    expect(socket.emit).not.toHaveBeenCalled();
    expect(socket.broadcast.emit).toHaveBeenCalled();
  });
});
