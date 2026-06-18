import { test, expect } from '@playwright/test';

test.describe('Global Navigation Visibility', () => {
  test('should show/hide navigation items based on user role', async ({ page }, testInfo) => {
    // Navigate to the root of the subdirectory
    await page.goto('');

    const projectName = testInfo.project.name;

    // 1. Common items that everyone (Admin, TD, and Player) should see
    await expect(page.locator('#play-nav-item')).toBeVisible();
    await expect(page.locator('#leagues-nav-item')).toBeVisible();

    // 2. Admin Menu Logic
    const adminMenu = page.locator('#admin-nav-item');

    if (projectName.includes('admin')) {
      // Admin sees everything
      await expect(adminMenu).toBeVisible();
      await adminMenu.click();
      await expect(page.locator('#nav-machines')).toBeVisible();
      await expect(page.locator('#nav-maintenance')).toBeVisible();
      await expect(page.locator('#nav-players')).toBeVisible();
    } 
    
    else if (projectName.includes('td')) {
      // TD sees the Admin menu, but Maintenance should be hidden
      await expect(adminMenu).toBeVisible();
      await adminMenu.click();
      await expect(page.locator('#nav-machines')).toBeVisible();
      await expect(page.locator('#nav-teams')).toBeVisible();
      await expect(page.locator('#nav-maintenance')).toBeHidden();
    } 
    
    else if (projectName.includes('player')) {
      // Players are blocked from the Admin menu entirely via PHP ($isManagement check)
      await expect(adminMenu).toBeHidden();
    }

    // 3. Verify the Auth State UI matches the project persona
    const authGreeting = page.locator('.auth-user-greeting');
    if (projectName.includes('admin')) {
      await expect(authGreeting).toContainText(/admin/i);
    } else if (projectName.includes('player')) {
      await expect(authGreeting).toContainText(/Test Player/i);
    }
  });
});