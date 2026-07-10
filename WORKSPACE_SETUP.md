# Workspace Setup Guide

This guide details how to set up the **PinBowling** repository in a new workspace, including file copying, configuration, and recommended VS Code extensions for testing and deployment.

---

## 1. Files to Copy Over (Not Tracked by Git)

The following files are defined in `.gitignore` to protect credentials, environment details, or local caching. You will need to manually copy or recreate them in your new workspace:

### Environment Configuration (`.env`)
- **Action**: Copy your active `.env` file to the new workspace's root directory.
- **Alternative**: If you don't have the active `.env` file, copy [.env.example](file:///.env.example) to `.env` and fill in the local database credentials and API secrets:
  ```bash
  cp .env.example .env
  ```

### Deployment Configuration (`.vscode/sftp.json`)
- **Action**: Copy the `.vscode/sftp.json` file manually from your current environment.
- **Why**: This file contains FTP/SFTP deployment credentials for staging and beta servers and is ignored by Git for security reasons.

---

## 2. Dependencies & Database Setup

After copying the repository, run the following setup commands:

### Backend Dependencies (Composer)
```bash
composer install
```
*Note: Although `composer.lock` is ignored in `.gitignore`, it is tracked in Git to ensure consistent packages.*

### Frontend Dependencies (npm)
```bash
npm install
```
*Note: `package-lock.json` is also tracked in Git.*

### Database Initialization & Migration
Ensure your local MySQL server is running and database details match your `.env` configuration. Then run:
```bash
php migrate.php
```
This runs the schema migrations and sets up your local database tables.

---

## 3. Recommended VS Code Extensions

To test, run, and deploy PinBowling efficiently within VS Code, install the following extensions:

1. **SFTP** (by *Natizyskunk* or *liximomo*)
   - **Purpose**: Enables the automatic uploading of files on save using the configured `.vscode/sftp.json`.
2. **Vitest** (by *Vitest*)
   - **Purpose**: Integrates Vitest with VS Code's native testing panel to run and debug JS unit tests.
3. **Playwright Test for VS Code** (by *Microsoft*)
   - **Purpose**: Allows you to run, debug, and record Playwright end-to-end tests from the editor.
4. **PHP Intelephense** (by *Ben Mewburn*)
   - **Purpose**: Provides code completion, signature help, code navigation, and diagnostics for PHP 8.4+.

---

## 4. Running the Test Suites

Once setup is complete, you can run the tests using:

### PHP Unit Tests
```bash
./vendor/bin/phpunit
```

### Javascript Unit Tests
```bash
npm run test:unit
```

### End-to-End Tests (Playwright)
```bash
npm run test:e2e
```
Or view the Playwright UI runner:
```bash
npm run test:ui
```
