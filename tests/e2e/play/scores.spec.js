import { test, expect } from '@playwright/test';

test.describe('Scores Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('scores');
  });

  test('should display the scores page structure', async ({ page }) => {
    await expect(page.getByTestId('tournament-context-area')).toBeVisible();
    await expect(page.getByTestId('tournament-selector-ui')).toBeVisible();
  });

  test('should display player selection card', async ({ page }) => {
    await expect(page.getByTestId('player-selection-card')).toBeAttached();
  });

  test('should display player search input', async ({ page }) => {
    await expect(page.getByTestId('player-search-input')).toBeAttached();
  });

  test('should display tournament summary area', async ({ page }) => {
    const summary = page.getByTestId('tournament-summary');
    await expect(summary).toBeAttached();
  });

  test('should display print sheet button', async ({ page }) => {
    const printBtn = page.getByTestId('print-sheet-button');
    await expect(printBtn).toBeAttached();
  });

  test('should display change tournament button', async ({ page }) => {
    const changeBtn = page.getByTestId('change-tournament-button');
    await expect(changeBtn).toBeAttached();
  });

  test('should show scoring card when a player is selected', async ({ page }) => {
    // Select a tournament first (if one exists)
    const tournamentOptions = page.getByTestId('tournament-selector-ui').locator('option');
    const tournamentCount = await tournamentOptions.count();

    if (tournamentCount > 1) {
      // Select the first non-placeholder option
      await page.getByTestId('tournament-selector-ui').locator('select').first().selectOption({ index: 1 });

      // Then select a player
      const playerOptions = page.getByTestId('player-select-dropdown').locator('option');
      const playerCount = await playerOptions.count();

      if (playerCount > 1) {
        await page.getByTestId('player-select-dropdown').selectOption({ index: 1 });

        // Scoring card should become visible
        await expect(page.getByTestId('scoring-card')).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('should display results card structure', async ({ page }) => {
    // Results card exists in the DOM (may be hidden until scores are entered)
    const resultsCard = page.getByTestId('results-card');
    await expect(resultsCard).toBeAttached();
  });

  test('should display player warning area', async ({ page }) => {
    const warning = page.getByTestId('player-warning-notice');
    await expect(warning).toBeAttached();
  });
});
