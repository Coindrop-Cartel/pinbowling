import { test, expect } from '@playwright/test';

/**
 * E2E tests for the Score Entry Workflow.
 * Validates tournament/player selection, score submission, engine switching, and RBAC locking.
 */
test.describe('Score Entry Workflow', () => {
  
  test.beforeEach(async ({ page }) => {
    // Start at the home page and login as an admin/TD to access all features
    await page.goto('./');
    
    // Trigger auth dialog from the header
    await page.click('#header-login-btn');
    await page.fill('#auth-username', 'admin');
    await page.fill('#auth-pass', 'admin');
    await page.click('#auth-modal-form button[type="submit"]');
    
    // Wait for the page reload triggered by auth.js to complete
    await page.waitForLoadState('networkidle');

    // Verify authenticated state
    await expect(page.locator('#auth-header-container')).toContainText('Hi, admin');
  });

  test('should successfully select a tournament and player, then save a score', async ({ page }) => {
    // Navigate to the Scores page
    await page.click('button:has-text("Let\'s Bowl")');

    // 1. Tournament Selection
    // Interacting with the custom searchable selector
    const tournamentSelector = page.locator('#tournament-selector-container .ss-main');
    await tournamentSelector.click();
    await page.keyboard.type('Tuesday Night Bowling');
    await page.keyboard.press('Enter');

    // 2. Player Selection
    const playerSearch = page.locator('#player-search-container .ss-main');
    await playerSearch.click();
    await page.keyboard.type('Test Player');
    await page.keyboard.press('Enter');

    // 3. Score Entry
    // Enter a value for Ball 1
    const ball1Input = page.locator('input[data-ball="ball1"]');
    await ball1Input.fill('5500000');
    
    // Verify "Save" button reflects the "dirty" state
    const saveBtn = page.locator('#save-scores-btn');
    await expect(saveBtn).toHaveClass(/is-dirty/);
    await expect(saveBtn).toBeEnabled();

    // 4. Submission & Locking Verification
    await saveBtn.click();

    // Verify UI success animation
    await expect(page.locator('.score-entry-row')).toHaveClass(/score-just-updated/);
    
    // Verify locking: non-admin users shouldn't be able to edit this ball now
    // (For the admin test, we check if the input remains enabled or has specific lock UI)
    await expect(ball1Input).not.toHaveAttribute('disabled'); // Admins can still edit
  });

  test('should dynamically update UI labels when switching to a Golf event', async ({ page }) => {
    await page.click('button:has-text("Let\'s Bowl")');

    // Select a Golf format event
    await page.locator('#tournament-selector-container .ss-main').click();
    await page.keyboard.type('PinGolf Championship');
    await page.keyboard.press('Enter');

    // Verify labels update via ScoringEngine (Bowling: "Frame", Golf: "Hole")
    const roundLabel = page.locator('.round-label-text');
    await expect(roundLabel).toHaveText(/Hole/i);

    // Verify the scoring hint reflects the Golf context
    await expect(page.locator('.scoring-hint')).toContainText(/par/i);
  });
});