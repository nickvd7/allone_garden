// @ts-check
const { test, expect } = require('@playwright/test');
const { uniqueUser, register, openOwnGardenPanel } = require('./helpers');

test.describe('Garden Structures', () => {
  test.beforeEach(async ({ page }) => {
    const user = uniqueUser();
    await register(page, user);
    await page.getByRole('button', { name: /Structures/i }).click();
    await expect(page.getByRole('heading', { name: /Structures/i })).toBeVisible({ timeout: 10_000 });
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
    await page.keyboard.press('Escape');
    await openOwnGardenPanel(page);
    await expect(page.getByRole('button', { name: /Spray/i })).toBeVisible();
  });
});
