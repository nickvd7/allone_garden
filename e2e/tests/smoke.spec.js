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

  test('registered user: online count shows in world status popover', async ({ page }) => {
    const user = uniqueUser();
    await register(page, user);
    // Online player count moved into the header world-status popover ("👥 N online").
    await page.locator('.header-day-chip').click();
    const popover = page.locator('.header-status-popover');
    await expect(popover).toBeVisible();
    await expect(popover).toContainText(/\d+\s*online/i);
  });
});
