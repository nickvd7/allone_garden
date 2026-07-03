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

// The trade marketplace is a location-based feature: open the world overview map,
// teleport to the Market POI, enter the market stall, step up to the shop counter
// (which reveals the shop panel) and open the player marketplace from there.
async function openTradeModal(page) {
  await page.getByRole('button', { name: /World Map/i }).click();
  await expect(page.locator('.walk-overview-map')).toBeVisible({ timeout: 15_000 });
  await page.locator('.walk-overview-markers').getByTitle('Market', { exact: true }).click();

  const enterBtn = page.locator('.walk-enter-banner__btn');
  await expect(enterBtn).toBeVisible({ timeout: 15_000 });
  await enterBtn.click();

  // Walk up to the counter with the interior D-pad; the shop panel auto-opens there.
  const dpadUp = page.locator('.village-interior-dpad .walk-dpad-btn--up');
  await expect(dpadUp).toBeVisible({ timeout: 15_000 });
  for (let i = 0; i < 3; i += 1) await dpadUp.click();

  const openMarketBtn = page.getByRole('button', { name: /Open marketplace/i });
  await expect(openMarketBtn).toBeVisible({ timeout: 15_000 });
  await openMarketBtn.click();
  await expect(page.getByText('🔄 Marketplace')).toBeVisible({ timeout: 15_000 });
}

// ── Trade marketplace ─────────────────────────────────────────────────────────

test.describe('Trade marketplace', () => {
  test('opens and closes trade modal', async ({ page }) => {
    await openTradeModal(page);
    await page
      .getByText('🔄 Marketplace')
      .locator('xpath=following-sibling::button')
      .click();
    await expect(page.getByText('🔄 Marketplace')).not.toBeVisible({ timeout: 5_000 });
  });

  test('trade modal shows market listings section', async ({ page }) => {
    await openTradeModal(page);
    await expect(page.getByRole('button', { name: /Browse/i })).toBeVisible();
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
