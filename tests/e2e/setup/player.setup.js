import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const authFile = path.join(__dirname, '../../../playwright/.auth/player.json');

setup('authenticate as player', async ({ page }) => {
  await page.goto('');
  await page.locator('#header-login-btn').click();
  await page.fill('#auth-username', 'player1');
  await page.fill('#auth-pass', 'player1');
  await page.click('#auth-modal-form button[type="submit"]');

  await expect(page.locator('.auth-user-greeting')).toContainText(/Hi, Test Player/i);
  await page.context().storageState({ path: authFile });
});