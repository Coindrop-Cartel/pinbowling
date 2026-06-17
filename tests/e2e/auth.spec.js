import { test, expect } from '@playwright/test';

test.describe('User Authentication & RBAC', () => {
  test('Admin should see maintenance navigation', async ({ page }) => {
    await page.goto('./');
    await page.locator('#header-login-btn').click();
    await page.fill('#auth-username', 'admin');
    await page.fill('#auth-pass', 'admin');
    await page.click('#auth-modal-form button[type="submit"]');

    await page.waitForLoadState('networkidle');

    // Maintenance should be visible for admins
    const adminNav = page.locator('#admin-nav-item');
    await adminNav.click();
    await expect(page.locator('#nav-maintenance')).toBeVisible();
  });

  test('Player should not see maintenance navigation', async ({ page }) => {
    await page.goto('./');
    await page.locator('#header-login-btn').click();
    // Assuming a player user exists in your seed
    await page.fill('#auth-username', 'player1');
    await page.fill('#auth-pass', 'player1');
    await page.click('#auth-modal-form button[type="submit"]');

    await page.waitForLoadState('networkidle');

    const adminNav = page.locator('#admin-nav-item');
    // According to auth.js updateAuthUI, adminNav is hidden if no children are visible
    await expect(adminNav).toBeHidden();
  });

  test('Logout should reset UI state', async ({ page }) => {
    await page.goto('./');
    await page.locator('#header-login-btn').click();
    await page.fill('#auth-username', 'admin');
    await page.fill('#auth-pass', 'admin');
    await page.click('#auth-modal-form button[type="submit"]');

    await page.click('#header-logout-btn');
    
    // Should see login button again
    await expect(page.locator('#header-login-btn')).toBeVisible();
    await expect(page.locator('.auth-user-greeting')).toBeHidden();
  });
});