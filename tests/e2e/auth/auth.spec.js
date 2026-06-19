import { test, expect } from '@playwright/test';

test.describe('Authentication & RBAC', () => {
  test('admin should see all management navigation items', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('admin'), 'Admin nav items only visible to admin');

    await page.goto('');
    // Re-login if storageState session expired
    const loginBtn = page.locator('#header-login-btn');
    if (await loginBtn.isVisible()) {
      await loginBtn.click();
      await page.fill('#auth-username', 'admin');
      await page.fill('#auth-pass', 'admin');
      await page.click('#auth-modal-form button[type="submit"]');
      await expect(page.locator('.auth-user-greeting')).toBeVisible();
      await page.goto('');
    }

    await page.locator('#leagues-nav-item').click();
    await expect(page.locator('#nav-leagues')).toBeVisible();

    // Admin-only nav items are inside the Admin dropdown, not Leagues
    await page.locator('#admin-nav-item').click();
    await expect(page.locator('#nav-machines')).toBeVisible();
    await expect(page.locator('#nav-locations')).toBeVisible();
    await expect(page.locator('#nav-players')).toBeVisible();
    await expect(page.locator('#nav-teams')).toBeVisible();
  });

  test('player should have restricted navigation access', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('player'), 'Test only for player role');
    
    await page.goto('');
    const adminNav = page.locator('#admin-nav-item');
    
    // Admin menu should be hidden if no sub-items are allowed
    await expect(adminNav).toBeHidden();
  });

  test('should handle logout correctly', async ({ page }) => {
    await page.goto('');
    await page.click('#header-logout-btn');
    
    await expect(page.locator('#header-login-btn')).toBeVisible();
  });
});