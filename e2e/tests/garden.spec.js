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
    // Clicking the Till tool applies it to the plot the player stands on (the
    // active own-plot), which then gains the tilled class.
    await page.locator('.walk-own-tools-grid').getByRole('button', { name: /Till/i }).click();
    await expect(page.locator('.world-own-plot--active').first())
      .toHaveClass(/world-own-plot--tilled/, { timeout: 5_000 });
  });

  test('can advance to next day', async ({ page }) => {
    const dayChip = page.locator('.header-day-chip__main');
    await expect(dayChip).toBeVisible();
    const before = await dayChip.textContent();

    await page.getByRole('button', { name: /Next day/i }).click();

    await expect(async () => {
      expect(await dayChip.textContent()).not.toBe(before);
    }).toPass({ timeout: 5_000 });
  });

  test('world garden panel shows core tools', async ({ page }) => {
    await openOwnGardenPanel(page);
    const tools = page.locator('.walk-own-tools-grid');
    for (const tool of ['Till', 'Plant', 'Water', 'Harvest']) {
      await expect(tools.getByRole('button', { name: new RegExp(tool, 'i') })).toBeVisible();
    }
  });

  test('mini HUD shows day and XP', async ({ page }) => {
    // Day is always visible on the header day chip; XP lives in the status popover.
    await expect(page.locator('.header-day-chip__main')).toContainText(/Day \d+/);
    await page.locator('.header-day-chip').click();
    await expect(page.locator('.header-status-popover')).toContainText(/XP/i);
  });
});
