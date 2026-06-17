import { test, expect } from '@playwright/test';

test.describe('League & Event Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await page.locator('#header-login-btn').click();
    await page.fill('#auth-username', 'admin');
    await page.fill('#auth-pass', 'admin');
    await page.click('#auth-modal-form button[type="submit"]');

    // Ensure the reload finishes and the admin greeting appears
    await expect(page.locator('#auth-header-container')).toContainText('Hi, admin');
  });

  test('Admin can create a new league and an event', async ({ page }) => {
    // Navigate to Leagues Management
    await page.locator('#admin-nav-item').click();
    await page.click('#nav-leagues');

    // Create League
    const leagueName = `E2E League ${Date.now()}`;
    await page.click('#add-league-btn');
    await page.fill('input[name="name"]', leagueName);
    await page.selectOption('select[name="type"]', 'standard');
    await page.click('#save-league-btn');

    await expect(page.locator('.list-row')).toContainText(leagueName);

    // Create Event within that league
    // Click the newly created league row to expand
    await page.click(`text=${leagueName}`);
    await page.click('.add-event-btn');
    
    await page.fill('input[name="eventName"]', 'Opening Night');
    await page.fill('input[name="eventDate"]', '2025-01-01');
    await page.click('#save-event-btn');

    await expect(page.locator('.event-list-item')).toContainText('Opening Night');
  });

  test('Maintenance cleanup triggers confirmation', async ({ page }) => {
    await page.locator('#admin-nav-item').click();
    await page.click('#nav-maintenance');

    await page.click('button:has-text("Run Database Cleanup")');
    // Verify the custom dialog appears
    await expect(page.locator('.modal-card h2')).toContainText('Confirm Cleanup');
  });
});