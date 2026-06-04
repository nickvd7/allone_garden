import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { register as registerSW, unregister as unregisterSW } from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Register the service worker for PWA / offline support (iOS + Android) — but
// ONLY in production builds. In development the cache-first SW serves a stale
// bundle.js across restarts (it uses a fixed dev cache name), which makes code
// changes — and a fixed API URL — silently invisible. So in dev we actively
// unregister any previously-installed SW to clear that stale cache.
if (process.env.NODE_ENV === 'production') {
  registerSW();
} else {
  unregisterSW();
}