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
const cors         = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes    = require('./routes/auth');
const gardenRoutes  = require('./routes/garden');
const tradeRoutes   = require('./routes/trade');
const adminRoutes   = require('./routes/admin');
const accountRoutes = require('./routes/account');
const pluginRoutes      = require('./routes/plugins');
const { router: leaderboardRoutes } = require('./routes/leaderboard');
const gradendexRoutes = require('./routes/gradendex');
const worldRoutes     = require('./routes/world');
const contentRoutes     = require('./routes/content');
const analyticsRoutes   = require('./routes/analytics');
const weatherRoutes     = require('./routes/weather');
const qrRoutes          = require('./routes/qr');
const recognizeRoutes   = require('./routes/recognize');
const { router: pushRouter } = require('./routes/push');
const proposalStore   = require('./state/proposalStore');
const chatHandler      = require('./socket/chat');
const gameHandler      = require('./socket/game');
const proximityHandler = require('./socket/proximity');
const playersHandler   = require('./socket/players');
const pluginLoader = require('./plugins/loader');
const { helmetMiddleware, requestId, apiLimiter, bodyLimitSmall, bodyLimitLarge } = require('./middleware/security');
const { socketAuthMiddleware } = require('./middleware/socketAuth');
const {
  parseAllowedOrigins,
  buildCorsOriginValidator,
  parseTrustProxy,
} = require('./config/networkSecurity');

const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.FRONTEND_URL);
const corsOriginValidator = buildCorsOriginValidator(ALLOWED_ORIGINS);

const app    = express();
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY, process.env.NODE_ENV));

const server = http.createServer(app);
const io     = socketIO(server, {
  cors: {
    origin: corsOriginValidator,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Make io accessible to route handlers (e.g. plugin install passes it to loader)
app.set('io', io);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmetMiddleware);
app.use(requestId);
app.use(cookieParser());
app.use(cors({ origin: corsOriginValidator, credentials: true }));
app.use(apiLimiter);                         // global rate limit

// ── REST routes ───────────────────────────────────────────────────────────────
app.get('/health', (req, res) =>
  res.json({ status: 'ok', timestamp: new Date(), version: '1.0.0' })
);

app.use('/api/auth',         bodyLimitSmall, authRoutes);
app.use('/api/garden',       bodyLimitLarge, gardenRoutes);
app.use('/api/trade',        bodyLimitSmall, tradeRoutes);
app.use('/api/admin',        bodyLimitSmall, adminRoutes);
app.use('/api/account',      bodyLimitSmall, accountRoutes);
app.use('/api/plugins',      bodyLimitSmall, pluginRoutes);
app.use('/api/leaderboard',  bodyLimitSmall, leaderboardRoutes);
app.use('/api/gradendex',    bodyLimitSmall, gradendexRoutes);
app.use('/api/world',        bodyLimitSmall, worldRoutes);
app.use('/api/content',      bodyLimitSmall, contentRoutes);
app.use('/api/analytics',    bodyLimitSmall, analyticsRoutes);
app.use('/api/weather',      bodyLimitSmall, weatherRoutes);
app.use('/api/qr',           bodyLimitSmall, qrRoutes);
app.use('/api/recognize',    bodyLimitLarge, recognizeRoutes);
app.use('/api/push',         bodyLimitSmall, pushRouter);

// ── Electron desktop mode: serve built React frontend ─────────────────────────
// When running inside the Electron desktop app (ELECTRON_MODE=1) the backend
// also serves the compiled frontend so both are reachable on the same port.
// Registered AFTER all /api/* routes so API calls are never intercepted.
if (process.env.ELECTRON_MODE === '1') {
  const frontendBuild = path.resolve(__dirname, '../../../frontend/build');
  app.use(express.static(frontendBuild));
  // SPA fallback — non-API, non-socket GET requests return index.html
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/socket.io/')) {
      res.sendFile(path.join(frontendBuild, 'index.html'));
    }
  });
}

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

  playersHandler(socket, io);
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

// ── Seed in-memory stores from DB (best-effort, non-fatal) ────────────────────
if (db.isConnected()) {
  db.query('SELECT * FROM content_proposals ORDER BY created_at ASC')
    .then((r) => proposalStore.seed(r.rows.map((row) => ({
      id:              row.id,
      type:            row.type,
      item:            row.item,
      submittedBy:     row.submitted_by,
      submittedByName: row.submitted_by_name,
      status:          row.status,
      note:            row.note || '',
      createdAt:       row.created_at,
      reviewedAt:      row.reviewed_at || null,
      revisionCount:   row.revision_count || 0,  // DB column is snake_case
    }))))
    .catch(() => {}); // table may not exist yet
}

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
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌  Port ${PORT} is already in use. Stop the other process or set PORT to a free port (e.g. PORT=5001).\n`);
      process.exit(1);
    }
    throw err;
  });
  server.listen(PORT, () => {
    console.log(`🌱 AllOne Garden server running on port ${PORT}`);
    console.log(`🔗 Frontend origins: ${ALLOWED_ORIGINS.join(', ')}`);
    console.log(`🔌 P2P federation: ${process.env.P2P_ENABLED === 'true' ? 'enabled' : 'disabled'}`);
    try {
      require('./pushScheduler').startPushScheduler();
    } catch (e) {
      console.warn('[push] scheduler:', e.message);
    }
  });
}

module.exports = { app, server };
