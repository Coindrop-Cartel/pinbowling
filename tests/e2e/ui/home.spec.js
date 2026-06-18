import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('');
  });

  test('should display hero section with format logos', async ({ page }) => {
    await expect(page.locator('h1, .hero-section')).toBeVisible();

    // Both format logos should be present
    const bowlingLogo = page.locator('.hero-logo-btn[data-format="bowling"]');
    const golfLogo = page.locator('.hero-logo-btn[data-format="golf"]');
    await expect(bowlingLogo).toBeVisible();
    await expect(golfLogo).toBeVisible();
  });

  test('should display hero action buttons', async ({ page }) => {
    const actionButtons = page.getByTestId('hero-action-buttons');
    await expect(actionButtons).toBeVisible();

    // All three CTA links should be present
    await expect(page.locator('#cta-play')).toBeVisible();
    await expect(page.locator('#cta-manage-leagues')).toBeVisible();
    await expect(page.locator('#cta-enter-scores')).toBeVisible();
  });

  test('should display scoring logic section', async ({ page }) => {
    const scoringText = page.locator('#scoring-logic-text');
    await expect(scoringText).toBeVisible();
    await expect(scoringText).not.toBeEmpty();
  });

  test('should navigate to Quick Play when Play CTA is clicked', async ({ page }) => {
    await page.click('#cta-play');
    await expect(page.getByTestId('quick-play-form-card')).toBeVisible();
  });

  test('should navigate to Leagues when Manage Leagues CTA is clicked', async ({ page }) => {
    await page.click('#cta-manage-leagues');
    await expect(page.getByTestId('leagues-list')).toBeVisible();
  });

  test('should navigate to Scores when Enter Scores CTA is clicked', async ({ page }) => {
    await page.click('#cta-enter-scores');
    await expect(page.getByTestId('tournament-context-area')).toBeVisible();
  });

  test('should display About and AI Disclosure sections', async ({ page }) => {
    await expect(page.locator('h2', { hasText: /about the project/i })).toBeVisible();
    await expect(page.locator('h2', { hasText: /ai disclosure/i })).toBeVisible();
  });
});
