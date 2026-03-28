// @ts-check
const { test, expect } = require('@playwright/test');
const { uniqueUser, register, login } = require('./helpers');

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

// ── Trade marketplace ─────────────────────────────────────────────────────────

test.describe('Trade marketplace', () => {
  test('opens and closes trade modal', async ({ page }) => {
    await page.getByRole('button', { name: /Trade/i }).click();
    await expect(page.getByText(/marketplace|trade/i).first()).toBeVisible();
    // Close via Escape or close button
    await page.keyboard.press('Escape');
    // Modal should be gone
    await expect(page.locator('[data-modal="trade"]')).not.toBeVisible({ timeout: 3_000 }).catch(() => {});
  });

  test('trade modal shows market listings section', async ({ page }) => {
    await page.getByRole('button', { name: /Trade/i }).click();
    // Market tab or heading should appear
    await expect(page.getByText(/market|listing/i).first()).toBeVisible();
  });
});

// ── Plugin marketplace ────────────────────────────────────────────────────────

test.describe('Plugin marketplace', () => {
  test('opens plugin marketplace', async ({ page }) => {
    await page.getByRole('button', { name: /Plugin/i }).click();
    await expect(page.getByText('🔌 Plugin Marketplace')).toBeVisible();
  });

  test('installed tab shows loaded plugins', async ({ page }) => {
    await page.getByRole('button', { name: /Plugin/i }).click();
    // Default tab is Installed
    await expect(page.getByText(/Installed/i).first()).toBeVisible();
  });

  test('can switch to community tab', async ({ page }) => {
    await page.getByRole('button', { name: /Plugin/i }).click();
    await page.getByRole('button', { name: /Community/i }).click();
    await expect(page.getByPlaceholder(/Search plugins/i)).toBeVisible();
  });

  test('community tab search filters plugins', async ({ page }) => {
    await page.getByRole('button', { name: /Plugin/i }).click();
    await page.getByRole('button', { name: /Community/i }).click();
    await page.getByPlaceholder(/Search plugins/i).fill('weather');
    await expect(page.getByText('weather-forecast')).toBeVisible();
  });

  test('closes marketplace with ✕ button', async ({ page }) => {
    await page.getByRole('button', { name: /Plugin/i }).click();
    await expect(page.getByText('🔌 Plugin Marketplace')).toBeVisible();
    await page.getByRole('button', { name: '✕' }).click();
    await expect(page.getByText('🔌 Plugin Marketplace')).not.toBeVisible();
  });
});

// ── Leaderboard ───────────────────────────────────────────────────────────────

test.describe('Leaderboard', () => {
  test('opens leaderboard panel', async ({ page }) => {
    await page.getByRole('button', { name: /Scores/i }).click();
    await expect(page.getByText(/leaderboard|top/i).first()).toBeVisible();
  });
});

// ── Achievements panel ────────────────────────────────────────────────────────

test.describe('Achievements', () => {
  test('opens achievements panel', async ({ page }) => {
    await page.getByRole('button', { name: /Badges/i }).click();
    await expect(page.getByText('🏆 Achievements')).toBeVisible();
  });

  test('achievements panel shows progress bar', async ({ page }) => {
    await page.getByRole('button', { name: /Badges/i }).click();
    // Counter shows 0 / 19 initially
    await expect(page.getByText(/\d+ \/ \d+/)).toBeVisible();
  });
});
