# PinBowling — Deployment & Server Setup

PinBowling is designed as a lightweight application suitable for shared Apache hosting or virtual private servers (VPS). 

This guide details the deployment model, initial setup instructions, and routine maintenance/synchronization workflows.

---

## Deployment Model

The deployment workflow assumes a local development setup synced to a remote server using a file transfer protocol (usually SFTP via the VS Code SFTP extension).

### The Local vs. Remote Separation

To ensure security and keep your local development environment from clashing with the production environment, the following directories/files are **completely ignored** from file synchronization:

*   `vendor/` — Local developer dependencies (like PHPUnit) and autoloaders should never be synced. The server manages its own clean, production-only dependencies.
*   `.env` — Contains secrets, passwords, and database configurations unique to the environment.
*   `node_modules/`, `package-lock.json` — Frontend tooling is strictly local for unit/E2E testing and is not run on the server.
*   `migrate.php` — Database migrations script. For security reasons, this is only uploaded temporarily when running migrations and deleted immediately after.
*   `db-test.php` — Diagnostic database script. Left on local machine only.
*   `.git/`, `.vscode/`, `docs/`, `tests/` — Repository and testing overhead.

---

## Initial Server Setup

Follow these steps to set up PinBowling on a new server environment:

### Step 1: Upload the Codebase
Upload the project files to your server web root (e.g., `/var/www/html/pinbowling` or `/public_html`). 
*Ensure the `vendor/` and `.env` files are not uploaded.*

### Step 2: Configure Environment Variables (`.env`)
Create a new `.env` file directly on the server (copy the template from [`.env.example`](file:///Users/kylevoorhees/Development/pinbowling/.env.example)) and fill in:
*   `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`
*   `API_SECRET` (Use a strong unique random string)
*   `ADMIN_PASSWORD` (Use a strong password for management/admin actions)
*   `ALLOWED_ORIGIN` (Optional, defaults to `*`)

### Step 3: Install PHP Dependencies
Connect to your server via SSH, navigate to the web root, and run:
```bash
composer install --no-dev --optimize-autoloader
```
*This installs only production dependencies and generates a highly optimized autoloader.*

### Step 4: Configure Web Server Rewrite Rules
Ensure the `.htaccess` file is uploaded to the root directory. This configures Apache rewrite rules to support clean URL routing (e.g., mapping `/leagues` to `/index.php` and stripping cache-busting `/v1.4.0/` version numbers from asset URLs).

### Step 5: Run Database Migrations
1.  Temporarily upload [`migrate.php`](file:///Users/kylevoorhees/Development/pinbowling/migrate.php) to the server root.
2.  Run the migrations from the command line:
    ```bash
    php migrate.php
    ```
3.  **Delete `migrate.php` from the server immediately.**

---

## Synchronizing Updates

Once the initial setup is complete, making updates is straightforward:

### 1. Code Changes
When you edit files locally (such as controllers under `api/`, templates under `includes/pages/`, or stylesheets), they will automatically upload to the server on save if using VS Code SFTP.

### 2. Dependency Updates
If you add or update production packages in `composer.json`, run this on the server after syncing the files:
```bash
composer install --no-dev --optimize-autoloader
```

### 3. Database Updates
If you pull in new database schema changes:
1.  Upload `migrate.php` temporarily.
2.  Run `php migrate.php` on the server.
3.  Delete `migrate.php` immediately.

### 4. Cache-Busting Static Assets
When you release new CSS/JS changes, update the `"version"` key in [`package.json`](file:///Users/kylevoorhees/Development/pinbowling/package.json). This version string is read by the backend and used as a URL segment (e.g., `/v1.4.0/styles/styles.css`), forcing the browser to bypass cached versions of your assets.
