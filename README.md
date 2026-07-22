# PinBowling

A competitive pinball scoring platform that maps real pinball scores into structured sport-style formats — **Bowling** (frames & marks), **Golf** (strokes vs par), and **Baseball** (head-to-head runs). Manage leagues, events, players, teams, and locations through a responsive web UI with real-time score calculation and TV-mode standings.

## Architecture & Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Backend** | PHP 8.4+ | Modular service-layer architecture with DI container |
| **Database** | MySQL / MariaDB | Automated schema migrations via `migrate.php` |
| **Frontend** | Vanilla ES6 modules | SPA navigation via AJAX partial loads + `popstate` |
| **Scoring** | Abstract `ScoringEngine` | Bowling, Golf, and Baseball engines extend a shared base class |
| **API** | RESTful PHP endpoints | Thin HTTP controllers delegating to service classes |
| **Auth** | Session-based + API key | Role-based access control (Admin, TD, Player) with CSRF protection |
| **Testing** | Vitest (JS) · PHPUnit (PHP) · Playwright (E2E) | Unit, service, and end-to-end coverage |
| **CI** | GitHub Actions | Automated Playwright E2E on push/PR |

## Project Structure

```
pinbowling/
├── api/                    # REST API endpoint controllers (thin HTTP layer)
│   ├── auth.php            # Authentication (login, register, password reset)
│   ├── league.php          # Leagues, events, and roster management
│   ├── player.php          # Player CRUD and role management
│   ├── location.php        # Venues and machine-to-location mapping
│   ├── machine.php         # Master machine registry and target scores
│   ├── score.php           # Score entry and retrieval
│   ├── team.php            # Team management and league assignment
│   ├── matchup.php         # Head-to-head matchup management (Baseball)
│   └── cleanup.php         # Session/data cleanup operations
├── includes/               # Core PHP infrastructure
│   ├── Http/               # PSR-7 inspired Request/Response objects
│   ├── pages/              # PHP templates for SPA content fragments
│   ├── bootstrap.php       # DI container setup and service registration
│   ├── config.php          # Environment loading, versioning, branding
│   ├── Configuration.php   # .env parser and config value accessor
│   ├── Container.php       # Lightweight DI container implementation
│   ├── router.php          # Request routing, auth guards, asset serving
│   ├── auth.php            # Authorization helper functions
│   ├── Serializer.php      # Database row → API response normalizer
│   ├── engineMeta.php      # Engine branding metadata definitions
│   ├── http.php            # CORS, CSRF, JSON response helpers
│   ├── header.php          # Site header template
│   └── layout.php          # HTML shell template (importmap, assets)
├── service/                # Business logic service classes
│   ├── AuthService.php
│   ├── LeagueService.php
│   ├── PlayerService.php
│   ├── LocationService.php
│   ├── MachineService.php
│   ├── ScoreService.php
│   ├── TeamService.php
│   ├── MatchupService.php
│   ├── CleanupService.php
│   ├── DatabaseService.php
│   └── SettingsService.php
├── scripts/                # Frontend ES6 modules
│   ├── core/               # Scoring engine implementations
│   │   ├── ScoringEngine.js    # Abstract base class
│   │   ├── engine.js           # Factory + format registry
│   │   └── engines/            # BowlingEngine, GolfEngine, BaseballEngine
│   ├── pages/              # Page-specific UI and orchestration
│   ├── services/           # API client, auth, state, normalizer
│   ├── ui/                 # Navigation, dialogs, branding, printing
│   ├── main.js             # App entry point and page detection
│   ├── routes.js           # Centralized route configuration
│   ├── types.js            # JSDoc type definitions
│   └── utils.js            # Shared utility functions
├── styles/                 # CSS (main stylesheet + format themes)
├── tests/                  # Test suites
│   ├── unit/               # Vitest unit tests (JS)
│   ├── service/            # PHPUnit service tests (PHP)
│   └── e2e/                # Playwright E2E tests
├── docs/                   # Project documentation
├── migrate.php             # Database migration runner (CLI)
├── index.php               # Application entry point / router
├── openapi.yaml            # API specification (partially outdated)
├── .htaccess               # Apache rewrite rules
├── playwright.config.js    # Playwright E2E configuration
└── vitest.config.js        # Vitest unit test configuration
```

## Setup

### Prerequisites

- PHP 8.4+ with `pdo_mysql` extension
- MySQL 8.0+ or MariaDB 10.6+
- Node.js 18+ (for frontend testing tools)
- Composer 2.x (for PHP dev dependencies)

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/kylevoorhees/pinbowling.git
   cd pinbowling
   composer install
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set your database credentials and security secrets:
   - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`
   - `API_SECRET` — strong secret for external API authentication
   - `ADMIN_PASSWORD` — master admin password

3. **Initialize database:**
   ```bash
   php migrate.php
   ```

4. **Verify setup:**
   Navigate to `/db-test.php` in your browser (requires admin login) to verify the database connection.

### Server Configuration

The application uses versioned URLs for cache-busting static assets (e.g., `/v1.3.6/scripts/main.js`). Your web server must strip this version prefix.

<details>
<summary><strong>Apache (.htaccess)</strong> — included in repo</summary>

```apache
RewriteRule ^(.*)v[0-9\.]+/+(.*)$ $1$2 [L]
```
</details>

<details>
<summary><strong>Nginx</strong></summary>

```nginx
location ~ ^/v[0-9\.]+(/.*)$ {
    rewrite ^/v[0-9\.]+(/.*)$ $1 break;
    try_files $uri $uri/ =404;
}
```
</details>

## Security

| Mechanism | Description |
|-----------|-------------|
| **Session Auth** | Browser clients authenticate via PHP sessions |
| **API Key** | External clients use `X-PB-SECRET` header |
| **RBAC** | Three roles: `admin`, `td` (Tournament Director), `player` |
| **CSRF** | Token-based protection for all state-changing requests |
| **Secrets** | Managed via `.env`, never exposed client-side |

## Testing

```bash
# Run all tests
npm test

# JavaScript unit tests (Vitest)
npm run test:unit

# End-to-end tests (Playwright)
npm run test:e2e
npx playwright test --ui    # Interactive UI mode

# PHP service tests (PHPUnit)
./vendor/bin/phpunit
```

## Deployment

Increment the version in `package.json` before deploying to bust client-side caches:

```bash
npm version patch    # or minor/major
```

The version from `package.json` is the single source of truth — it's read by `config.php` at runtime and injected into all asset URLs.

## Scoring Formats

| Format | Metaphor | Scoring Direction | Rounds | Special Mechanics |
|--------|----------|-------------------|--------|-------------------|
| **Bowling** | Frames & marks | Higher is better | 10 frames | Strike/spare/gutter based on ball count to reach baseline |
| **Golf** | Holes & strokes | Lower is better | 9 or 18 holes | Hole-in-one/birdie/par/bogey relative to target |
| **Baseball** | Innings & runs | Higher is better | 9 innings | Head-to-head matchups, pitcher/batter roles per inning |

## Documentation

See the [`docs/`](docs/) directory for detailed documentation:

- **[Architecture](docs/architecture.md)** — System design, data flow, and component overview
- **[Database Schema](docs/database_schema.md)** — Full table reference, relationships, format matrix
- **[Deployment](docs/deployment.md)** — Server setup, synchronization, cache-busting
- **[Local Setup](docs/local_setup.md)** — New developer environment guide
- **[Engine Contract](docs/engine-contract.md)** — Scoring engine public API specification
- **[UI Testing Plan](docs/ui_testing_documentation.md)** — E2E and visual regression strategy

## License

ISC
