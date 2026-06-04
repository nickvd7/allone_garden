/** Live walker positions (in-memory, per server process). */

const positions = new Map();

function setPosition(userId, data) {
  if (!userId) return;
  positions.set(String(userId), {
    userId: String(userId),
    username: data.username || 'Player',
    x: data.x,
    y: data.y,
    updatedAt: Date.now(),
  });
}

function removePosition(userId) {
  if (userId) positions.delete(String(userId));
}

function getAllPositions() {
  return Array.from(positions.values());
}

function getSnapshot() {
  return getAllPositions();
}

module.exports = {
  setPosition,
  removePosition,
  getAllPositions,
  getSnapshot,
};
