// @ts-check
const { test, expect } = require('@playwright/test');
const { uniqueUser, register } = require('./helpers');

test.describe('Dark Mode', () => {
  test.beforeEach(async ({ page }) => {
    const user = uniqueUser();
    await register(page, user);
  });

  test('dark mode toggle is visible in header', async ({ page }) => {
    // Moon or sun icon button should be present
    const toggle = page.locator('button[title*="mode"], button[title*="Mode"], button[aria-label*="dark"], button[aria-label*="Dark"]')
      .or(page.locator('button').filter({ hasText: /🌙|☀️/ }));
    await expect(toggle.first()).toBeVisible();
  });

  test('clicking dark mode toggle switches theme attribute', async ({ page }) => {
    const htmlEl = page.locator('html');

    // Initially no dark theme
    const initialTheme = await htmlEl.getAttribute('data-theme');
    expect(initialTheme).not.toBe('dark');

    // Click the dark mode button
    const toggleBtn = page.locator('button').filter({ hasText: /🌙|☀️/ }).first();
    await toggleBtn.click();
    await page.waitForTimeout(200);

    // data-theme should now be "dark"
    await expect(htmlEl).toHaveAttribute('data-theme', 'dark');
  });

  test('dark mode persists after page reload', async ({ page }) => {
    const toggleBtn = page.locator('button').filter({ hasText: /🌙|☀️/ }).first();
    await toggleBtn.click();
    await page.waitForTimeout(200);

    await page.reload();
    await page.waitForSelector('.header', { timeout: 15_000 });

    // Theme should still be dark after reload (localStorage persistence)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('toggling twice returns to light mode', async ({ page }) => {
    const toggleBtn = page.locator('button').filter({ hasText: /🌙|☀️/ }).first();
    await toggleBtn.click();
    await page.waitForTimeout(100);
    await toggleBtn.click();
    await page.waitForTimeout(100);

    const theme = await page.locator('html').getAttribute('data-theme');
    expect(theme).not.toBe('dark');
  });
});
