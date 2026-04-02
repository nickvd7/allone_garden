// @ts-check
const { test, expect } = require('@playwright/test');
const { uniqueUser, register, login, logout, dismissWebpackOverlay, assertLoggedInAs } = require('./helpers');

test.describe('Authentication', () => {
  test('shows login screen on first visit', async ({ page }) => {
    await page.goto('/');
    await dismissWebpackOverlay(page);
    await expect(page.getByRole('img', { name: /AllOne Garden/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Login' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Register' })).toBeVisible();
  });

  test('can register a new account', async ({ page }) => {
    const user = uniqueUser();
    await register(page, user);
    await assertLoggedInAs(page, user.username);
  });

  test('shows error on duplicate username', async ({ page }) => {
    const user = uniqueUser();
    await register(page, user);
    await logout(page);

    await dismissWebpackOverlay(page);
    // Try to register again with same username
    await page.getByRole('tab', { name: 'Register' }).click();
    await page.getByPlaceholder('Username').fill(user.username);
    await page.getByPlaceholder('Email').fill('other_' + user.email);
    await page.getByPlaceholder('Password').fill(user.password);
    await page.getByRole('button', { name: /Create account/i }).click();
    await expect(page.getByText(/already taken/i)).toBeVisible();
  });

  test('can logout and login again', async ({ page }) => {
    const user = uniqueUser();
    await register(page, user);
    await logout(page);

    // Should be back at auth screen
    await expect(page.getByRole('tab', { name: 'Login' })).toBeVisible();

    await login(page, user);
    await assertLoggedInAs(page, user.username);
  });

  test('shows error on wrong password', async ({ page }) => {
    const user = uniqueUser();
    await register(page, user);
    await logout(page);

    await page.getByPlaceholder('Username').fill(user.username);
    await page.getByPlaceholder('Password').fill('WrongPassword9');
    await page.getByRole('button', { name: '🚪 Login' }).click();
    await expect(page.getByText(/Invalid credentials/i)).toBeVisible();
  });

  test('can play as guest without an account', async ({ page }) => {
    await page.goto('/');
    await dismissWebpackOverlay(page);
    await page.getByRole('button', { name: /Play as Guest/i }).click();
    await page.waitForSelector('.header', { timeout: 10_000 });
    await page.locator('#header-profile-btn').click();
    await expect(page.getByRole('menuitem', { name: /Guest/i })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('session persists across page reload', async ({ page }) => {
    const user = uniqueUser();
    await register(page, user);
    await page.reload();
    await dismissWebpackOverlay(page);
    await page.waitForSelector('.header', { timeout: 10_000 });
    await assertLoggedInAs(page, user.username);
  });
});
