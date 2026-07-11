<?php $pageTitle = 'System Maintenance'; ?>
<main class="page-container">
  <header class="flex-between mb-20">
    <div>
      <h1>System Maintenance</h1>
      <p>Admin-only tools for data cleanup and system security.</p>
    </div>
  </header>

  <section id="management-auth-notice" class="card">
    <p>This page requires administrator authentication. Please click the button below to sign in.</p>
    <button id="admin-login-btn">Authenticate Admin Session</button>
  </section>

  <div id="management-tools" class="hidden">
    <section class="card">
      <h2>Database Cleanup</h2>
      <p>Remove session leagues and associated data (scores, targets).</p>
      <button id="mgmt-run-cleanup-btn" class="danger">Run Cleanup Script</button>
    </section>

    <section class="card mt-20 hidden" id="mgmt-diagnostics-section">
      <h2>System Diagnostics</h2>
      <p>Verify database connection status and inspect system parameters.</p>
      <button id="mgmt-load-diag-btn" class="btn-mgmt">Fetch Diagnostics</button>
      <div id="mgmt-diag-results" class="hidden mt-10 small">
        <hr class="mb-10">
        <table class="data-table">
          <tbody>
            <tr><td><strong>Connection Status:</strong></td><td id="diag-status" style="color:green; font-weight:bold;">Connected</td></tr>
            <tr><td><strong>PHP Version:</strong></td><td id="diag-php-version"></td></tr>
            <tr><td><strong>PDO Drivers:</strong></td><td id="diag-pdo-drivers"></td></tr>
            <tr><td><strong>Connected Database Info:</strong></td><td id="diag-connected-db"></td></tr>
            <tr><td><strong>Configured DSN Info:</strong></td><td id="diag-configured-dsn"></td></tr>
            <tr><td><strong>.env File:</strong></td><td id="diag-env-status"></td></tr>
            <tr><td><strong>Database Tables:</strong></td><td id="diag-tables-list"></td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>

  <div id="mgmt-ui-version" class="version-footer hidden">
    <label class="debug-toggle-label">
      <input type="checkbox" id="mgmt-debug-toggle" class="mb-0">
      <span>Debug Logs</span>
    </label>
    <span id="mgmt-ui-version-text">System UI Version: <?php echo $uiVersion; ?></span>
  </div>
</main>