import { test, expect } from '@playwright/test';

test.describe('Location Management', () => {
  let createdLocationName = null;

  test.beforeEach(async ({ page }) => {
    await page.goto('');
    await page.locator('#admin-nav-item').click();
    await page.click('#nav-locations');
  });

  test.afterEach(async ({ page }, testInfo) => {
    const isAdmin = testInfo.project.name.includes('admin');
    
    // Reload to clear any open modals or expansion states that might block clicks
    if (createdLocationName && isAdmin) await page.reload();

    if (createdLocationName && isAdmin) {
      const row = page.locator('.location-registry-item', { hasText: createdLocationName });
      if (await row.count() > 0) {
        await row.locator('.delete-loc-btn').click();
        await page.locator('.modal-card button', { hasText: 'Yes, Proceed' }).click();
        await expect(row).toBeHidden();
      }
      createdLocationName = null;
    }
  });

  test('Admin can create a location and add a machine', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('admin'), 'Destructive management is Admin-only');

    const locName = `E2E Venue ${Date.now()}`;
    createdLocationName = locName;

    // Create Location
    await page.click('text="Create New Location"');
    await page.fill('#location-name', locName);
    await page.fill('#location-city', 'St. Louis');
    await page.selectOption('#location-state', 'MO');
    await page.click('#save-location-button');

    const row = page.locator('.location-registry-item', { hasText: locName });
    await expect(row).toBeVisible();
    await expect(row).toContainText('St. Louis, MO');

    // Expand and Add Machine
    await row.click();
    await row.locator('.add-mach-btn').click();
    
    const formCard = page.locator('#location-machine-form-card');
    await expect(formCard).toBeVisible();
    
    // Fill out machine mapping (assuming some machines exist in DB)
    await formCard.locator('#loc-mach-select').selectOption({ index: 1 });
    await formCard.locator('#target-easy').fill('1,000,000');
    await formCard.locator('#target-med').fill('2,500,000');
    await formCard.locator('#target-hard').fill('5,000,000');
    await formCard.locator('#save-loc-mach').click();

    // Verify machine appears in location list
    await expect(row.locator('.mach-list-inner')).not.toBeEmpty();
  });
});