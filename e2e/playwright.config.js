// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/** Avoid macOS AirPlay / other daemons on 5000 — override with E2E_BACKEND_PORT / E2E_FRONTEND_PORT */
const backendPort = Number(process.env.E2E_BACKEND_PORT || 5000);
const frontendPort = Number(process.env.E2E_FRONTEND_PORT || 3000);
const backendOrigin = `http://127.0.0.1:${backendPort}`;
const frontendOrigin = `http://127.0.0.1:${frontendPort}`;

/** CRA dev server is flaky on GitHub runners (memory / WDS); CI builds once and serves static files. */
const useStaticFrontend = process.env.CI === 'true';

const frontendWebServer = useStaticFrontend
  ? {
      command: `npx serve -s ../packages/frontend/build -l tcp://127.0.0.1:${frontendPort}`,
      cwd: __dirname,
      port: frontendPort,
      timeout: 120_000,
      reuseExistingServer: false,
    }
  : {
      command: 'npm start',
      cwd: '../packages/frontend',
      port: frontendPort,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      env: {
        BROWSER: 'none',
        CI: 'false',
        PORT: String(frontendPort),
        REACT_APP_API_URL: backendOrigin,
        ESLINT_NO_DEV_ERRORS: 'true',
        TSC_COMPILE_ON_ERROR: 'true',
      },
    };

module.exports = defineConfig({
  testDir: './tests',
  timeout: 40_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,   // tests share in-memory backend state
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: frontendOrigin,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: [
    {
      // Backend in in-memory mode
      command: 'node src/index.js',
      cwd: '../packages/backend',
      port: backendPort,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: '',
        JWT_SECRET: 'e2e-test-secret-do-not-use-in-production',
        P2P_ENABLED: 'false',
        PORT: String(backendPort),
        FRONTEND_URL: frontendOrigin,
        ADMIN_USERS: 'admin_e2e',
      },
    },
    frontendWebServer,
  ],
});
