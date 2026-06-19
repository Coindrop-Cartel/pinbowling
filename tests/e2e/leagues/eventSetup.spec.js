import { test, expect } from '@playwright/test';

test.describe('Event Setup Page', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Event Setup requires management auth (admin or TD)
    const isManagement = testInfo.project.name.includes('admin') || testInfo.project.name.includes('td');
    test.skip(!isManagement, 'Event Setup requires management role');

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

    await page.locator('#leagues-nav-item').click();
    await page.click('#nav-leagues');
  });

  test('should display event setup page structure', async ({ page }) => {
    // Navigate to event setup from an expanded league row
    // First, we need a league with an event. Click the first league to expand.
    const leagueRows = page.locator('.league-registry-item');
    const count = await leagueRows.count();

    if (count > 0) {
      await leagueRows.first().click();

      // Look for a setup-event-btn or add-event-btn
      const setupBtn = leagueRows.first().locator('.setup-event-btn');
      const addEventBtn = leagueRows.first().locator('.add-event-btn');

      if (await setupBtn.count() > 0) {
        await setupBtn.first().click();
      } else if (await addEventBtn.count() > 0) {
        await addEventBtn.click();
        // Fill event form
        await page.fill('#event-name', `E2E Setup Event ${Date.now()}`);
        await page.fill('#event-date', '2025-06-01');
        await page.getByRole('button', { name: 'Save Event' }).click();

        // Now find the setup button for the new event
        const newSetupBtn = leagueRows.first().locator('.setup-event-btn');
        if (await newSetupBtn.count() > 0) {
          await newSetupBtn.last().click();
        }
      }

      // Verify event setup page elements
      await expect(page.getByTestId('event-setup-tournament-selector-container')).toBeVisible({ timeout: 10000 });
      await expect(page.getByTestId('add-target-button')).toBeVisible();
      await expect(page.getByTestId('rounds-list')).toBeAttached();
    }
  });

  test('should open config card when Add Target is clicked', async ({ page }) => {
    // Navigate to event setup - need a league with an event
    const leagueRows = page.locator('.league-registry-item');
    const count = await leagueRows.count();

    if (count > 0) {
      await leagueRows.first().click();
      const setupBtn = leagueRows.first().locator('.setup-event-btn');

      if (await setupBtn.count() > 0) {
        await setupBtn.first().click();

        // Wait for event setup page to load
        await expect(page.getByTestId('add-target-button')).toBeVisible({ timeout: 10000 });

        // Click Add Target
        await page.getByTestId('add-target-button').click();

        // Config card should be visible
        await expect(page.getByTestId('config-card')).toBeVisible();
        await expect(page.getByTestId('round-form')).toBeVisible();
        await expect(page.getByTestId('save-round-button')).toBeVisible();
        await expect(page.getByTestId('cancel-config-button')).toBeVisible();
      }
    }
  });

  test('should display scaling toggle buttons', async ({ page }) => {
    const leagueRows = page.locator('.league-registry-item');
    const count = await leagueRows.count();

    if (count > 0) {
      await leagueRows.first().click();
      const setupBtn = leagueRows.first().locator('.setup-event-btn');

      if (await setupBtn.count() > 0) {
        await setupBtn.first().click();
        await expect(page.getByTestId('add-target-button')).toBeVisible({ timeout: 10000 });
        await page.getByTestId('add-target-button').click();

        // Verify scaling buttons exist
        await expect(page.getByTestId('scaling-flat-button')).toBeVisible();
        await expect(page.getByTestId('scaling-curved-button')).toBeVisible();
      }
    }
  });

  test('should display quick fill buttons', async ({ page }) => {
    const leagueRows = page.locator('.league-registry-item');
    const count = await leagueRows.count();

    if (count > 0) {
      await leagueRows.first().click();
      const setupBtn = leagueRows.first().locator('.setup-event-btn');

      if (await setupBtn.count() > 0) {
        await setupBtn.first().click();
        await expect(page.getByTestId('add-target-button')).toBeVisible({ timeout: 10000 });
        await page.getByTestId('add-target-button').click();

        // Verify quick fill buttons exist
        await expect(page.getByTestId('fill-easy-button')).toBeVisible();
        await expect(page.getByTestId('fill-med-button')).toBeVisible();
        await expect(page.getByTestId('fill-hard-button')).toBeVisible();
      }
    }
  });

  test('should display preview values area', async ({ page }) => {
    const leagueRows = page.locator('.league-registry-item');
    const count = await leagueRows.count();

    if (count > 0) {
      await leagueRows.first().click();
      const setupBtn = leagueRows.first().locator('.setup-event-btn');

      if (await setupBtn.count() > 0) {
        await setupBtn.first().click();
        await expect(page.getByTestId('add-target-button')).toBeVisible({ timeout: 10000 });
        await page.getByTestId('add-target-button').click();

        // Preview values container should exist
        await expect(page.getByTestId('preview-values-area')).toBeAttached();
      }
    }
  });

  test('should display done setup button', async ({ page }) => {
    const leagueRows = page.locator('.league-registry-item');
    const count = await leagueRows.count();

    if (count > 0) {
      await leagueRows.first().click();
      const setupBtn = leagueRows.first().locator('.setup-event-btn');

      if (await setupBtn.count() > 0) {
        await setupBtn.first().click();
        await expect(page.getByTestId('add-target-button')).toBeVisible({ timeout: 10000 });

        // Done Setup button should be visible
        await expect(page.getByTestId('done-setup-button')).toBeVisible();
      }
    }
  });

  test('should display print machines button', async ({ page }) => {
    const leagueRows = page.locator('.league-registry-item');
    const count = await leagueRows.count();

    if (count > 0) {
      await leagueRows.first().click();
      const setupBtn = leagueRows.first().locator('.setup-event-btn');

      if (await setupBtn.count() > 0) {
        await setupBtn.first().click();
        await expect(page.getByTestId('add-target-button')).toBeVisible({ timeout: 10000 });

        // Print Machines button should be attached
        await expect(page.getByTestId('print-machines-button')).toBeAttached();
      }
    }
  });
});
