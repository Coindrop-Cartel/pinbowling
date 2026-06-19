import { test, expect } from '@playwright/test';

test.describe('League & Event Management', () => {

  let createdLeagueName = null;

  test.beforeEach(async ({ page }, testInfo) => {
    // Navigating to '' resolves to the root of the baseURL (the subdirectory)
    await page.goto('');
    // Re-login if storageState session expired
    const loginBtn = page.locator('#header-login-btn');
    if (await loginBtn.isVisible()) {
      const role = testInfo.project.name.includes('admin') ? 'admin' : 'td';
      await loginBtn.click();
      await page.fill('#auth-username', role);
      await page.fill('#auth-pass', role);
      await page.click('#auth-modal-form button[type="submit"]');
      await expect(page.locator('.auth-user-greeting')).toBeVisible();
      await page.goto('');
    }
  });

  test.afterEach(async ({ page }, testInfo) => {
    // Only attempt cleanup if a league was created AND the user is an admin.
    // TDs and Players likely don't have the permission/UI to delete leagues.
    const isAdmin = testInfo.project.name.includes('admin');

    if (createdLeagueName && isAdmin) {
      // Ensure a clean state for cleanup
      await page.reload();
      
      // Ensure we are on the Leagues Management page
      const isLeaguesPage = await page.locator('#leagues-list').isVisible().catch(() => false);
      if (!isLeaguesPage) {
        await page.locator('#leagues-nav-item').click();
        await page.click('#nav-leagues');
      }

      const leagueRow = page.locator('.league-registry-item', { hasText: createdLeagueName });
      if (await leagueRow.count() > 0) {

        // The delete button is inside the expandable content
        await leagueRow.click(); 
        await leagueRow.locator('.delete-league-btn').click();

        // Handle the custom confirmation modal
        await page.locator('.modal-card button', { hasText: 'Yes, Proceed' }).click();
        
        // Verify it was removed from the UI
        await expect(leagueRow).toBeHidden();
      }
      createdLeagueName = null;
    }
  });

  test('Admin can create a new league and an event', async ({ page }, testInfo) => {
    // Skip this specific test for non-admin roles
    test.skip(!testInfo.project.name.includes('admin'), 'Only Admins can create/delete leagues');

    // Navigate to Leagues Management
    await page.locator('#leagues-nav-item').click();
    await page.click('#nav-leagues');

    // Create League
    const leagueName = `E2E League ${Date.now()}`;
    createdLeagueName = leagueName; // Track for cleanup
    await page.click('#create-league-toggle');
    await page.fill('#league-name', leagueName);
    await page.fill('#league-start-date', '2025-01-01');
    await page.click('#create-league-btn');

    await expect(page.locator('#leagues-list')).toContainText(leagueName);

    // Create Event within that league
    // Click the newly created league row to expand
    await page.click(`text=${leagueName}`);
    await page.getByRole('button', { name: 'Add Event' }).click();
    
    await page.fill('#event-name', 'Opening Night');
    await page.fill('#event-date', '2025-01-01');
    await page.getByRole('button', { name: 'Save Event' }).click();

    await expect(page.locator('.league-registry-item', { hasText: leagueName }).locator('.league-events-list')).toContainText('Opening Night');
  });

  test('Maintenance cleanup triggers confirmation', async ({ page }, testInfo) => {
    // Skip for non-admins: TDs do not have PERMISSIONS.RUN_CLEANUP
    test.skip(!testInfo.project.name.includes('admin'), 'Maintenance tools are Admin-only');

    await page.locator('#admin-nav-item').click();
    await page.click('#nav-maintenance');

    await page.click('button:has-text("Run Database Cleanup")');
    // Verify the custom dialog appears
    await expect(page.locator('.modal-card h2')).toContainText('Confirm Cleanup');
  });
});