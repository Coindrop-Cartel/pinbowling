<?php $pageTitle = 'System Maintenance'; ?>
<main class="page-container">
  <div id="auth-header-container" style="display: flex; justify-content: flex-end; padding: 10px 0; margin-bottom: 10px;"></div>
  <header style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
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
      <h2>League Security</h2>
      <p>Reset or clear the password for a specific league.</p>
      <div class="form-row">
        <label for="mgmt-league-select">Select League</label>
        <select id="mgmt-league-select"></select>
      </div>
      <button id="mgmt-reset-pass-btn">Reset League Password</button>
    </section>

    <section class="card">
      <h2>Database Cleanup</h2>
      <p>Remove session leagues and associated data (scores, targets).</p>
      <button id="mgmt-run-cleanup-btn" class="danger">Run Cleanup Script</button>
    </section>
  </div>
</main>