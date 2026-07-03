// @ts-check
const { test, expect } = require('@playwright/test');
const { uniqueUser, register, login, clickHeaderMoreItem } = require('./helpers');

let user;

test.beforeAll(async ({ browser }) => {
  user = uniqueUser();
  const page = await browser.newPage();
  await register(page, user);
  await page.close();
});

test.beforeEach(async ({ page }) => {
  await login(page, user);
});

async function openTradeFromInventoryFab(page) {
  await page.keyboard.press('Escape');
  const closeWorldPanel = page.getByRole('button', { name: /^Close panel$/i });
  if (await closeWorldPanel.isVisible().catch(() => false)) {
    await closeWorldPanel.click();
  }
  await page.getByRole('button', { name: /Open inventory/i }).click({ force: true });
  await expect(page.locator('.inventory-sidebar').getByRole('heading', { name: /inventory/i })).toBeVisible({
    timeout: 15_000,
  });
  await page
    .locator('.inventory-sidebar')
    .getByRole('button', { name: /Marketplace/i })
    .click({ force: true });
  await expect(page.getByText('🔄 Marketplace')).toBeVisible({ timeout: 15_000 });
}

// ── Trade marketplace ─────────────────────────────────────────────────────────

// TODO(maintainer): the "Open inventory" FAB + inventory-sidebar → Marketplace flow this
// suite drives no longer exists; the trade marketplace now opens via the in-world Market
// POI (walk to 🏪 and interact). Quarantined until a stable, non-flaky entry point exists.
test.describe.skip('Trade marketplace', () => {
  test('opens and closes trade modal', async ({ page }) => {
    await openTradeFromInventoryFab(page);
    await page
      .getByText('🔄 Marketplace')
      .locator('xpath=following-sibling::button')
      .click();
    await expect(page.getByText('🔄 Marketplace')).not.toBeVisible({ timeout: 5_000 });
  });

  test('trade modal shows market listings section', async ({ page }) => {
    await openTradeFromInventoryFab(page);
    await expect(page.getByText(/market|listing|Browse|browse/i).first()).toBeVisible();
  });
});

// ── Plugin marketplace ────────────────────────────────────────────────────────

test.describe('Plugin marketplace', () => {
  test('opens plugin marketplace', async ({ page }) => {
    await clickHeaderMoreItem(page, /Plugins/i);
    await expect(page.getByText('🔌 Plugin Marketplace')).toBeVisible();
  });

  test('installed tab shows loaded plugins', async ({ page }) => {
    await clickHeaderMoreItem(page, /Plugins/i);
    // Default tab is Installed
    await expect(page.getByText(/Installed/i).first()).toBeVisible();
  });

  test('can switch to community tab', async ({ page }) => {
    await clickHeaderMoreItem(page, /Plugins/i);
    await page.getByRole('button', { name: /Community/i }).click();
    await expect(page.getByPlaceholder(/Search plugins/i)).toBeVisible();
  });

  test('community tab search filters plugins', async ({ page }) => {
    await clickHeaderMoreItem(page, /Plugins/i);
    await page.getByRole('button', { name: /Community/i }).click();
    await page.getByPlaceholder(/Search plugins/i).fill('weather');
    await expect(page.getByText('weather-forecast')).toBeVisible();
  });

  test('closes marketplace with ✕ button', async ({ page }) => {
    await clickHeaderMoreItem(page, /Plugins/i);
    await expect(page.getByText('🔌 Plugin Marketplace')).toBeVisible();
    await page.getByRole('button', { name: '✕' }).click();
    await expect(page.getByText('🔌 Plugin Marketplace')).not.toBeVisible();
  });
});

// ── Leaderboard ───────────────────────────────────────────────────────────────

test.describe('Leaderboard', () => {
  test('opens leaderboard panel', async ({ page }) => {
    await clickHeaderMoreItem(page, /Scores/i);
    await expect(page.getByText(/leaderboard|top/i).first()).toBeVisible();
  });
});

// ── Achievements panel ────────────────────────────────────────────────────────

test.describe('Achievements', () => {
  test('opens achievements panel', async ({ page }) => {
    await clickHeaderMoreItem(page, /Badges/i);
    await expect(page.getByText('🏆 Achievements')).toBeVisible();
  });

  test('achievements panel shows progress bar', async ({ page }) => {
    await clickHeaderMoreItem(page, /Badges/i);
    // Counter shows 0 / 19 initially
    await expect(page.getByText(/\d+ \/ \d+/).first()).toBeVisible();
  });
});
