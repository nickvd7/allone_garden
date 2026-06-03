// @ts-check
const { test, expect } = require('@playwright/test');
const { guestOrRegister } = require('./helpers');

async function openGuest(page, width, height) {
  await page.setViewportSize({ width, height });
  await guestOrRegister(page);
}

test.describe('Mobile visual sanity', () => {
  test.beforeEach(({ }, testInfo) => {
    if (process.env.CI) {
      testInfo.skip(
        true,
        'Screenshot baselines are macOS-only; add *-chromium-linux.png or run update-snapshots on Linux'
      );
    }
  });

  test('portrait first fold remains usable (390x844)', async ({ page }) => {
    await openGuest(page, 390, 844);
    await expect(page).toHaveScreenshot('mobile-portrait-first-fold.png', {
      clip: { x: 0, y: 0, width: 390, height: 460 },
      maxDiffPixelRatio: 0.02,
    });
  });

  test('landscape header and top content remain usable (844x390)', async ({ page }) => {
    await openGuest(page, 844, 390);
    await expect(page).toHaveScreenshot('mobile-landscape-top.png', {
      clip: { x: 0, y: 0, width: 844, height: 240 },
      maxDiffPixelRatio: 0.02,
    });
  });
});
