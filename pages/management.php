<?php $pageTitle = 'System Management'; ?>
<main class="page-container">
  <header>
    <h1>System Management</h1>
    <p>Admin tools for database maintenance and security.</p>
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
      <p>Remove session leagues and associated data (scores, targets) older than 30 days.</p>
      <button id="mgmt-run-cleanup-btn" class="danger">Run Cleanup Script</button>
    </section>
  </div>
</main>