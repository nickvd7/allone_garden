// @ts-check
/**
 * Korte smoke: auth-shell, tuin, inventaris in zijbalk, structures leesbaar, More-menu.
 */
const { test, expect } = require('@playwright/test');
const { uniqueUser, register, dismissWebpackOverlay, guestOrRegister } = require('./helpers');

test.describe('Smoke — game shell', () => {
  test('guest: header, world map shell, user menu', async ({ page }) => {
    await guestOrRegister(page);
    await expect(page.locator('.header')).toBeVisible({ timeout: 15_000 });

    await expect(page.locator('[data-tour="garden"]')).toBeVisible();
    await expect(page.locator('.world-map-embedded')).toBeVisible();

    await page.locator('#header-profile-btn').click();
    await expect(page.getByRole('menuitem', { name: /Plugins/i })).toBeVisible();
  });

  test('registered user: Online players heading shows count', async ({ page }) => {
    const user = uniqueUser();
    await register(page, user);
    await page.getByRole('button', { name: /Chat/i }).click();
    await expect(page.getByRole('heading', { level: 3, name: /Online players/i })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: /Online players/i })).toContainText(/\(\d+\)/);
  });
});
