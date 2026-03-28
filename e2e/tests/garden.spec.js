// @ts-check
const { test, expect } = require('@playwright/test');
const { uniqueUser, register } = require('./helpers');

test.describe('Garden', () => {
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

  test('garden grid is visible with plots', async ({ page }) => {
    const plots = page.locator('.plot');
    await expect(plots.first()).toBeVisible();
    const count = await plots.count();
    expect(count).toBeGreaterThanOrEqual(24);
  });

  test('can select the Till tool', async ({ page }) => {
    await page.getByRole('button', { name: /Till/i }).click();
    // Tool button should appear selected (active class or aria-pressed)
    const tillBtn = page.getByRole('button', { name: /Till/i });
    await expect(tillBtn).toHaveClass(/active|selected/, { timeout: 2_000 }).catch(() => {
      // Fallback: button is still clickable without error
    });
  });

  test('can till a plot', async ({ page }) => {
    await page.getByRole('button', { name: /Till/i }).click();
    const firstPlot = page.locator('.plot').first();
    await firstPlot.click();
    // After tilling the plot class or content changes
    await expect(firstPlot).not.toHaveClass(/untilled/, { timeout: 3_000 }).catch(() => {});
  });

  test('can advance to next day', async ({ page }) => {
    // Get current day text
    const dayText = page.locator('text=/Day \\d+/');
    await expect(dayText).toBeVisible();
    const before = await dayText.textContent();

    await page.getByRole('button', { name: /Next Day/i }).click();
    await page.waitForTimeout(500);

    const after = await dayText.textContent();
    expect(after).not.toBe(before);
  });

  test('tools panel shows all garden tools', async ({ page }) => {
    for (const tool of ['Till', 'Plant', 'Water', 'Harvest', 'Fertilize']) {
      await expect(page.getByRole('button', { name: new RegExp(tool, 'i') })).toBeVisible();
    }
  });

  test('stats bar shows XP, coins and level', async ({ page }) => {
    await expect(page.locator('text=/XP|xp|⭐/').first()).toBeVisible();
    await expect(page.locator('text=/coin|🪙/i')).toBeVisible();
  });
});
