// Jest setup — runs before every test file (CRA auto-loads src/setupTests.js)
import '@testing-library/jest-dom';

// JSDOM: matchMedia used by WorldMap touch layout detection
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// JSDOM: scrollIntoView may be missing or incomplete (WorldMap DM panel)
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = jest.fn();
}

// Real i18n so t() resolves keys from locales (en fallback). Factory runs after hoist;
// require config first so i18next is initialised before useTranslation runs.
jest.mock('react-i18next', () => {
  require('./i18n/config');
  const i18n = require('i18next');
  const actual = jest.requireActual('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (...args) => i18n.t(...args),
      i18n,
    }),
  };
});

// Silence console.warn/error from React itself (e.g. act() warnings)
const originalWarn = console.warn.bind(console);
beforeAll(() => {
  console.warn = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('act(')) return;
    originalWarn(...args);
  };
});
afterAll(() => { console.warn = originalWarn; });
