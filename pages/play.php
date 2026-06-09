<?php $pageTitle = 'Quick Play'; ?>
<main class="page-container">
  <header class="flex-between mb-20">
    <div>
      <h1>Quick Play</h1>
      <p>Find an existing session for today or create a new custom lineup.</p>
    </div>
  </header>

  <!-- Session Creation and Search -->
  <section id="quick-play-form-card" class="card">
    <form id="quick-play-form">
      <h2>Session Details</h2>

      <div id="qp-setup-fields">
        <div class="form-row">
          <label for="qp-location">Location</label>
          <select id="qp-location" required>
            <option value="">-- Select Location --</option>
          </select>
        </div>
        <div class="form-row">
          <label for="qp-format">Scoring Format</label>
          <select id="qp-format"></select>
        </div>
        <div class="form-row">
          <label for="qp-event-name">Session Name</label>
          <input type="text" id="qp-event-name" placeholder="e.g. Casual Friday Pinball">
        </div>
      </div>

      <div id="qp-setup-summary" class="hidden summary-box">
        <div id="qp-summary-text" class="summary-text"></div>
        <button type="button" id="qp-change-setup-btn" class="secondary btn-small">Change</button>
      </div>

      <div id="qp-generator-options" class="form-row hidden generator-options">
        <div class="flex-1">
          <label for="qp-frames">Number of Rounds</label>
          <select id="qp-frames">
          </select>
        </div>
        <div class="flex-1">
          <label for="qp-difficulty">Target Difficulty</label>
          <select id="qp-difficulty">
            <option value="easy">Easy</option>
            <option value="med" selected>Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div class="flex-1">
          <label for="qp-scaling">Scoring Profile</label>
          <select id="qp-scaling">
            <option value="flat">Flat</option>
            <option value="curved" selected>Curved</option>
          </select>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" id="create-new-toggle" class="secondary">Create New Session</button>
        <button type="submit" id="generate-qp-btn" class="hidden">Generate Preview</button>
      </div>
    </form>
  </section>

  <!-- Existing Sessions Card -->
  <section id="qp-sessions-card" class="card">
    <h2>Sessions Today</h2>
    <div id="qp-sessions-list">
      <!-- Existing sessions matching the filters will appear here -->
    </div>
  </section>

  <!-- Preview Section (Populated after Generation) -->
  <section id="qp-preview-section" class="card hidden">
  <h2>Review Lineup & Targets</h2>
  <div id="qp-frames-list" class="mb-20"></div>
    <div class="form-actions">
      <button id="finalize-qp-btn" class="primary">Create Session</button>
    </div>
  </section>
</main>