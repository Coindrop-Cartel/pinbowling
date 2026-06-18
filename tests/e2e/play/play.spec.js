import { test, expect } from '@playwright/test';

test.describe('Quick Play Page E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigating to 'play' (no leading slash) resolves correctly against a baseURL with a trailing slash
    // The user is already logged in via global storage state!
    await page.goto('play');
  });

  test('should display existing sessions for today', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Quick Play');
    const sessionsCard = page.locator('#qp-sessions-card');
    await expect(sessionsCard).toBeVisible();
    
    // Verify that the sessions list container exists
    await expect(page.locator('#qp-sessions-list')).toBeVisible();
  });

  test('should toggle the session generator form', async ({ page }) => {
    const createToggle = page.locator('#create-new-toggle');
    const generatorOptions = page.locator('#qp-generator-options');

    // Initially hidden
    await expect(generatorOptions).toBeHidden();

    // Click to reveal
    await createToggle.click();
    await expect(generatorOptions).toBeVisible();
    await expect(createToggle).toHaveText('Cancel');
  });

  test('should generate a preview lineup', async ({ page }) => {
    // 1. Open the generator
    await page.click('#create-new-toggle');

    // 2. Fill out basic details (Assuming at least one location exists in the DB)
    await page.selectOption('#qp-location', { index: 1 });
    await page.locator('#qp-event-name').fill('E2E Test Session');

    // 3. Generate the lineup
    await page.click('#generate-qp-btn');

    // 4. Verify the preview section appears
    const previewSection = page.locator('#qp-preview-section');
    await expect(previewSection).toBeVisible();

    // 5. Check if frames are rendered (assuming default 10 for bowling)
    const frameItems = page.locator('.frame-preview-item');
    const count = await frameItems.count();
    expect(count).toBeGreaterThan(0);
  });
});