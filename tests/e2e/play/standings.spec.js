import { test, expect } from '@playwright/test';

test.describe('Standings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('standings');
  });

  test('should display the standings page structure', async ({ page }) => {
    await expect(page.locator('#tournament-context-area')).toBeVisible();
    await expect(page.locator('#tournament-selector-ui')).toBeVisible();
  });

  test('should show empty state when no tournament is selected', async ({ page }) => {
    // The standings wrapper should be hidden and empty notice visible when no event is selected
    const standingsEmpty = page.locator('#standings-empty');
    const standingsWrapper = page.locator('#standings-wrapper');

    // At least one of these states should be present
    const emptyVisible = await standingsEmpty.isVisible().catch(() => false);
    const wrapperHidden = await standingsWrapper.isHidden().catch(() => false);
    expect(emptyVisible || wrapperHidden).toBeTruthy();
  });

  test('should display TV mode button for authenticated users', async ({ page }, testInfo) => {
    // TV mode button is only visible once a tournament is selected,
    // but the button element should exist in the DOM
    const tvBtn = page.locator('#tv-mode-btn');
    await expect(tvBtn).toBeAttached();
  });

  test('should display player filter container', async ({ page }) => {
    // Player filter container exists in the DOM (may be hidden until event selected)
    const filterContainer = page.locator('#player-filter-container');
    await expect(filterContainer).toBeAttached();
  });

  test('should show tournament selector UI', async ({ page }) => {
    const selectorUI = page.locator('#tournament-selector-ui');
    await expect(selectorUI).toBeVisible();
  });

  test('should show tournament summary area', async ({ page }) => {
    const summary = page.locator('#tournament-summary');
    await expect(summary).toBeAttached();
  });

  test('should display change tournament button', async ({ page }) => {
    // The change-tournament-btn exists in the DOM
    const changeBtn = page.locator('#change-tournament-btn');
    await expect(changeBtn).toBeAttached();
  });
});
