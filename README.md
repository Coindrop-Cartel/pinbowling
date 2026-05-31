# PinBowling PHP MySQL Backend

This app now uses a PHP backend for MySQL persistence.

## Overview

PinBowling is a specialized scoring application designed to map pinball scores to bowling-style frames and strikes. This repository contains the backend data services (PHP/MySQL) and the client-side logic (Vanilla JS) responsible for managing leagues, events, players, and real-time score calculation.

## Project Structure

- `/service`: RESTful PHP data services for CRUD operations.
- `/includes`: Core configuration, database initialization, and security utilities.
- `/scripts`: Frontend ES modules for UI components, scoring engines, and API interaction.
- `/docs`: Documentation including API specifications.
- `js-config.php`: Secure bridge for passing server-side environment variables to the frontend.

## API Documentation

The project includes a comprehensive OpenAPI 3.0 specification. You can find the detailed endpoint documentation in:
`docs/openapi.yaml`

Key endpoints include:
- `service/leagueService.php`: Manage bowling leagues, seasonal events, and rosters.
- `service/machineService.php`: Manage the global machine registry and event-specific target scores.
- `service/playerService.php`: Manage the global player database.
- `service/locationService.php`: Manage physical venues and their machine lineups (templates).
- `service/scoreService.php`: Record and retrieve frame-by-frame scores.

## Security

Write operations are protected by an `X-PB-SECRET` header. League-specific actions can also be protected by a league password provided via the `X-LEAGUE-PASSWORD` header.

## Setup

1. Upload the site files to a PHP-enabled web host.
2. Create a MySQL database through your hosting control panel.
3. Set the database hostname, name, username, and password in `config.php`.
   - If your host lists a MySQL hostname, do not use `localhost` unless it is explicitly the listed value.
   - Use the same hostname exactly as shown under MySQL Databases.
   - If you upload a `.env` file with these values, `config.php` will also read it automatically.
4. Make sure config.php and the contents of the /service directory are on the server.
5. Use `db-test.php` in the browser to verify the PHP-to-MySQL connection.

## PHP Backend Configuration

Edit `config.php` and replace the placeholder values:

- `DB_HOST`
- `DB_NAME`
- `DB_USER`
- `DB_PASS`

## Deployment

To ensure client-side cache clearing after a deployment, make sure to **touch `index.php`** on the server. The application uses the modification timestamp of this file as the `UI_VERSION` for CSS and JS query strings.

If your hosting provider exports environment variables for database credentials, the scripts can also read:

- `DB_HOST` or `MYSQL_HOST`
- `DB_NAME` or `MYSQL_DATABASE`
- `DB_USER` or `MYSQL_USER`
- `DB_PASS` or `MYSQL_PASSWORD`

## Database Structure

The PHP backend automatically creates the following tables if they do not already exist:

- `Machines`
- `Players`
- `Scores`

## Notes

- The frontend now calls PHP data services under `service/`.
- The database is accessed through PDO, which is supported on modern PHP hosts.
- On many shared hosts, external database connections are blocked, so the app must run on the same hosting platform as the MySQL database.

Visit `index.php` to start the application.
