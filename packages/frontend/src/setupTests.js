// Jest setup — runs before every test file (CRA auto-loads src/setupTests.js)
import '@testing-library/jest-dom';

// Suppress i18next "not initialised" warnings during tests
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,   // return the key itself as the translation
    i18n: { changeLanguage: jest.fn() },
  }),
  Trans: ({ children }) => children,
  initReactI18next: { type: '3rdParty', init: jest.fn() },
}));

// Silence console.warn/error from React itself (e.g. act() warnings)
const originalWarn = console.warn.bind(console);
beforeAll(() => {
  console.warn = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('act(')) return;
    originalWarn(...args);
  };
});
afterAll(() => { console.warn = originalWarn; });
