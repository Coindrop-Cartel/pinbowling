# PinBowling — Code Audit & Refactoring Roadmap

> Audit performed against v1.3.6 (July 2026). Updated: July 2026 (v1.4.0).

This document identifies code quality issues, architectural debt, and refactoring opportunities across the codebase. Items are tracked with their resolution status as of the v1.4.0 release readiness review.

---

## Summary

| Severity | Count (Original) | Count (Remaining) | Description |
|----------|------------------|-------------------|-------------|
| 🔴 **High** | 6 | 0 | Bugs, security gaps, or correctness issues |
| 🟡 **Medium** | 10 | 2 | Architectural debt, maintainability problems |
| 🟢 **Low** | 7 | 2 | Style, cleanup, and minor improvements |

---

## 🔴 High Priority Issues

### H1. OpenAPI Spec is Stale and Structurally Invalid — `[RESOLVED]`

**File:** [`openapi.yaml`](file:///Users/kylevoorhees/Development/pinbowling/openapi.yaml)

*   **Status**: Fixed in v1.4.0. The `schemas` block is properly nested under `components` instead of under `paths`. Outdated endpoint references and the old `action` parameter have been replaced with the correct `api/*.php` paths and the `task` parameter. Missing endpoints (auth, matchup, cleanup) and missing league attributes are now fully documented. Spec version synced with `1.4.0`.

---

### H2. `db-test.php` References Undefined Variable — `[RESOLVED]`

**File:** [`db-test.php`](file:///Users/kylevoorhees/Development/pinbowling/db-test.php#L89)

*   **Status**: Fixed in v1.4.0. Line 86 now correctly references the `$configuredDb` variable instead of the undefined `$DB_NAME` global.

---

### H3. `ScoringEngine.renderRoundRow()` is a Stub — `[RESOLVED]`

**File:** [`scripts/core/ScoringEngine.js`](file:///Users/kylevoorhees/Development/pinbowling/scripts/core/ScoringEngine.js#L551-L570)

*   **Status**: Fixed in v1.4.0. Added a complete default base implementation of `renderRoundRow()` that builds the core row wrapper (`round-row`) and placeholder container elements, allowing standard page layout flows to fallback gracefully. Subclasses (Bowling, Golf, Baseball) override it as needed.

---

### H4. `migrate.php` Web Access Guard is Commented Out — `[ACCEPTED DEBT]`

**File:** [`migrate.php`](file:///Users/kylevoorhees/Development/pinbowling/migrate.php#L17-L21)

*   **Status**: Ignored. In the production deployment model, the migration runner `migrate.php` is uploaded temporarily via SFTP only when executing schema changes and is immediately deleted from the server root afterwards. Web guard remains commented out.

---

### H5. Wildcard CORS Header in Production — `[RESOLVED]`

**File:** [`includes/http.php`](file:///Users/kylevoorhees/Development/pinbowling/includes/http.php#L7)

*   **Status**: Fixed in v1.4.0. The CORS header reads the allowed origin dynamically using `Configuration::getInstance()->get(['ALLOWED_ORIGIN'], '*')`, making it fully configurable via your `.env` file instead of hardcoded to a wildcard.

---

### H6. Inconsistent Auth Check Pattern in `api/auth.php` — `[RESOLVED]`

**File:** [`api/auth.php`](file:///Users/kylevoorhees/Development/pinbowling/api/auth.php#L8)

*   **Status**: Fixed in v1.4.0. Refactored the endpoint to use unconditional `require_once __DIR__ . '/../includes/bootstrap.php'`, bringing it into alignment with all other API controllers.

---

## 🟡 Medium Priority Issues

### M1. `getCurrentUser()` Global Function vs `AuthService::getCurrentUser()` Static Method — `[RESOLVED]`

**Files:** [`includes/auth.php`](file:///Users/kylevoorhees/Development/pinbowling/includes/auth.php), [`service/AuthService.php`](file:///Users/kylevoorhees/Development/pinbowling/service/AuthService.php)

*   **Status**: Fixed in v1.4.0. Removed the global helper function `getCurrentUser()`. The `Router::isAuthorized()` check has been refactored to call `\App\Service\AuthService::getCurrentUser()` directly.

---

### M2. Authorization Functions Repeated Across Guards — `[RESOLVED]`

**File:** [`includes/auth.php`](file:///Users/kylevoorhees/Development/pinbowling/includes/auth.php)

*   **Status**: Fixed in v1.4.0. Consolidated repeated checks into a single utility helper `authorizeRequest(array $allowedRoles, string $message)`. The existing access gates (`validateAdminAccess`, `validateTDAccess`, and `validateSessionOrSecret`) are now clean wrappers calling this consolidated function.

---

### M3. API Endpoints Use `if/if/if` Instead of `if/elseif` for HTTP Methods — `[RESOLVED]`

**Files:** All `api/*.php` endpoints

*   **Status**: Fixed in v1.4.0. Refactored all HTTP dispatch blocks in the API controllers into native `switch ($method)` structures, ensuring proper catch-alls for unsupported methods and removing implicit dependencies on exit calls inside the response layer.

---

### M4. Large Page Module Files (God Objects) — `[RESOLVED]`

**Files:** `scripts/pages/leaguesPage.js`, `scripts/pages/scoresPage.js`, `scripts/pages/standingsPage.js`, and `scripts/core/engines/BaseballEngine.js`.

*   **Status**: Fixed in v1.4.0. Extracted modular UI helpers, lists registry generators, autoscrollers, and sport-specific double-row scoreboard formats into dedicated modules under `scripts/ui/`. Page controllers and scoring calculation engines now focus purely on logic and data orchestration, reducing total file size and decoupling DOM manipulation.

---

### M5. Monolithic CSS File — `[RESOLVED]`

**File:** [`styles/styles.css`](file:///Users/kylevoorhees/Development/pinbowling/styles/styles.css)

*   **Status**: Fixed in v1.4.0. Split into smaller modular stylesheets: `variables.css`, `layout.css`, `components.css`, `pages.css`, `tv-mode.css`, and `print.css`. Main `styles.css` is now a manifest stylesheet using native `@import` statements to pull in these modular sheets. Scoped standings mark formatting consolidated inside `golf.css`.

---

### M6. `config.php` Does Too Much — `[PARTIALLY RESOLVED]`

**File:** [`includes/config.php`](file:///Users/kylevoorhees/Development/pinbowling/includes/config.php)

*   **Status**: Improved in v1.4.0. Modern components like `Configuration.php` (environment loader), `SiteContent.php` (branding variables), `Container.php` (DI container), and `bootstrap.php` (autoloader and service mappings) now handle core tasks. `config.php` remains as a thinned out legacy bridge loader (~108 lines). (Roadmap Phase 3 for full extraction).

---

### M7. PHPUnit Test Coverage is Minimal — `[OPEN]`

**Files:** `tests/service/`

*   **Status**: Open. PHPUnit coverage covers serializers and basic league transformations (5 tests total). Frontend coverage via Vitest is extensive (972 tests total).
*   **Recommendation**: Add mocks for `DatabaseService` to allow standalone PHP service class testing. (Roadmap Phase 3).

---

### M8. No Composer Autoloader — Manual `require_once` Chains — `[RESOLVED]`

**File:** [`includes/bootstrap.php`](file:///Users/kylevoorhees/Development/pinbowling/includes/bootstrap.php#L3-L8)

*   **Status**: Fixed in v1.4.0. Added a PSR-4 autoload specification in `composer.json` for services, HTTP objects, and includes. Replaced manual include structures in the bootstrap flow with `require_once __DIR__ . '/../vendor/autoload.php'`.

---

### M9. Legacy `$GLOBALS['container']` Pattern — `[OPEN]`

**File:** [`includes/bootstrap.php`](file:///Users/kylevoorhees/Development/pinbowling/includes/bootstrap.php#L101-L102)

*   **Status**: Open. DI container is still registered as a global singleton wrapper for legacy procedural files. This is acceptable for the current architecture. (Roadmap Phase 4).

---

### M10. `package.json` Contains Unused Dependency — `[RESOLVED]`

**File:** [`package.json`](file:///Users/kylevoorhees/Development/pinbowling/package.json)

*   **Status**: Fixed in v1.4.0. Removed the unused `opencode-lmstudio` package and cleaned up the `dependencies` key from `package.json`.

---

## 🟢 Low Priority Issues

### L1. README Had Duplicate Step 5 — `[RESOLVED]`

*   **Status**: Fixed. Duplicate step 5 removed.

---

### L2. `layout.php` Title Tag is Confusing — `[ACCEPTED DEBT]`

**File:** [`includes/layout.php`](file:///Users/kylevoorhees/Development/pinbowling/includes/layout.php#L6)

*   **Status**: Ignored. Inverted title logic is accepted as-is.

---

### L3. Stale Documentation References — `[RESOLVED]`

*   **Status**: Fixed. Stale transitional files (`REFACTORING_GUIDE.md`, `REFACTORING_COMPLETE.md`) have been deleted from `docs/`.

---

### L4. `db-test.php` Uses Legacy `getDbConnection()` — `[OPEN]`

**File:** [`db-test.php`](file:///Users/kylevoorhees/Development/pinbowling/db-test.php#L14)

*   **Status**: Open. Diagnostic test script still calls the legacy global.
*   **Recommendation**: Replace with a call to the container: `$GLOBALS['container']->get(DatabaseService::class)->getPdo()`. (Roadmap Phase 2).

---

### L5. Import Map `@constants/` Alias is Unused — `[RESOLVED]`

**File:** [`includes/layout.php`](file:///Users/kylevoorhees/Development/pinbowling/includes/layout.php)

*   **Status**: Fixed in v1.4.0. The unused `@constants/` path entry was removed from the import map in the layout shell.

---

### L6. `state.js` Has BOM Character — `[RESOLVED]`

**File:** [`scripts/services/state.js`](file:///Users/kylevoorhees/Development/pinbowling/scripts/services/state.js#L1)

*   **Status**: Fixed in v1.4.0. UTF-8 Byte Order Mark (BOM) was removed from the file.

---

### L7. Playwright CI Doesn't Have a PHP Backend — `[OPEN]`

**File:** [`.github/workflows/playwright.yml`](file:///Users/kylevoorhees/Development/pinbowling/.github/workflows/playwright.yml)

*   **Status**: Open. CI workflow executes Playwright tests but does not set up a mock or live backend services.
*   **Recommendation**: Configure a database container and PHP CGI environment in the workflow runner, or mock all network calls. (Roadmap Phase 3).

---

## Refactoring Roadmap

### Phase 1: Critical Fixes — `[COMPLETE]`

*   Uncomment `migrate.php` CLI guard (Ignored — deleted after use)
*   Fix `$DB_NAME` reference in `db-test.php`
*   Make CORS origin configurable
*   Implement or throw in `ScoringEngine.renderRoundRow()`
*   Standardize `api/auth.php` bootstrap

### Phase 2: Architectural Cleanup — `[COMPLETE]`

*   Consolidate auth guards into middleware
*   Remove `getCurrentUser()` global, use `AuthService::getCurrentUser()`
*   Set up Composer PSR-4 autoloading
*   Fix `layout.php` title and remove dead `@constants/` alias (ignored / fixed)
*   Remove or rewrite `openapi.yaml`
*   Clean up stale transitional docs

### Phase 3: Code Quality — `[IN PROGRESS]`

| # | Task | Files |
|---|------|-------|
| 12 | Add class & method documentation blocks to services and helpers | `service/*.php`, `includes/Container.php` |
| 13 | Configure SFTP ignored vendor files for production safety | `.vscode/sftp.json` |
| 14 | Add PHPUnit tests for all service classes | `tests/service/` |
| 15 | Split large page modules into focused sub-modules — `[RESOLVED]` | `scripts/pages/` |
| 16 | Split `styles.css` into logical partials — `[RESOLVED]` | `styles/` |
| 17 | Reduce `config.php` responsibilities | `includes/config.php` |
| 18 | Fix Playwright CI to include PHP/MySQL or use mocks | `.github/workflows/` |

### Phase 4: Future Enhancements

*   Build asset pipeline (CSS/JS bundling)
*   Formal middleware pipeline for request handling
*   Error reporting / structured logging
*   API versioning
