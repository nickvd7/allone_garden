// @ts-check
const { test, expect } = require('@playwright/test');
const { uniqueUser, register, openOwnGardenPanel } = require('./helpers');

test.describe('Garden Structures', () => {
  test.beforeEach(async ({ page }) => {
    const user = uniqueUser();
    await register(page, user);
    // Structures moved into the own-garden panel behind the "🔨 Build" section tab.
    await openOwnGardenPanel(page);
    await page.getByRole('button', { name: /Build/i }).click();
    await expect(page.locator('.structures-panel')).toBeVisible({ timeout: 10_000 });
  });

  test('structures modal lists well and greenhouse', async ({ page }) => {
    await expect(page.getByText(/Water Well|Well/i).first()).toBeVisible();
    await expect(page.getByText(/Greenhouse/i).first()).toBeVisible();
  });

  test('water well shows build cost', async ({ page }) => {
    await expect(page.locator('text=/50|🪙/i').first()).toBeVisible();
  });

  test('compost heap card is visible', async ({ page }) => {
    await expect(page.locator('.structure-item').filter({ hasText: /Compost/i }).first()).toBeVisible();
  });

  test('spray pests tool exists in world garden tools when panel open', async ({ page }) => {
    await expect(page.locator('.walk-own-tools-grid').getByRole('button', { name: /Spray/i })).toBeVisible();
  });
});
