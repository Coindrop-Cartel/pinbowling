# PinBowling — Refactoring Status & Next Steps

## Completed Items ✅

### 1. Dedicated Router Class
`includes/router.php` — A full `Router` class handles request parsing, versioned asset cache-busting, auth guards, and file mapping. Routing logic has been fully extracted from `index.php`.

### 2. Dependency Injection (DI) Container
`includes/container.php` + `includes/bootstrap.php` — A custom `Container` class is in place. All services are registered and resolved via the container. No more `global` keyword or bare `getDbConnection()` calls in service classes.

### 3. Modularized Configuration
`includes/Configuration.php` — A dedicated `Configuration` class handles `.env` file loading with fallback chains. `includes/config.php` still exists for legacy variable extraction, but the env-loading concern is now separated.

### 4. Standardized Request/Response Objects
`includes/Http/` — PSR-7-inspired `Request`, `Response`, `JsonResponse`, and `RedirectResponse` classes are implemented and loaded via `bootstrap.php`.

### 5. All Service Classes Created (Repository Pattern)
All service classes have been created and registered in the DI container:
- `service/Auth/AuthService.php` ✅
- `service/Player/PlayerService.php` ✅
- `service/League/LeagueService.php` ✅
- `service/Location/LocationService.php` ✅
- `service/Machine/MachineService.php` ✅
- `service/Score/ScoreService.php` ✅
- `service/Team/TeamService.php` ✅
- `service/Matchup/MatchupService.php` ✅
- `service/Cleanup/CleanupService.php` ✅

### 6. HTTP Endpoint Controllers Refactored
All `service/*.php` endpoint files are now thin HTTP controllers that delegate to their respective service classes. The pattern is consistent across all endpoints.

---

## Remaining Work 🔧

### 1. Middleware Pipeline
The authorization guards (`validateAdminAccess`, `validateTDAccess`, `validateSessionOrSecret`) and CSRF verification still live as standalone functions in `includes/auth.php` and are called ad-hoc inside each endpoint controller. These should be extracted into a formal middleware pipeline so security logic can be applied declaratively to route groups rather than repeated per-endpoint.

### 2. `leagueService.php` Still Contains Raw SQL
`service/leagueService.php` (the HTTP controller) still executes raw SQL directly via `$pdo` for several GET operations (bulk fetch, single league detail) rather than delegating fully to `LeagueService`. The `LeagueService` class has the correct methods — the controller just needs to call them instead of running its own queries.

### 3. PHP Unit Tests — Only League Covered
`tests/unit/service/LeagueServiceTest.php` exists but only tests serialization helpers, not the `LeagueService` class methods themselves. No PHPUnit tests exist for `AuthService`, `PlayerService`, `LocationService`, `MachineService`, `ScoreService`, `TeamService`, `MatchupService`, or `CleanupService`.

### 4. `getCurrentUser()` Still a Global Function
`includes/auth.php` defines `getCurrentUser()` as a procedural global function. The `Router::isAuthorized()` method checks for its existence with `function_exists()` before calling it. This should be replaced with `AuthService::getCurrentUser()` (which already exists as a static method) to complete the DI migration.

### 5. Nullable Parameter Deprecations
`PlayerService` and `LeagueService` method signatures may have nullable parameter deprecation warnings in PHP 8.4 (implicit nullable types like `?string $foo = null` vs. explicit `string|null`). These should be audited and updated.

---

## Where We Left Off

All six original refactoring goals have been substantially addressed. The codebase is in a working state with a consistent DI + service-layer architecture. The remaining items above are cleanup and hardening tasks, not blockers. The highest-value next task is **completing the `leagueService.php` controller** to fully delegate to `LeagueService`, followed by **adding PHPUnit tests** for the service classes.
