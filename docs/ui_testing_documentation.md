# PinBowling UI Validation Plan

## Objective
To ensure that new deployments of PinBowling do not introduce regressions in existing UI functionality, visual presentation, or user workflows, and that the application remains stable and usable across supported environments.

---

## I. End-to-End (E2E) Testing

**Purpose:** To simulate real user interactions with the application from start to finish, covering critical user journeys and verifying that all integrated components (frontend, backend API, database) work together as expected.

**Recommended Tooling:** Playwright or Cypress.

**Coverage Status:**
*   [x] Home Page Navigation
*   [x] Scores Page Structure
*   [x] Event Setup Structure
*   [ ] Login / Logout Flow
*   [ ] Full Score Entry & Calculation
*   [ ] RBAC Enforcement (Role-based visibility)
*   [ ] Standings & TV Mode

**Execution:**
*   Run all tests: `npx playwright test`
*   Seed test data: `php tests/bin/seed.php`
*   Open interactive UI: `npx playwright test --ui`
*   Debug a specific file: `npx playwright test tests/e2e/scores.spec.js --debug`
*   Generate new tests: `npx playwright codegen`


**Key Scenarios to Automate:**

1.  **User Authentication & Authorization:**
    *   **Login/Logout:** Successful login (Admin, TD, Player), failed login, and logout.
    *   **RBAC:** Verify navigation item visibility (`#nav-leagues`, etc.) and restricted page access based on roles.

2.  **League & Event Management:**
    *   **CRUD Operations:** Creation and editing of Leagues, Events, and Teams.
    *   **Roster Management:** Adding/removing players from rosters.
    *   **Machine Setup:** Configuring machines and target scores.

3.  **Score Entry Workflow:**
    *   **Selection:** Using the `tournamentSelector` and `playerSearchInstance`.
    *   **Data Entry:** Entering scores for rounds, clicking "Save," and verifying the API response and UI updates.
    *   **Locking Logic:** Enforcing `getScoreAccessLevel` logic where saved scores become read-only for non-privileged users.
    *   **Engine Switching:** Verifying that changing formats (Bowling vs. Golf) updates round labels and calculation logic correctly.

4.  **Standings & Results:**
    *   Navigating the Standings page and verifying correct season summaries and individual event results.

---

## II. UI / Visual Regression Testing

**Purpose:** To detect unintended visual changes in the application's UI, ensuring layout consistency across browsers and devices.

**Key Scenarios to Test:**

1.  **Page Layouts:** Full-page screenshots of all major views (Home, Scores, Standings, Admin panels) at desktop, tablet, and mobile breakpoints.
2.  **Component Rendering:** Consistent styling of searchable selects, dialogs (Alert/Confirm), tables, and buttons.
3.  **Branding & Theming:** Verifying that `applyPreferredTheme` correctly toggles variables between Bowling and Golf themes.
4.  **Dynamic Elements:** Correct rendering of score marks (X, /, birdie symbols) and skeleton loaders.

---

## III. Manual Exploratory Testing

**Purpose:** To uncover bugs, usability issues, and edge cases that automated tests might miss using human intuition.

**Key Areas:**

1.  **Cross-Browser Compatibility:** Testing on Chrome, Firefox, Edge, and Safari (macOS/iOS).
2.  **Device Responsiveness:** Testing touch interactions and keyboard input on physical mobile devices.
3.  **Accessibility (A11y):** Keyboard navigation, screen reader compatibility, and color contrast checks.
4.  **Negative Testing:** Attempting to break inputs with invalid data or rapid clicks.
5.  **Usability:** Evaluating if the flow from "Let's Bowl" to saving a score is intuitive.

---

## IV. Performance Testing (Basic)

**Purpose:** To ensure the application remains responsive under typical usage.

1.  **Load Times:** Measuring page load times for data-heavy views like the Standings page.
2.  **Responsiveness:** Ensuring UI feedback (like the "Saving..." state on buttons) is immediate.

---

## V. Security Testing (Basic)

**Purpose:** To verify authentication and authorization mechanisms.

1.  **Bypass Attempts:** Trying to access `/service/leagueService.php` directly without a session.
2.  **Role Escalation:** Verifying a `player` role cannot trigger `DELETE` requests on leagues.
3.  **CSRF/XSS:** Ensuring `X-CSRF-TOKEN` is present in state-changing requests and that inputs are properly escaped via `escapeHTML`.

---

## VI. Deployment Workflow Integration

### 1. Pre-Deployment (Staging)
*   Run **Vitest Unit Tests**: `npx vitest tests/unit`
*   Run **PHPUnit Tests**: `./vendor/bin/phpunit`
*   Run **E2E Tests** against the staging environment.
*   Run **Visual Regression** comparison against production baselines.

### 2. Post-Deployment (Production)
*   Run a subset of **Smoke Tests** (Login, Score Entry).
*   Conduct **Manual Exploratory** session on new features.

---

## VII. Reporting and Feedback

*   **Bug Tracking:** Log issues with steps to reproduce, expected vs. actual behavior, and environment details.
*   **Regression Cycle:** Re-run E2E suites after any hotfix to ensure no secondary breakages occurred.

---
*Plan generated: 2024-05-22*