// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 40_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,   // tests share in-memory backend state
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: 'http://localhost:3000',
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
      port: 5000,
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: '',
        JWT_SECRET: 'e2e-test-secret-do-not-use-in-production',
        P2P_ENABLED: 'false',
        PORT: '5000',
        FRONTEND_URL: 'http://localhost:3000',
        ADMIN_USERS: 'admin_e2e',
      },
    },
    {
      // Frontend dev server
      command: 'npm start',
      cwd: '../packages/frontend',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      env: {
        BROWSER: 'none',
        CI: 'false',
        REACT_APP_API_URL: 'http://localhost:5000',
      },
    },
  ],
});
