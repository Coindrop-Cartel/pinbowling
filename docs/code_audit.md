# PinBowling — Code Audit & Refactoring Roadmap

> Audit performed against v1.3.6 (July 2026)

This document identifies code quality issues, architectural debt, and refactoring opportunities across the codebase. Items are organized by severity and grouped by area.

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 **High** | 6 | Bugs, security gaps, or correctness issues |
| 🟡 **Medium** | 10 | Architectural debt, maintainability problems |
| 🟢 **Low** | 7 | Style, cleanup, and minor improvements |

---

## 🔴 High Priority Issues

### H1. OpenAPI Spec is Stale and Structurally Invalid

**File:** [`openapi.yaml`](file:///Users/kylevoorhees/Development/pinbowling/openapi.yaml)

The OpenAPI spec has multiple problems:
- **Invalid structure**: The `schemas` block is nested under `paths` instead of under `components` (line 286). This makes the spec unparsable by standard tooling.
- **Outdated endpoint names**: References `/leagues.php`, `/machines.php`, `/players.php`, etc. instead of the actual `api/league.php`, `api/machine.php`, `api/player.php` paths.
- **Uses `action` parameter**: The codebase was renamed from `action` to `task` (to avoid ad-blocker filters), but the spec still uses `action`.
- **Missing endpoints**: No auth, team, matchup, or cleanup endpoints documented.
- **Missing fields**: League schema doesn't include `type`, `participants`, `scoringFormat`, `seasonScoring`, or `dropLowestWeeks`.

**Impact**: Any client consuming this spec will generate incorrect code.

**Recommendation**: Rewrite `openapi.yaml` from scratch based on actual `api/*.php` endpoint behavior, or remove it until it can be kept in sync.

---

### H2. `db-test.php` References Undefined Variable

**File:** [`db-test.php`](file:///Users/kylevoorhees/Development/pinbowling/db-test.php#L89)

Line 89 references `$DB_NAME` which is not defined in scope. The correct variable is `$configuredDb` (defined on line 21) or `$dbConfig['name']`.

```php
// Line 89 — BUG
echo '...The database <code>' . htmlspecialchars($DB_NAME) . '</code>...';
// Should be:
echo '...The database <code>' . htmlspecialchars($configuredDb) . '</code>...';
```

**Impact**: PHP warning and empty output when database name is unknown.

---

### H3. `ScoringEngine.renderRoundRow()` is a Stub

**File:** [`scripts/core/ScoringEngine.js`](file:///Users/kylevoorhees/Development/pinbowling/scripts/core/ScoringEngine.js#L551-L557)

The `renderRoundRow()` method contains only a placeholder comment ("Copy the entire old body of buildRoundRow here…") and returns an empty `<div>`. If any code path calls this method on the base class instead of an engine subclass, it will produce invisible/empty round rows.

```javascript
async renderRoundRow(round, turnValues, isLastRound, targetPlayer, roundContext) {
    const row = document.createElement('div');
    // Copy the entire old body of buildRoundRow here …
    return row;
}
```

**Impact**: Silent UI failure if reached via base class.

**Recommendation**: Either implement the base behavior or convert to an abstract-style method that throws `Error('Must be implemented by subclass')`.

---

### H4. `migrate.php` Web Access Guard is Commented Out

**File:** [`migrate.php`](file:///Users/kylevoorhees/Development/pinbowling/migrate.php#L17-L21)

The CLI-only guard is commented out:
```php
//if (php_sapi_name() !== 'cli' && !defined('MIGRATE_WEB_ALLOWED')) {
//    http_response_code(403);
//    echo "This script must be run from the command line.\n";
//    exit(1);
//}
```

**Impact**: Anyone who can access the URL can trigger database migrations on the production server.

**Recommendation**: Uncomment the guard or protect it via `.htaccess`.

---

### H5. Wildcard CORS Header in Production

**File:** [`includes/http.php`](file:///Users/kylevoorhees/Development/pinbowling/includes/http.php#L7)

```php
header('Access-Control-Allow-Origin: *');
```

This allows any origin to make requests to the API. Combined with session-based auth, this is a security concern — while the CSRF token provides some protection, the wildcard CORS header weakens the defense-in-depth posture.

**Recommendation**: Set this to the actual production origin, or make it configurable via `.env`.

---

### H6. Inconsistent Auth Check Pattern in `api/auth.php`

**File:** [`api/auth.php`](file:///Users/kylevoorhees/Development/pinbowling/api/auth.php#L8-L10)

```php
if (!isset($GLOBALS['container'])) {
    require_once __DIR__ . '/../includes/bootstrap.php';
}
```

This is the only API endpoint that conditionally requires bootstrap. All other endpoints unconditionally require it. This suggests the file is included from another context (perhaps directly by another PHP file), which is fragile.

**Recommendation**: Standardize to unconditional `require_once` like all other endpoints.

---

## 🟡 Medium Priority Issues

### M1. `getCurrentUser()` Global Function vs `AuthService::getCurrentUser()` Static Method

**Files:** [`includes/auth.php`](file:///Users/kylevoorhees/Development/pinbowling/includes/auth.php#L9-L14), [`service/AuthService.php`](file:///Users/kylevoorhees/Development/pinbowling/service/AuthService.php)

Two parallel implementations exist:
1. Global function `getCurrentUser()` in `includes/auth.php`
2. Static method `AuthService::getCurrentUser()` in the service class

The `Router` class checks `function_exists('getCurrentUser')` before calling it. API endpoints use `AuthService::getCurrentUser()`. Both read from `$_SESSION['user']`.

**Recommendation**: Remove the global function and update `Router::isAuthorized()` to use the static method directly.

---

### M2. Authorization Functions Repeated Across Guards

**File:** [`includes/auth.php`](file:///Users/kylevoorhees/Development/pinbowling/includes/auth.php)

`validateAdminAccess()`, `validateTDAccess()`, and `validateSessionOrSecret()` all follow the same pattern:
1. Check API secret header
2. Check session role
3. Verify CSRF token
4. Deny if none match

This duplicated pattern should be consolidated into a single configurable guard or middleware. The existing docs (`next_steps.md`) already identify this — it remains unaddressed.

**Recommendation**: Create a middleware/guard class with a `requireRole($minimumRole)` method.

---

### M3. API Endpoints Use `if/if/if` Instead of `if/elseif` for HTTP Methods

**Files:** All `api/*.php` endpoints

Most API endpoints chain `if ($method === 'GET')` ... `if ($method === 'POST')` without `elseif`. This means:
- After `sendJson()` terminates execution via `exit()`, this is functionally correct
- But it's semantically misleading and relies on the hidden `exit()` inside `sendJson()`
- The 405 "Unsupported method" fallback at the bottom of some files (e.g., `league.php` line 171) is unreachable for GET/POST/PUT/DELETE

**Recommendation**: Use `if/elseif/else` chains or a `switch` statement for clarity.

---

### M4. Large Page Module Files (God Objects)

**Files:** Several page modules exceed 20KB:

| File | Size | Lines (est.) |
|------|------|--------------|
| `scripts/pages/leaguesPage.js` | 29.3 KB | ~800 |
| `scripts/pages/scoresPage.js` | 29.2 KB | ~800 |
| `scripts/pages/standingsPage.js` | 25.1 KB | ~700 |
| `scripts/pages/playPage.js` | 24.7 KB | ~700 |
| `scripts/pages/eventSetupPage.js` | 22.6 KB | ~650 |
| `scripts/core/engines/BaseballEngine.js` | 30.4 KB | ~850 |

These files mix data fetching, DOM manipulation, event handling, and business logic in a single module.

**Recommendation**: Extract reusable patterns (table rendering, form handling, search/filter) into shared modules under `scripts/ui/`.

---

### M5. Monolithic CSS File

**File:** [`styles/styles.css`](file:///Users/kylevoorhees/Development/pinbowling/styles/styles.css) — **39 KB**

A single CSS file handles all styling for every page, every theme, every responsive breakpoint, and every component. The format-specific files (`baseball.css`, `bowling.css`, `golf.css`) exist but are very small (319–4230 bytes).

**Recommendation**: Split into logical partials (variables/tokens, layout, components, pages, themes) and concatenate at build time, or at minimum add clear section markers.

---

### M6. `config.php` Does Too Much

**File:** [`includes/config.php`](file:///Users/kylevoorhees/Development/pinbowling/includes/config.php)

This file handles:
- Path constants
- Session initialization and CSRF token generation
- Configuration singleton instantiation
- SiteContent initialization
- Asset versioning from `package.json`
- Security warnings
- Branding variables extraction
- Database DSN construction
- Global `getDbConnection()` function
- Include-path modification
- Loading of `engineMeta.php`, `http.php`, `auth.php`, `serializers.php`

**Recommendation**: This is the legacy bridge file. Incrementally move responsibilities into dedicated classes (session management, asset versioning) and reduce `config.php` to a thin wrapper.

---

### M7. PHPUnit Test Coverage is Minimal

**Files:** `tests/service/`

Only 2 PHP test files exist:
- `LeagueServiceTest.php` — tests serialization, not service methods
- `SerializersTest.php` — tests serializer functions

No tests exist for `AuthService`, `PlayerService`, `LocationService`, `MachineService`, `ScoreService`, `TeamService`, `MatchupService`, or `CleanupService`.

**Recommendation**: Add unit tests for each service class, mocking `DatabaseService`. Focus on business logic validation first (auth rules, score calculations, cascading deletes).

---

### M8. No Composer Autoloader — Manual `require_once` Chains

**File:** [`includes/bootstrap.php`](file:///Users/kylevoorhees/Development/pinbowling/includes/bootstrap.php#L3-L8)

The project has `composer.json` but only uses it for PHPUnit. The application uses manual `require_once` for all includes and a custom `spl_autoload_register` for services. The Http classes use namespaces (`App\Http`) but aren't autoloaded via Composer PSR-4.

**Recommendation**: Add a `psr-4` autoload section to `composer.json` and run `composer dump-autoload` to replace manual requires.

---

### M9. Legacy `$GLOBALS['container']` Pattern

**File:** [`includes/bootstrap.php`](file:///Users/kylevoorhees/Development/pinbowling/includes/bootstrap.php#L116)

The DI container is stored in `$GLOBALS['container']` for access from legacy procedural code. Every API endpoint reads it via `$GLOBALS['container']`. This works but is an anti-pattern — it makes the container a global singleton.

**Recommendation**: This is functional for the current architecture. When/if the app moves to a framework, the container should be passed through the request lifecycle.

---

### M10. `package.json` Contains Unused Dependency

**File:** [`package.json`](file:///Users/kylevoorhees/Development/pinbowling/package.json#L31)

```json
"dependencies": {
    "opencode-lmstudio": "^0.3.1"
}
```

This appears to be a development/AI tool dependency listed under production `dependencies` rather than `devDependencies`. It's likely unused by the application itself.

**Recommendation**: Move to `devDependencies` or remove if not needed.

---

## 🟢 Low Priority Issues

### L1. README Had Duplicate Step 5

The old README listed "Use `db-test.php` in the browser..." as step 5 twice (lines 44 and 78). **Fixed in this update.**

---

### L2. `layout.php` Title Tag is Confusing

**File:** [`includes/layout.php`](file:///Users/kylevoorhees/Development/pinbowling/includes/layout.php#L6)

```php
<title><?php echo isset($pageTitle) ? "Pinball And Stuff - Don't say \"and stuff\"" : "Pinball And Stuff"; ?></title>
```

The title logic is inverted — if `$pageTitle` *is* set, it shows the jokey subtitle instead of the page title. The `$pageTitle` variable is never actually set by any page template, making this dead code.

**Recommendation**: Use the page title properly: `<?php echo ($pageTitle ?? 'Pinball And Stuff'); ?>`.

---

### L3. Stale Documentation References

**Files:** `docs/REFACTORING_COMPLETE.md`, `docs/REFACTORING_GUIDE.md`

These docs reference a directory structure (`service/Auth/AuthService.php`, `service/Player/PlayerService.php`) that doesn't match the current flat structure (`service/AuthService.php`). The refactoring has been completed and the services were flattened.

**Recommendation**: Archive or remove these transitional docs now that the refactoring is complete. Replace with the new `architecture.md`.

---

### L4. `db-test.php` Uses Legacy `getDbConnection()` 

**File:** [`db-test.php`](file:///Users/kylevoorhees/Development/pinbowling/db-test.php#L14)

Uses the global `getDbConnection()` function instead of the DI container.

**Recommendation**: Use `$GLOBALS['container']->get(DatabaseService::class)->getPdo()`.

---

### L5. Import Map `@constants/` Alias is Unused

**File:** [`includes/layout.php`](file:///Users/kylevoorhees/Development/pinbowling/includes/layout.php#L23)

```javascript
"@constants/": "<?php echo $baseUrl; ?>/constants/"
```

There is no `constants/` directory in the project.

**Recommendation**: Remove the dead import map entry.

---

### L6. `state.js` Has BOM Character

**File:** [`scripts/services/state.js`](file:///Users/kylevoorhees/Development/pinbowling/scripts/services/state.js#L1)

The file starts with a UTF-8 BOM (byte order mark: `﻿`). This is generally harmless but can cause issues with certain tools.

**Recommendation**: Re-save without BOM.

---

### L7. Playwright CI Doesn't Have a PHP Backend

**File:** [`.github/workflows/playwright.yml`](file:///Users/kylevoorhees/Development/pinbowling/.github/workflows/playwright.yml)

The CI workflow installs Node dependencies and runs Playwright but doesn't set up PHP or MySQL. E2E tests that require a live backend will fail in CI.

**Recommendation**: Either configure the CI with PHP + MySQL services, or ensure E2E tests can run against a mocked/stubbed backend.

---

## Refactoring Roadmap

### Phase 1: Critical Fixes (1–2 days)

| # | Task | Files |
|---|------|-------|
| 1 | Uncomment `migrate.php` CLI guard | `migrate.php` |
| 2 | Fix `$DB_NAME` reference in `db-test.php` | `db-test.php` |
| 3 | Make CORS origin configurable | `includes/http.php`, `.env.example` |
| 4 | Implement or throw in `ScoringEngine.renderRoundRow()` | `scripts/core/ScoringEngine.js` |
| 5 | Standardize `api/auth.php` bootstrap | `api/auth.php` |

### Phase 2: Architectural Cleanup (1–2 weeks)

| # | Task | Files |
|---|------|-------|
| 6 | Consolidate auth guards into middleware | `includes/auth.php` |
| 7 | Remove `getCurrentUser()` global, use `AuthService::getCurrentUser()` | `includes/auth.php`, `includes/router.php` |
| 8 | Set up Composer PSR-4 autoloading | `composer.json`, `includes/bootstrap.php` |
| 9 | Fix `layout.php` title and remove dead `@constants/` alias | `includes/layout.php` |
| 10 | Remove or rewrite `openapi.yaml` | `openapi.yaml` |
| 11 | Clean up stale transitional docs | `docs/` |

### Phase 3: Code Quality (2–4 weeks)

| # | Task | Files |
|---|------|-------|
| 12 | Add PHPUnit tests for all service classes | `tests/service/` |
| 13 | Split large page modules into focused sub-modules | `scripts/pages/` |
| 14 | Split `styles.css` into logical partials | `styles/` |
| 15 | Reduce `config.php` responsibilities | `includes/config.php` |
| 16 | Fix Playwright CI to include PHP/MySQL or use mocks | `.github/workflows/` |

### Phase 4: Future Enhancements

| # | Task | Notes |
|---|------|-------|
| 17 | Build asset pipeline (CSS/JS bundling) | Would enable CSS partials, minification |
| 18 | Formal middleware pipeline for request handling | Replace ad-hoc auth guards |
| 19 | Error reporting / structured logging | Currently uses `error_log()` |
| 20 | API versioning | Currently no API version prefix |
