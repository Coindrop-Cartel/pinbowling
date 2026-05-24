# PinBowling PHP MySQL Backend

This app now uses a PHP backend for MySQL persistence.

## Setup

1. Upload the site files to a PHP-enabled web host.
2. Create a MySQL database through your hosting control panel.
3. Set the database hostname, name, username, and password in `config.php`.
   - If your host lists a MySQL hostname, do not use `localhost` unless it is explicitly the listed value.
   - Use the same hostname exactly as shown under MySQL Databases.
4. Make sure `config.php`, `api/machines.php`, `api/players.php`, and `api/scores.php` are on the server.

## PHP Backend Configuration

Edit `config.php` and replace the placeholder values:

- `DB_HOST`
- `DB_NAME`
- `DB_USER`
- `DB_PASS`

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

- The frontend now calls PHP endpoints under `api/`.
- The database is accessed through PDO, which is supported on modern PHP hosts.
- On many shared hosts, external database connections are blocked, so the app must run on the same hosting platform as the MySQL database.
