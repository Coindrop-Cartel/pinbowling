import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_DIR = path.join(__dirname, 'playwright/.auth');
const ADMIN_AUTH = path.join(AUTH_DIR, 'admin.json');
const TD_AUTH = path.join(AUTH_DIR, 'td.json');
const PLAYER_AUTH = path.join(AUTH_DIR, 'player.json');

// Ensure the auth directory exists before tests run to prevent ENOENT errors during initialization
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  /* Folder for test artifacts such as screenshots, videos, traces, etc. */
  outputDir: 'test-results/',
  /* Maximum time one test can run for. */
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  use: {
     /* Global settings for all tests */
    launchOptions: {
      // Slow down actions by 500ms. 
      // This helps prevent rate-limiting and session collisions on the server.
      slowMo: 500, 
    },
    /* Ensure the baseURL always ends with a slash to support subdirectory routing */
    baseURL: (process.env.PLAYWRIGHT_URL || 'https://10.0.4.23/html/pinbowling/').replace(/\/+$/, '') + '/',
    trace: 'on-first-retry',
    /* Record video on failure for easier debugging */
    video: 'on-first-retry',
    /* Maximum time each action such as `click()` can take. Defaults to 0 (no limit). */
    actionTimeout: 10000,
    navigationTimeout: 15000,
    /* Ignore HTTPS errors for local network IP testing */
    ignoreHTTPSErrors: true,
  },
  projects: [
    // 1. Global Setups
    { name: 'setup', testMatch: /setup\/.*\.setup\.js/ },

    // 2. Admin Tests
    {
      name: 'chromium-admin',
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_AUTH },
      dependencies: ['setup'],
      testIgnore: '**/setup/**',
      testMatch: '**/*.spec.js', // Admin runs all specs found in subdirectories
    },

    // 3. TD Tests (Tournament Directors)
    {
      name: 'chromium-td',
      use: { ...devices['Desktop Chrome'], storageState: TD_AUTH },
      dependencies: ['setup'],
      testIgnore: '**/setup/**',
      testMatch: ['**/management/**/*.spec.js', '**/play/**/*.spec.js', '**/ui/**/*.spec.js'], 
    },

    // 4. Player Tests
    {
      name: 'chromium-player',
      use: { ...devices['Desktop Chrome'], storageState: PLAYER_AUTH },
      dependencies: ['setup'],
      testIgnore: '**/setup/**',
      testMatch: ['**/play/**/*.spec.js', '**/auth/**/*.spec.js', '**/ui/**/*.spec.js'],
    },
  ],
});