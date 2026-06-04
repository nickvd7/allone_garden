/**
 * Create React App dev-server proxy (loaded automatically by react-scripts).
 *
 * When REACT_APP_API_URL is empty the SPA calls relative paths (/api, /socket.io).
 * This forwards those to the backend so local `npm start` works without CORS and
 * without hardcoding a port that may be taken (macOS AirPlay Receiver uses 5000,
 * so start.sh moves the backend to 5001+ and exports BACKEND_PORT).
 *
 * Note: `bash start.sh` also sets REACT_APP_API_URL to the real backend URL, in
 * which case the SPA uses absolute URLs and this proxy is simply unused.
 */
const { createProxyMiddleware } = require('http-proxy-middleware');

const BACKEND_PORT = process.env.BACKEND_PORT || '5001';
const target = `http://localhost:${BACKEND_PORT}`;

module.exports = function (app) {
  app.use(
    ['/api', '/health'],
    createProxyMiddleware({ target, changeOrigin: true })
  );
  app.use(
    '/socket.io',
    createProxyMiddleware({ target, changeOrigin: true, ws: true })
  );
};
