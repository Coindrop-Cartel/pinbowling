import { test, expect } from '@playwright/test';

test.describe('Machine Registry', () => {
  let createdMachineName = null;

  test.beforeEach(async ({ page }, testInfo) => {
    const isAdmin = testInfo.project.name.includes('admin');
    await page.goto('');
    if (isAdmin) {
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
      await page.click('#nav-machines');
    }
  });

  test.afterEach(async ({ page }, testInfo) => {
    const isAdmin = testInfo.project.name.includes('admin');

    // Reload to ensure no leftover UI state (like edit mode) blocks cleanup
    if (createdMachineName && isAdmin) await page.reload();

    if (createdMachineName && isAdmin) {
      const row = page.locator('.machine-registry-item', { hasText: createdMachineName });
      if (await row.count() > 0) {
        // Expand the machine row to reveal the delete button
        await row.click();
        const deleteBtn = row.locator('.delete-mach-btn');
        await deleteBtn.waitFor({ state: 'visible', timeout: 5000 });
        await deleteBtn.click();
        await page.locator('.modal-card button', { hasText: 'Yes, Proceed' }).click();
        await expect(row).toBeHidden();
      }
      createdMachineName = null;
    }
  });

  test('Admin can register a new pinball machine', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('admin'), 'Destructive management is Admin-only');

    const name = `E2E Machine ${Date.now()}`;
    createdMachineName = name;

    await page.click('text="Create New Machine"');
    await page.fill('#machine-name', name);
    await page.selectOption('#machine-year', '1992');
    await page.fill('#machine-manufacturer', 'Williams');
    await page.click('#save-machine-button');

    const row = page.locator('.machine-registry-item', { hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Williams, 1992');
  });
});