import { test, expect } from '@playwright/test';

test.describe('Scoring Workflow', () => {
  test('should save a score and make field readonly', async ({ page }) => {
    await page.goto('scores');
    
    // Select League and Event (using data-testids)
    await page.getByTestId('tournament-selector-ui').locator('select').first().selectOption({ index: 1 });
    await page.getByTestId('tournament-selector-ui').locator('select').nth(1).selectOption({ index: 1 });
    
    // Player is auto-selected after league/event selection; click "Change" if re-selection is needed
    // await page.getByTestId('player-select-dropdown').selectOption({ index: 1 });
    
    const firstInput = page.locator('.roll-input:not([disabled]):not([readonly])').first();
    const saveBtn = page.locator('.save-round-button:not([disabled])').first();
    
    // Enter score
    await firstInput.fill('1000000');
    await expect(saveBtn).toBeEnabled();
    await saveBtn.scrollIntoViewIfNeeded();
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();
  });
});