// @ts-check
const { test, expect } = require('@playwright/test');
const { uniqueUser, register } = require('./helpers');

async function toggleThemeFromProfile(page) {
  await page.locator('#header-profile-btn').click();
  await page.getByRole('menuitem', { name: /Dark mode|Light mode/i }).click();
}

test.describe('Dark Mode', () => {
  test.beforeEach(async ({ page }) => {
    const user = uniqueUser();
    await register(page, user);
  });

  test('dark mode entry is in profile menu', async ({ page }) => {
    await page.locator('#header-profile-btn').click();
    await expect(page.getByRole('menuitem', { name: /Dark mode|Light mode/i })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('profile theme toggle switches data-theme', async ({ page }) => {
    const htmlEl = page.locator('html');
    const initialTheme = await htmlEl.getAttribute('data-theme');
    expect(initialTheme).not.toBe('dark');

    await toggleThemeFromProfile(page);
    await page.waitForTimeout(200);
    await expect(htmlEl).toHaveAttribute('data-theme', 'dark');
  });

  test('dark mode persists after page reload', async ({ page }) => {
    await toggleThemeFromProfile(page);
    await page.waitForTimeout(200);

    await page.reload();
    const { dismissWebpackOverlay } = require('./helpers');
    await dismissWebpackOverlay(page);
    await page.waitForSelector('.header', { timeout: 15_000 });

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('toggling twice returns to light mode', async ({ page }) => {
    await toggleThemeFromProfile(page);
    await page.waitForTimeout(100);
    await toggleThemeFromProfile(page);
    await page.waitForTimeout(100);

    const theme = await page.locator('html').getAttribute('data-theme');
    expect(theme).not.toBe('dark');
  });
});
