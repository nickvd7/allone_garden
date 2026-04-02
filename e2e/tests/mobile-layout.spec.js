// @ts-check
const { test, expect } = require('@playwright/test');
const { dismissWebpackOverlay } = require('./helpers');

test.describe('Mobile layout', () => {
  async function assertMobileLayout(page, width, height, maxVerticalRatio) {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => {
      localStorage.setItem('garden_tour_done', 'true');
    });

    await page.goto('/');
    await dismissWebpackOverlay(page);
    await page.getByRole('button', { name: /Play as Guest/i }).click();
    await page.waitForSelector('.header', { timeout: 15_000 });

    const layout = await page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const horizontalOverflow =
        Math.max(doc.scrollWidth, body.scrollWidth) - viewportWidth;
      const verticalRatio =
        Math.max(doc.scrollHeight, body.scrollHeight) / viewportHeight;
      return { horizontalOverflow, verticalRatio };
    });

    // No horizontal overflow should remain on phone width.
    expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
    // Keep page reasonably compact on mobile portrait.
    if (typeof maxVerticalRatio === 'number') {
      expect(layout.verticalRatio).toBeLessThanOrEqual(maxVerticalRatio);
    }
  }

  test('guest layout has no horizontal scroll and limited vertical scroll (390x844)', async ({ page }) => {
    await assertMobileLayout(page, 390, 844, 3.2);
  });

  test('guest layout stays compact on smaller android viewport (360x740)', async ({ page }) => {
    await assertMobileLayout(page, 360, 740, 3.55);
  });

  test('guest layout works in mobile landscape (844x390)', async ({ page }) => {
    await assertMobileLayout(page, 844, 390);
    await expect(page.locator('.header').first()).toBeVisible();
    await expect(page.locator('.world-map-embedded').first()).toBeVisible();
  });
});
