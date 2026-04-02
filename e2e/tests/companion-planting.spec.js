// @ts-check
/**
 * Companion-planting op de huidige UI: eigen tuin via wereldkaart (mini 3×3-raster).
 * De volledige companion-legenda / 💚-indicatoren bestaan alleen in de legacy Garden-grid;
 * hier verifiëren we dat gewassen die in defaultContent als goede buren gelden (tomaat ↔ wortel)
 * op twee aangrenzende vakken geplant kunnen worden, met zichtbare gewas-emoji’s.
 */
const { test, expect } = require('@playwright/test');
const { uniqueUser, register, openOwnGardenPanel } = require('./helpers');

test.describe('Companion planting (world map)', () => {
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

  function ownMiniPlots(page) {
    return page.locator('.world-own-plot:not(.world-own-plot--neighbor)');
  }

  test('tomaat en wortel op aangrenzende vakken + emoji’s (content: goede combinatie)', async ({ page }) => {
    await openOwnGardenPanel(page);
    const plots = ownMiniPlots(page);
    await expect(plots).toHaveCount(9);

    await plots.nth(0).click({ force: true });
    await plots.nth(1).click({ force: true });
    await expect(plots.nth(0)).toHaveClass(/world-own-plot--tilled/, { timeout: 5_000 });
    await expect(plots.nth(1)).toHaveClass(/world-own-plot--tilled/);

    const panel = page.locator('.walk-garden-view');
    // Standaard selectedSeed = tomato; default target plot index = 1
    await panel.getByRole('button', { name: /Plant/i }).click();
    await expect(page.locator('#own-garden-seed-select')).toBeVisible({ timeout: 5_000 });
    await expect(plots.nth(1)).toHaveClass(/world-own-plot--planted/, { timeout: 5_000 });

    await page.locator('#own-garden-seed-select').selectOption('carrot');
    await plots.nth(0).click({ force: true });

    await expect(plots.nth(0)).toHaveClass(/world-own-plot--planted/);
    await expect(plots.nth(1)).toHaveClass(/world-own-plot--planted/);

    await expect(plots.nth(0).locator('.world-own-plot-emoji')).not.toBeEmpty();
    await expect(plots.nth(1).locator('.world-own-plot-emoji')).not.toBeEmpty();
  });
});
