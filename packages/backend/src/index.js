/**
 * AllOne Garden — Backend entry point
 *
 * Starts the Express + Socket.IO server, loads plugins,
 * and optionally connects to the P2P federation network.
 */
require('dotenv').config();

// ── Security pre-flight checks ────────────────────────────────────────────────
const JWT_SECRET_VAL = process.env.JWT_SECRET;
if (!JWT_SECRET_VAL || JWT_SECRET_VAL.length < 32) {
  const msg = JWT_SECRET_VAL
    ? `JWT_SECRET is only ${JWT_SECRET_VAL.length} chars — minimum 32 required`
    : 'JWT_SECRET is not set';
  if (process.env.NODE_ENV === 'production') {
    console.error(`\n🚨 FATAL: ${msg}\n`);
    process.exit(1);
  } else {
    console.warn(`\n⚠️  Security warning: ${msg} (will cause 500s in production)\n`);
  }
}
// Initialise Redis early so the store is ready before the first request
require('./redis');

const path    = require('path');
const express = require('express');
const http    = require('http');
const socketIO = require('socket.io');
const cors    = require('cors');

const authRoutes    = require('./routes/auth');
const gardenRoutes  = require('./routes/garden');
const tradeRoutes   = require('./routes/trade');
const adminRoutes   = require('./routes/admin');
const accountRoutes = require('./routes/account');
const pluginRoutes      = require('./routes/plugins');
const { router: leaderboardRoutes } = require('./routes/leaderboard');
const chatHandler      = require('./socket/chat');
const gameHandler      = require('./socket/game');
const proximityHandler = require('./socket/proximity');
const pluginLoader = require('./plugins/loader');
const { helmetMiddleware, requestId, apiLimiter } = require('./middleware/security');
const { socketAuthMiddleware } = require('./middleware/socketAuth');

const ALLOWED_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:3000';

const app    = express();
const server = http.createServer(app);
const io     = socketIO(server, {
  cors: {
    origin: ALLOWED_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

// Make io accessible to route handlers (e.g. plugin install passes it to loader)
app.set('io', io);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmetMiddleware);
app.use(requestId);
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json({ limit: '64kb' }));   // cap body size
app.use(apiLimiter);                         // global rate limit

// ── REST routes ───────────────────────────────────────────────────────────────
app.get('/health', (req, res) =>
  res.json({ status: 'ok', timestamp: new Date(), version: '1.0.0' })
);

app.use('/api/auth',    authRoutes);
app.use('/api/garden',  gardenRoutes);
app.use('/api/trade',   tradeRoutes);
app.use('/api/admin',   adminRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/plugins',      pluginRoutes);
app.use('/api/leaderboard',  leaderboardRoutes);

// ── Socket.IO ─────────────────────────────────────────────────────────────────
const eventBus = pluginLoader.getEventBus();

// Verify JWT (or allow guest) before the 'connection' event fires
io.use(socketAuthMiddleware);

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id} (userId=${socket.userId ?? 'guest'})`);

  // Join a private room named after the userId so io.to(userId) works for
  // targeted events like garden:visitor and player:helped
  if (socket.userId) {
    socket.join(String(socket.userId));
  }

  chatHandler(socket, io);
  gameHandler(socket, io, eventBus);
  proximityHandler(socket, io);

  // Forward plugin-targeted socket events to the event bus
  socket.onAny((event, data) => {
    if (event.startsWith('plugin:')) {
      eventBus.emit(event, { socket, ...data });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    eventBus.emit('onPlayerLeave', { socketId: socket.id });
  });

  eventBus.emit('onPlayerJoin', { socketId: socket.id });
});

// ── Plugins ───────────────────────────────────────────────────────────────────
const db = require('./db');
const PLUGINS_ROOT = path.resolve(__dirname, '../../../../plugins/community');
pluginLoader.loadAll(PLUGINS_ROOT, { db, io });

// ── P2P Federation (optional) ─────────────────────────────────────────────────
if (process.env.P2P_ENABLED === 'true') {
  const federation = require('./p2p/federation');
  federation.start({ io, eventBus }).catch((err) => {
    console.error('P2P federation failed to start:', err.message);
  });
}

// ── Start server ──────────────────────────────────────────────────────────────
// Only listen when run directly (not when imported by tests)
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`🌱 AllOne Garden server running on port ${PORT}`);
    console.log(`🔗 Frontend: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
    console.log(`🔌 P2P federation: ${process.env.P2P_ENABLED === 'true' ? 'enabled' : 'disabled'}`);
  });
}

module.exports = { app, server };
