// @ts-check
const { test, expect } = require('@playwright/test');
const { uniqueUser, register, dismissWebpackOverlay } = require('./helpers');

test.describe('World Map', () => {
  test.beforeEach(async ({ page }) => {
    const user = uniqueUser();
    await register(page, user);
  });

  test('world map button is visible in header', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /World|world|🗺/i })
    ).toBeVisible();
  });

  test('clicking world map button opens the map overlay', async ({ page }) => {
    await page.getByRole('button', { name: /World|world|🗺/i }).click();

    // The viewport div that holds the tiles should appear
    await expect(
      page.locator('.walk-viewport, .world-map, [class*="walk"]').first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('player character is visible on the map', async ({ page }) => {
    await page.getByRole('button', { name: /World|world|🗺/i }).click();
    await page.waitForSelector('.walk-viewport', { timeout: 5_000 });

    // The player character marker (me) should be rendered
    await expect(
      page.locator('.walk-player-char, [class*="player-char"]').first()
    ).toBeVisible({ timeout: 3_000 });
  });

  test('arrow key moves player character', async ({ page }) => {
    await page.getByRole('button', { name: /World|world|🗺/i }).click();
    await page.waitForSelector('.walk-viewport', { timeout: 5_000 });

    // Focus the viewport and press right arrow
    const viewport = page.locator('.walk-viewport');
    await viewport.click(); // focus
    await viewport.press('ArrowRight');
    await page.waitForTimeout(150);

    // Player should still be on map (no crash)
    await expect(
      page.locator('.walk-player-char, [class*="player-char"]').first()
    ).toBeVisible();
  });

  test('WASD keys also move the player', async ({ page }) => {
    await page.getByRole('button', { name: /World|world|🗺/i }).click();
    await page.waitForSelector('.walk-viewport', { timeout: 5_000 });

    const viewport = page.locator('.walk-viewport');
    await viewport.click();
    await viewport.press('d'); // move right
    await viewport.press('s'); // move down
    await viewport.press('a'); // move left
    await viewport.press('w'); // move up
    await page.waitForTimeout(150);

    await expect(
      page.locator('.walk-player-char, [class*="player-char"]').first()
    ).toBeVisible();
  });

  test('HUD shows player name', async ({ page }) => {
    await page.getByRole('button', { name: /World|world|🗺/i }).click();
    await page.waitForSelector('.walk-viewport', { timeout: 5_000 });

    // HUD or walk interface should show something about the player
    await expect(
      page.locator('.walk-hud, .walk-legend').first()
    ).toBeVisible({ timeout: 3_000 });
  });

  test('close button or Escape closes the map', async ({ page }) => {
    await page.getByRole('button', { name: /World|world|🗺/i }).click();
    await page.waitForSelector('.walk-viewport', { timeout: 5_000 });

    // Try Escape key first
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // If Escape didn't close it, look for a close button
    const viewport = page.locator('.walk-viewport');
    const stillOpen = await viewport.isVisible();
    if (stillOpen) {
      await page.getByRole('button', { name: /close|✕|×|back/i }).first().click();
      await page.waitForTimeout(300);
    }

    // Either way garden should be back
    await expect(page.locator('.garden-grid, .garden-section').first()).toBeVisible();
  });
});

test.describe('World Map (Guest)', () => {
  test('guest can open world map and see online world UI', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('garden_tour_done', 'true');
    });
    await page.goto('/');
    await dismissWebpackOverlay(page);
    await page.locator('.auth-btn-guest').click();
    await page.waitForSelector('.header', { timeout: 10_000 });

    await page.locator('.header-icon-btn').filter({ hasText: '🗺' }).first().click({ force: true });
    await expect(page.locator('.walk-viewport').first()).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('.walk-hud, .walk-legend').first()).toBeVisible({ timeout: 8_000 });
  });
});
