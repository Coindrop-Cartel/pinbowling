import { test, expect } from '@playwright/test';

// Reset storage state for this file to test login flows specifically.
// This ensures we start as a guest and can see the login button.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('User Authentication & RBAC', () => {
  test('Admin should see maintenance navigation', async ({ page }) => {
    // Navigating to '' resolves to the root of the baseURL (the subdirectory)
    await page.goto('');
    await page.locator('#header-login-btn').click();
    await page.fill('#auth-username', 'admin');
    await page.fill('#auth-pass', 'admin');
    await page.click('#auth-modal-form button[type="submit"]');

    // Ensure the reload finishes and the admin greeting appears
    await expect(page.locator('.auth-user-greeting')).toContainText(/Hi, admin/i, { timeout: 10000 });

    // Verify Admin menu is visible
    await expect(page.locator('#admin-nav-item')).toBeVisible();
  });

  test('Player should not see maintenance navigation', async ({ page }) => {
    await page.goto('');
    await page.locator('#header-login-btn').click();
    // Assuming a player user exists in your seed
    await page.fill('#auth-username', 'player1');
    await page.fill('#auth-pass', 'player1');
    await page.click('#auth-modal-form button[type="submit"]');

    await expect(page.locator('.auth-user-greeting')).toContainText(/Hi, Test Player/i);
    
    // Admin dropdown should be hidden for standard players
    await expect(page.locator('#admin-nav-item')).toBeHidden();
  });

  test('Logout should reset UI state', async ({ page }) => {
    await page.goto('');
    await page.locator('#header-login-btn').click();
    await page.fill('#auth-username', 'admin');
    await page.fill('#auth-pass', 'admin');
    await page.click('#auth-modal-form button[type="submit"]');
    
    await expect(page.locator('.auth-user-greeting')).toBeVisible();

    // Perform logout
    await page.click('#header-logout-btn');
    
    // Verify login button returns
    await expect(page.locator('#header-login-btn')).toBeVisible();
    await expect(page.locator('.auth-user-greeting')).toBeHidden();
  });
});