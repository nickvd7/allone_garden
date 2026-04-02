// @ts-check
const { test, expect } = require('@playwright/test');
const { uniqueUser, register, dismissWebpackOverlay } = require('./helpers');

test.describe('World Map (embedded)', () => {
  let user;

  test.beforeAll(async ({ browser }) => {
    user = uniqueUser();
    const page = await browser.newPage();
    await register(page, user);
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    const { login } = require('./helpers');
    await login(page, user);
  });

  test('embedded world map and walk viewport render', async ({ page }) => {
    await expect(page.locator('.world-map-embedded')).toBeVisible();
    await expect(page.locator('.walk-viewport').first()).toBeVisible({ timeout: 15_000 });
  });

  test('player character is visible on the map', async ({ page }) => {
    await expect(page.locator('.walk-player-char').first()).toBeVisible({ timeout: 15_000 });
  });

  test('garden tile label shows current user', async ({ page }) => {
    await expect(
      page.locator('.garden-tile-name').filter({ hasText: new RegExp(user.username, 'i') }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('d-pad moves without error', async ({ page }) => {
    await page.getByRole('button', { name: '→' }).click({ force: true });
    await page.waitForTimeout(150);
    await expect(page.locator('.walk-player-char').first()).toBeVisible();
  });
});

test.describe('World Map (Guest)', () => {
  test('guest sees embedded world after Play as Guest', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('garden_tour_done', 'true');
    });
    await page.goto('/');
    await dismissWebpackOverlay(page);
    await page.getByRole('button', { name: /Play as Guest/i }).click();
    await page.waitForSelector('.header', { timeout: 10_000 });
    await expect(page.locator('.world-map-embedded')).toBeVisible();
    await expect(page.locator('.walk-player-char').first()).toBeVisible({ timeout: 15_000 });
  });
});
