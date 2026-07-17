import { test, expect } from '@playwright/test';

test.describe('Team Management', () => {
  let createdTeamName = null;

  test.beforeEach(async ({ page }, testInfo) => {
    const isManagement = testInfo.project.name.includes('admin') || testInfo.project.name.includes('td');
    await page.goto('');
    if (isManagement) {
      // Re-login if storageState session expired
      const loginBtn = page.locator('#header-login-btn');
      if (await loginBtn.isVisible()) {
        const creds = testInfo.project.name.includes('admin') ? ['admin', 'admin'] : ['td', 'td'];
        await loginBtn.click();
        await page.fill('#auth-username', creds[0]);
        await page.fill('#auth-pass', creds[1]);
        await page.click('#auth-modal-form button[type="submit"]');
        await expect(page.locator('.auth-user-greeting')).toBeVisible();
        await page.goto('');
      }
      await page.locator('#admin-nav-item').click(); // Teams is under the Admin dropdown
      await page.click('#nav-teams');
    }
  });

  test.afterEach(async ({ page }, testInfo) => {
    const isManagement = testInfo.project.name.includes('admin') || testInfo.project.name.includes('td');

    if (createdTeamName && isManagement) {
      // Ensure a clean state and navigate back to the teams registry for cleanup
      await page.goto(''); 
      await page.locator('#admin-nav-item').click();
      await page.click('#nav-teams');

      const row = page.locator('.team-registry-item', { hasText: createdTeamName });
      if (await row.count() > 0) {
        await row.click(); // Expand to reveal management buttons
        await row.locator('.delete-team-btn').click();
        await page.locator('.modal-card button', { hasText: 'Yes, Proceed' }).click();
        await expect(row).toBeHidden();
      }
      createdTeamName = null;
    }
  });

  test('Management can create a team and add members', async ({ page }, testInfo) => {
    const isManagement = testInfo.project.name.includes('admin') || testInfo.project.name.includes('td');
    test.skip(!isManagement, 'Team management requires TD or Admin role');

    const name = `E2E Team ${Date.now()}`;
    createdTeamName = name;

    // Create Team
    await page.fill('#team-name', name);
    await page.fill('#team-city', 'Chicago');
    await page.fill('#team-state', 'IL');
    await page.click('#save-team-btn');

    const row = page.locator('.team-registry-item', { hasText: name });
    await expect(row).toBeVisible();

    // Add a member (assuming players exist)
    // Expand the team row to reveal the roster section and "Add Player" button
    await row.click(); 
    const addMemberBtn = row.locator('button.add-member-btn');
    await expect(addMemberBtn).toBeVisible();
    await addMemberBtn.click();
    
    const dialog = page.locator('.modal-card');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    
    // Select the first available player from the searchable select to enable the confirm button
    await page.selectOption('#player-select-modal', { index: 1 });
    await page.click('#modal-confirm');

    // Verify member count updated in header
    await expect(row.locator('small')).toContainText('Members: 1');
  });
});