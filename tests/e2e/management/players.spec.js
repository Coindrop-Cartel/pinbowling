import { test, expect } from '@playwright/test';

test.describe('Player Management', () => {
  let createdPlayerName = null;

  test.beforeEach(async ({ page }, testInfo) => {
    await page.goto('');
    if (testInfo.project.name.includes('admin')) {
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
      await page.locator('#admin-nav-item').click();
      await page.click('#nav-players');
    }
  });

  test.afterEach(async ({ page }, testInfo) => {
    const isAdmin = testInfo.project.name.includes('admin');

    if (createdPlayerName && isAdmin) await page.reload();

    if (createdPlayerName && isAdmin) {
      const row = page.locator('.player-item-row', { hasText: createdPlayerName });
      if (await row.count() > 0) {
        await row.locator('.delete-player-btn-inline').click();
        await page.locator('.modal-card button', { hasText: 'Yes, Proceed' }).click();
        await expect(row).toBeHidden();
      }
      createdPlayerName = null;
    }
  });

  test('Admin can register a new player', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('admin'), 'Destructive management is Admin-only');

    const name = `E2E Player ${Date.now()}`;
    createdPlayerName = name;

    await page.click('text="Create New Player"');
    await page.fill('#player-name', name);
    await page.fill('#ifpa-id', '12345');
    await page.fill('#matchplay-id', 'MP-678');
    await page.click('#save-player-button');

    const row = page.locator('.player-item-row', { hasText: name });
    await expect(row).toBeVisible();
    
    await row.click(); // Expand to check IDs
    await expect(row).toContainText('12345');
    await expect(row).toContainText('MP-678');
  });
});