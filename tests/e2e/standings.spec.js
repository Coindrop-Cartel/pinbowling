import { test, expect } from '@playwright/test';

test.describe('Standings & Results', () => {
  test('Should load standings and toggle between events', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('link', { name: 'Standings', exact: true }).click();

    // Select a league using the tournament selector
    const leagueSearch = page.locator('#league-search-global');
    await leagueSearch.fill('Tuesday Night');
    await page.keyboard.press('Enter');

    // Verify Standings Table appears
    await expect(page.locator('#standings-table')).toBeVisible();

    // Check for Season Summary option in the event selector
    const eventSelect = page.locator('.event-select-shared');
    await eventSelect.selectOption({ label: 'Season Summary' });

    // Verify table headers change for summary mode
    await expect(page.locator('#standings-table thead')).toContainText('Points');
  });

  test('Unregistered users can see public standings', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('link', { name: 'Standings', exact: true })).toBeVisible();
  });
});