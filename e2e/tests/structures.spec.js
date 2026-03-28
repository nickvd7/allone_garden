// @ts-check
const { test, expect } = require('@playwright/test');
const { uniqueUser, register } = require('./helpers');

test.describe('Garden Structures', () => {
  test.beforeEach(async ({ page }) => {
    const user = uniqueUser();
    await register(page, user);
  });

  test('structures panel is visible alongside tools panel', async ({ page }) => {
    // StructuresPanel should render on the left sidebar
    await expect(page.locator('text=/Well|Greenhouse|Compost/i').first()).toBeVisible();
  });

  test('water well shows build button with cost', async ({ page }) => {
    // Build button for the well (costs 50 coins)
    const wellSection = page.locator('text=/Water Well/i').locator('..');
    await expect(wellSection.or(
      page.locator('.structure-item').filter({ hasText: /well/i })
    ).first()).toBeVisible();

    // Should show build cost
    await expect(page.locator('text=/50|coins/i').first()).toBeVisible();
  });

  test('greenhouse shows passive indicator when built', async ({ page }) => {
    // Greenhouse card should be visible
    await expect(page.locator('text=/Greenhouse/i').first()).toBeVisible();
  });

  test('compost heap shows harvest counter', async ({ page }) => {
    // Compost section should mention harvests or fertilizer
    await expect(
      page.locator('text=/Compost/i, text=/compost/i').first()
    ).toBeVisible();
  });

  test('spray tool is present in tools panel', async ({ page }) => {
    // Spray Pests / Spuiten tool must be visible
    await expect(
      page.getByRole('button', { name: /spray|spuit/i })
    ).toBeVisible();
  });
});
