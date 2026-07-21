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
    const scoringCard = page.locator('[data-testid="scoring-logic-card"]');
    const scoringText = page.locator('#scoring-logic-text');

    // Should be collapsed/hidden by default
    await expect(scoringText).toBeHidden();

    // Click the summary to expand it
    await scoringCard.locator('summary').click();
    await expect(scoringText).toBeVisible();
    await expect(scoringText).not.toBeEmpty();
  });

  test('should display AI Disclosure section when expanded', async ({ page }) => {
    const disclosureCard = page.locator('[data-testid="ai-disclosure-card"]');
    const disclosureText = disclosureCard.locator('p');

    // Should be collapsed/hidden by default
    await expect(disclosureText).toBeHidden();

    // Click the summary to expand it
    await disclosureCard.locator('summary').click();
    await expect(disclosureText).toBeVisible();
  });
});
