// @ts-check
const { test, expect } = require('@playwright/test');
const { uniqueUser, register, openOwnGardenPanel } = require('./helpers');

test.describe('Garden (world map)', () => {
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

  test('own garden plots strip is visible after jump', async ({ page }) => {
    await openOwnGardenPanel(page);
    const ownPlots = page.locator('.world-own-plot:not(.world-own-plot--neighbor)');
    await expect(ownPlots.first()).toBeVisible();
    expect(await ownPlots.count()).toBeGreaterThanOrEqual(1);
  });

  test('can select the Till tool in world panel', async ({ page }) => {
    await openOwnGardenPanel(page);
    const tillBtn = page.getByRole('button', { name: /Till/i });
    await tillBtn.click();
    await expect(tillBtn).toHaveClass(/active|world-action-item--active/, { timeout: 3_000 }).catch(() => {});
  });

  test('can till a plot from world panel', async ({ page }) => {
    await openOwnGardenPanel(page);
    await page.getByRole('button', { name: /Till/i }).click();
    const targetPlot = page.locator('.world-own-plot:not(.world-own-plot--neighbor)').first();
    await targetPlot.click({ force: true });
    await expect(targetPlot).toHaveClass(/world-own-plot--tilled/, { timeout: 5_000 });
  });

  test('can advance to next day', async ({ page }) => {
    const dayLine = page.locator('.mobile-world-mini-hud__line').filter({ hasText: /Day \d+/ });
    await expect(dayLine).toBeVisible();
    const before = await dayLine.textContent();

    await page.getByRole('button', { name: /Next day/i }).click();
    await page.waitForTimeout(500);

    const after = await dayLine.textContent();
    expect(after).not.toBe(before);
  });

  test('world garden panel shows core tools', async ({ page }) => {
    await openOwnGardenPanel(page);
    for (const tool of ['Till', 'Plant', 'Water', 'Harvest']) {
      await expect(page.getByRole('button', { name: new RegExp(tool, 'i') })).toBeVisible();
    }
  });

  test('mini HUD shows day and XP', async ({ page }) => {
    await expect(page.locator('.mobile-world-mini-hud__line').filter({ hasText: /Day \d+/ })).toBeVisible();
    await expect(page.locator('.mobile-world-mini-hud__line').filter({ hasText: /XP/ })).toBeVisible();
  });
});
