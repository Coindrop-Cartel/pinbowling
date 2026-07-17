import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adminAuthFile = path.join(__dirname, '../../../playwright/.auth/admin.json');

async function ensureLoggedOut(page) {
  const logoutBtn = page.locator('#header-logout-btn');
  if (await logoutBtn.isVisible()) {
    await logoutBtn.click();
    await page.waitForLoadState('networkidle');
  }
}

async function loginAs(page, username, password) {
  await ensureLoggedOut(page);
  const loginBtn = page.locator('#header-login-btn');
  await loginBtn.click();
  await page.fill('#auth-username', username);
  await page.fill('#auth-pass', password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('#auth-modal-form button[type="submit"]')
  ]);
  await expect(page.locator('.auth-user-greeting')).toBeVisible();
}

async function clearStoredPlayer(page) {
  await page.evaluate(() => {
    localStorage.removeItem('currentPlayerId');
    sessionStorage.removeItem('currentPlayerId');
    document.cookie = 'currentPlayerId=; Max-Age=0; path=/;';
  });
}

test.describe('Scoring Workflow', () => {
  test('should save a score and make field readonly', async ({ browser, page }, testInfo) => {
    // Listen for console logs in the page
    page.on('console', msg => console.log(`[PAGE CONSOLE] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', err => console.log(`[PAGE ERROR] ${err.message}`));

    // Determine the testing role and the target player name to register/test
    const isPlayerProj = testInfo.project.name.includes('player');
    const isTdProj = testInfo.project.name.includes('td');
    const targetPlayerName = isPlayerProj ? 'Test Player' : (isTdProj ? 'td' : 'admin');
    
    // 1. Setup Phase: Log in as admin to configure the league, event, and roster using an isolated context
    const adminContext = await browser.newContext({ storageState: adminAuthFile });
    const adminPage = await adminContext.newPage();
    await adminPage.goto('');
    await loginAs(adminPage, 'admin', 'admin');

    // Navigate to Leagues page
    await adminPage.locator('#leagues-nav-item').click();
    await adminPage.click('#nav-leagues');

    // Create unique League using the project name to prevent worker name collisions
    const leagueName = `E2E Scoring League ${testInfo.project.name} ${Date.now()}`;
    await adminPage.click('#create-league-toggle');
    await adminPage.fill('#league-name', leagueName);
    await adminPage.fill('#league-start-date', '2025-01-01');
    await adminPage.click('#create-league-btn');
    await expect(adminPage.locator('#leagues-list')).toContainText(leagueName);

    // Expand League Row
    const leagueRow = adminPage.locator('.league-registry-item', { hasText: leagueName }).first();
    await leagueRow.click();

    // Add Target Player to the League Roster
    await leagueRow.locator('button.add-player-btn').click();
    await adminPage.selectOption('#player-select-modal', { label: targetPlayerName });
    await adminPage.click('#modal-confirm');
    await expect(adminPage.locator('.modal-card')).toBeHidden();
    
    // Wait for the player to appear in the league participants list (ensures the async API request completes)
    await expect(leagueRow.locator('.league-participants-list')).toContainText(targetPlayerName);

    // Add Event to the League
    await leagueRow.getByRole('button', { name: 'Add Event' }).click();
    await adminPage.fill('#event-name', 'Opening Night');
    await adminPage.fill('#event-date', '2025-01-01');
    await adminPage.getByRole('button', { name: 'Save Event' }).click();
    await expect(leagueRow.locator('.league-events-list')).toContainText('Opening Night');

    // Setup the Event (configure targets)
    await leagueRow.locator('.setup-event-btn').click();
    await expect(adminPage.getByTestId('event-setup-tournament-selector-container')).toBeVisible({ timeout: 10000 });
    
    // Add target machine
    await adminPage.click('#add-target-btn');
    await adminPage.selectOption('#machine-select', { index: 1 });
    await adminPage.fill('#value-10', '10000000');
    await adminPage.fill('#value-1', '1000000');
    await adminPage.click('#save-round-btn');
    await expect(adminPage.locator('#rounds-list')).not.toBeEmpty();
    
    // Click DONE to complete setup and go back
    await adminPage.click('#done-setup-btn');
    await expect(adminPage.locator('#leagues-list')).toBeVisible();

    await adminContext.close();

    // 2. Play Phase: Re-login if storageState session expired, otherwise use active session
    await page.goto('');
    const loginBtn = page.locator('#header-login-btn');
    if (await loginBtn.isVisible()) {
      const role = isPlayerProj ? 'player1' : (isTdProj ? 'td' : 'admin');
      await loginAs(page, role, role);
    }

    // 3. Score Entry Phase
    await page.goto('scores');
    await clearStoredPlayer(page);
    await page.reload();
    
    // Select League and Event
    await page.getByTestId('tournament-selector-ui').locator('select').first().selectOption({ label: leagueName });
    await page.getByTestId('tournament-selector-ui').locator('select').nth(1).selectOption({ label: 'Opening Night' });

    // Wait for the player selection card to be visible (indicates leagues/events and user data have finished loading)
    await expect(page.getByTestId('player-selection-card')).toBeVisible({ timeout: 15000 });

    // If the scoring card is not visible yet, select the player manually
    const scoringCard = page.getByTestId('scoring-card');
    if (await scoringCard.isHidden()) {
      await page.fill('#player-search', targetPlayerName);
      await page.selectOption('#player-select', { label: targetPlayerName });
    }

    // Ensure the scoring card is visible before trying to enter scores
    await expect(scoringCard).toBeVisible({ timeout: 10000 });

    // Enter and Save Score
    const firstInput = page.locator('.roll-input:not([disabled]):not([readonly])').first();
    const saveBtn = page.locator('.save-round-button').first();
    
    await firstInput.fill('1234567');
    await expect(saveBtn).toBeEnabled();
    await saveBtn.scrollIntoViewIfNeeded();
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Reload page to test locking/readonly behavior on page refresh
    await page.reload();

    // Wait for the player selection card to load (the active league/event state is preserved)
    await expect(page.getByTestId('player-selection-card')).toBeVisible({ timeout: 15000 });

    // If the scoring card is not visible yet, select the player manually
    if (await scoringCard.isHidden()) {
      await page.fill('#player-search', targetPlayerName);
      await page.selectOption('#player-select', { label: targetPlayerName });
    }
    await expect(scoringCard).toBeVisible({ timeout: 10000 });

    // Re-locate the first input after the page refresh
    const reloadedInput = page.locator('.roll-input').first();

    // Verify readonly behavior based on role
    if (isPlayerProj) {
      await expect(reloadedInput).toHaveAttribute('readonly', '');
    } else {
      await expect(reloadedInput).not.toHaveAttribute('readonly', '');
    }

    // 3. Teardown Phase: Log back in as admin to clean up the created league using an isolated context
    const adminCleanupContext = await browser.newContext({ storageState: adminAuthFile });
    const adminCleanupPage = await adminCleanupContext.newPage();
    await adminCleanupPage.goto('');
    await loginAs(adminCleanupPage, 'admin', 'admin');
    
    // Navigate to Leagues page
    await adminCleanupPage.locator('#leagues-nav-item').click();
    await adminCleanupPage.click('#nav-leagues');

    // Locate the specific league row created by this test
    const leagueRowToDelete = adminCleanupPage.locator('.league-registry-item', { hasText: leagueName }).first();
    await expect(leagueRowToDelete).toBeVisible();
    await leagueRowToDelete.click();

    // Click Delete League button and confirm
    await leagueRowToDelete.locator('button.delete-league-btn').click();
    await adminCleanupPage.click('#modal-confirm');
    await expect(adminCleanupPage.locator('.modal-card')).toBeHidden();

    // Verify only the specific temp league is removed
    await expect(adminCleanupPage.locator('#leagues-list')).not.toContainText(leagueName);

    await adminCleanupContext.close();
  });
});