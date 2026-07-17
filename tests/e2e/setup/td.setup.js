import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const authFile = path.join(__dirname, '../../../playwright/.auth/td.json');

setup('authenticate as td', async ({ page }) => {
  await page.goto('');
  await page.locator('#header-login-btn').click();
  await page.fill('#auth-username', 'td'); // Assuming 'td' user exists in seed
  await page.fill('#auth-pass', 'td');
  await page.click('#auth-modal-form button[type="submit"]');

  await expect(page.locator('.auth-user-greeting')).toContainText(/Hi,/i);
  await page.context().storageState({ path: authFile });
});