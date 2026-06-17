# PinBowling

## Overview

PinBowling is a specialized scoring application designed to map pinball scores to bowling-style frames and strikes. This repository contains the backend data services (PHP/MySQL) and the client-side logic (Vanilla JS) responsible for managing leagues, events, players, and real-time score calculation.

The application supports multiple scoring formats (PinBowling and PinGolf) through a modular Scoring Engine architecture.

## Architecture & Tech Stack

- **Backend**: PHP 8.4+ with a modularized architecture.
- **Database**: MySQL with an automated schema migration system.
- **Frontend**: Vanilla ES6 modules with a Single Page Application (SPA) navigation model.
- **Scoring**: Abstract `ScoringEngine` pattern supporting Bowling and Golf formats.
- **Testing**: Comprehensive coverage via Vitest (JS) and PHPUnit (PHP).

## Project Structure

- `/service`: RESTful PHP data services for CRUD operations.
- `/includes`: Core configuration, database management, and utility modules.
  - `/pages`: PHP templates for SPA content fragments.
- `/scripts`: Frontend application logic.
  - `/core`: Scoring engine implementations (Bowling/Golf).
  - `/pages`: Page-specific UI and orchestration logic.
  - `/services`: API client, Authentication, and Data Normalization.
  - `/ui`: Reusable UI components, dialogs, and branding logic.
- `/docs`: Documentation including API specifications.
- `/tests`: Full-stack test suites.

## Security

Authentication is session-based for browser clients, with role-based access control (Admin, TD, Player) enforced via a declarative permission registry.
- **API**: Write operations are gated by session validation or an `X-PB-SECRET` header for external clients.
- **Secrets**: Sensitive credentials are managed via `.env` and never exposed to the client-side.

## Setup

1. Upload the project files to a PHP-enabled web host.
2. Create a MySQL database through your hosting control panel.
3. Configure your environment:
   - Create a `.env` file in the root directory (see `.env.example` for required variables).
   - Set `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`, `API_SECRET`, and `ADMIN_PASSWORD`.
4. Run `composer install` to set up PHP development dependencies.
5. Use `db-test.php` (requires admin login) to verify the connection.

## Server Configuration (Apache .htaccess / Nginx)

The application uses versioned URLs for static assets (e.g., `/v1.2.6/scripts/main.js`) to ensure proper cache-busting. Your web server must be configured to strip this version prefix before attempting to serve the file from the filesystem.

### Apache (`.htaccess`)

Ensure your `.htaccess` file (located in the project root) contains the following rewrite rule *before* any rules that route requests to `index.php`:

```apache
# Strip version prefix for static assets (CSS, JS, images, etc.)
# This allows for cache-busting while serving the actual file from its original path.
RewriteRule ^(.*)v[0-9\.]+/+(.*)$ $1$2 [L]
```

This rule will internally rewrite a request for `/v1.2.6/scripts/main.js` to `/scripts/main.js`, allowing Apache to find the correct file.

### Nginx

If you are using Nginx, you will need a similar `rewrite` directive in your server block. This example assumes your application is served from the root (`/`):

```nginx
server {
    # ... other configurations ...

    location ~ ^/v[0-9\.]+(/.*)$ {
        rewrite ^/v[0-9\.]+(/.*)$ $1 break;
        try_files $uri $uri/ =404;
    }

    # ... other location blocks, e.g., for index.php fallback ...
}
```
5. Use `db-test.php` in the browser to verify the PHP-to-MySQL connection.

## PHP Backend Configuration

Edit `config.php` and replace the placeholder values:

- `DB_HOST`
- `DB_NAME`
- `DB_USER`
- `DB_PASS`

## Deployment

To ensure client-side cache clearing, increment the version in **`package.json`** (e.g., via `npm version patch`). The application uses this as the single source of truth for asset cache-busting.

## Notes

- On many shared hosts, external database connections are blocked, so the app must run on the same hosting platform as the MySQL database.
- Database migrations are automated and tracked via a versioning system.

Visit `index.php` to start the application.

Visit `index.php` to start the application.
