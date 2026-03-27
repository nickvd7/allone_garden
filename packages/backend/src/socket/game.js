/**
 * Game socket handler.
 * Relays player actions and fires events on the shared event bus
 * so plugins can react to them.
 */
module.exports = function gameHandler(socket, io, eventBus) {
  // Player performs a plot action (till / plant / water / fertilize / harvest)
  socket.on('game:action', (data) => {
    const action = {
      type: data.type,
      userId: socket.userId,
      plotIndex: data.plotIndex,
      payload: data.payload,
      timestamp: new Date(),
    };

    // Broadcast to other players on the same server
    socket.broadcast.emit('game:action', action);

    // Fire relevant game events into the plugin event bus (used by achievements, weather, etc.)
    if (eventBus) {
      const uid = socket.userId;
      if (data.type === 'plant') {
        eventBus.emit('onPlant', { userId: uid, plotIndex: data.plotIndex, plantType: data.payload?.plantType });
      } else if (data.type === 'harvest') {
        eventBus.emit('onHarvest', { userId: uid, plotIndex: data.plotIndex });
      } else if (data.type === 'water') {
        eventBus.emit('onWater', { userId: uid });
      } else if (data.type === 'fertilize') {
        eventBus.emit('onFertilize', { userId: uid });
      }
    }
  });

  // A player advances their game day
  socket.on('game:nextday', (data) => {
    const { currentDay, weather } = data;
    if (eventBus) {
      eventBus.emit('onDayChange', { userId: socket.userId, currentDay, weather });
    }
    // Inform other players that this person's day changed
    socket.broadcast.emit('player:daychange', { userId: socket.userId, currentDay, weather });
  });

  // Garden visit request
  socket.on('garden:visit', (data) => {
    io.to(data.targetUserId).emit('garden:visitor', {
      userId: socket.userId,
      username: socket.username || 'Guest',
    });
  });

  // Help action (gives XP to target)
  socket.on('player:help', (data) => {
    io.to(data.targetUserId).emit('player:helped', {
      userId: socket.userId,
      username: socket.username || 'Guest',
      amount: data.amount || 10,
    });
  });
};
