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
 * Logout via the header button.
 */
export async function logout(page) {
  await page.getByRole('button', { name: /Logout/i }).click();
  await page.waitForSelector('text=AllOne Garden', { timeout: 5_000 });
}

/**
 * Open the header "More" dropdown and click an item.
 * Uses role=menuitem to avoid matching other buttons in the page.
 */
export async function clickHeaderMoreItem(page, itemNameRegex) {
  await page.getByRole('button', { name: /More/i }).click();
  await page.getByRole('menuitem', { name: itemNameRegex }).click();
}
