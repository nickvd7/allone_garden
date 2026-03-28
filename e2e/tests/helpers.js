/**
 * Shared helpers for e2e tests.
 *
 * All tests share the same in-memory backend instance so we use
 * a counter to generate unique usernames/emails per test run.
 */

let _seq = Date.now();
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
  await page.goto('/');
  await page.getByRole('button', { name: 'Register' }).click();
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
  await page.goto('/');
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
