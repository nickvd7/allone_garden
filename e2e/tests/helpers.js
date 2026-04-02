/**
 * Shared helpers for e2e tests.
 *
 * All tests share the same in-memory backend instance so we use
 * a counter to generate unique usernames/emails per test run.
 */

let _seq = Date.now();

/** CRA/webpack dev overlay blokkeert clicks in e2e — verwijderen na load */
export async function dismissWebpackOverlay(page) {
  await page.evaluate(() => {
    document.getElementById('webpack-dev-server-client-overlay')?.remove();
  });
}

export function uniqueUser() {
  _seq++;
  return {
    username: `e2e_${_seq}`,
    email:    `e2e_${_seq}@test.invalid`,
    password: 'E2ePass1',
  };
}

/**
 * Register a user and land on the main game screen.
 * Returns the user object used.
 */
export async function register(page, user) {
  await page.addInitScript(() => {
    localStorage.setItem('garden_tour_done', 'true');
  });
  await page.goto('/');
  await dismissWebpackOverlay(page);
  await page.getByRole('tab', { name: 'Register' }).click();
  await page.getByPlaceholder('Username').fill(user.username);
  await page.getByPlaceholder('Email').fill(user.email);
  await page.getByPlaceholder('Password').fill(user.password);
  await page.getByRole('button', { name: /Create account/i }).click();
  // Wait until the main game header is visible
  await page.waitForSelector('.header', { timeout: 15_000 });
  return user;
}

/**
 * Login an existing user.
 */
export async function login(page, user) {
  await page.addInitScript(() => {
    localStorage.setItem('garden_tour_done', 'true');
  });
  await page.goto('/');
  await dismissWebpackOverlay(page);
  // Default tab is Login
  await page.getByPlaceholder('Username').fill(user.username);
  await page.getByPlaceholder('Password').fill(user.password);
  await page.getByRole('button', { name: '🚪 Login' }).click();
  await page.waitForSelector('.header', { timeout: 15_000 });
}

/**
 * Wacht tot de wereldkaart geladen is en het eigen-tuinpaneel zichtbaar is
 * (spawn staat op een eigen vak; geen legenda meer).
 */
export async function openOwnGardenPanel(page) {
  const { expect } = require('@playwright/test');
  await page.locator('.walk-viewport').first().waitFor({ state: 'visible', timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Till/i })).toBeVisible({ timeout: 25_000 });
}

/**
 * Logout via the header user menu (👤 → Logout).
 */
export async function logout(page) {
  const { expect } = require('@playwright/test');
  await page.locator('#header-profile-btn').click();
  await page.getByRole('menuitem', { name: /Logout/i }).click();
  await expect(page.locator('#auth-main-title')).toBeVisible({ timeout: 15_000 });
}

/** Registered username appears in the profile dropdown (not on a top-level header button). */
export async function assertLoggedInAs(page, username) {
  const { expect } = require('@playwright/test');
  await page.locator('#header-profile-btn').click();
  await expect(page.getByRole('menuitem', { name: new RegExp(username, 'i') })).toBeVisible({
    timeout: 10_000,
  });
  await page.keyboard.press('Escape');
}

/**
 * Open the header user (👤) menu and click an item, or open profile modal flows
 * for Leaderboard / Badges (formerly under "More" + Scores).
 */
export async function clickHeaderMoreItem(page, itemNameRegex) {
  await page.locator('#header-profile-btn').click();
  const src = itemNameRegex.source || String(itemNameRegex);
  if (/scores/i.test(src)) {
    await page.getByRole('menuitem', { name: /Profile/i }).click();
    await page.getByRole('button', { name: /Leaderboard/i }).click();
    return;
  }
  if (/badges/i.test(src)) {
    await page.getByRole('menuitem', { name: /Profile/i }).click();
    await page.getByRole('button', { name: /Badges/i }).click();
    return;
  }
  await page.getByRole('menuitem', { name: itemNameRegex }).click();
}
