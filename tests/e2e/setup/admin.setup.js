import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const authFile = path.join(__dirname, '../../../playwright/.auth/admin.json');

setup('authenticate as admin', async ({ page }) => {
  await page.goto('');
  await page.locator('#header-login-btn').click();
  await page.fill('#auth-username', 'admin');
  await page.fill('#auth-pass', 'admin');
  await page.click('#auth-modal-form button[type="submit"]');

  await expect(page.locator('.auth-user-greeting')).toContainText(/Hi, admin/i);
  await page.context().storageState({ path: authFile });
});