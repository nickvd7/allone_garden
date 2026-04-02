// @ts-check
/**
 * Korte smoke: auth-shell, tuin, inventaris in zijbalk, structures leesbaar, More-menu.
 */
const { test, expect } = require('@playwright/test');
const { uniqueUser, register, dismissWebpackOverlay } = require('./helpers');

test.describe('Smoke — game shell', () => {
  test('guest: header, garden, tools, structures, sidebar inventory, More menu', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('garden_tour_done', 'true');
    });
    await page.goto('/');
    await dismissWebpackOverlay(page);
    await page.getByRole('button', { name: /Play as Guest/i }).click();
    await expect(page.locator('.header')).toBeVisible({ timeout: 15_000 });

    await expect(page.locator('.garden-grid')).toBeVisible();
    await expect(page.locator('[data-tour="tools"]')).toBeVisible();
    await expect(page.locator('[data-tour="structures"]')).toBeVisible();
    await expect(page.locator('[data-tour="inventory"]')).toBeVisible();
    await expect(page.locator('.structures-panel')).toBeVisible();

    await page.getByRole('button', { name: /More/i }).click();
    await expect(page.getByRole('menuitem', { name: /Scores/i })).toBeVisible();
  });

  test('registered user: Online players heading shows count', async ({ page }) => {
    const user = uniqueUser();
    await register(page, user);
    await expect(page.getByRole('heading', { level: 3, name: /Online players/i })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: /Online players/i })).toContainText(/\(\d+\)/);
  });
});
