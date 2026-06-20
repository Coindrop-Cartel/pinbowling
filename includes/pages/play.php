<?php $pageTitle = 'Quick Play'; ?>
<main class="page-container">
  <header class="flex-between mb-20">
    <div>
      <h1>Quick Play</h1>
      <p>Find an existing session for today or create a new custom lineup.</p>
    </div>
  </header>

  <!-- Session Creation and Search -->
  <section id="quick-play-form-card" data-testid="quick-play-form-card" class="card">
    <form id="quick-play-form" data-testid="quick-play-form">
      <h2>Session Details</h2>
 
      <div id="qp-setup-fields" data-testid="qp-setup-fields">
        <div class="form-row">
          <label for="qp-location">Location</label>
          <select id="qp-location" data-testid="qp-location-select" required>
            <option value="">-- Select Location --</option>
          </select>
        </div>
        <div class="form-row">
          <label for="qp-format">Scoring Format</label>
          <select id="qp-format" data-testid="qp-format-select"></select>
        </div>
        <div class="form-row">
          <label for="qp-event-name">Session Name</label>
          <input type="text" id="qp-event-name" data-testid="qp-event-name-input" placeholder="e.g. Casual Friday Pinball">
        </div>
      </div>
 
      <div id="qp-setup-summary" data-testid="qp-setup-summary" class="hidden summary-box">
        <div id="qp-summary-text" data-testid="qp-summary-text" class="summary-text"></div>
        <button type="button" id="qp-change-setup-btn" data-testid="qp-change-setup-button" class="secondary btn-small">Change</button>
      </div>
 
      <div id="qp-generator-options" data-testid="qp-generator-options" class="form-row hidden generator-options">
        <div class="flex-1">
          <label for="qp-frames">Number of Rounds</label>
          <select id="qp-frames" data-testid="qp-frames-select">
          </select>
        </div>
        <div class="flex-1">
          <label for="qp-difficulty">Target Difficulty</label>
          <select id="qp-difficulty" data-testid="qp-difficulty-select">
            <option value="easy">Easy</option>
            <option value="med" selected>Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div class="flex-1">
          <label for="qp-scaling">Scoring Profile</label>
          <select id="qp-scaling" data-testid="qp-scaling-select">
            <option value="flat">Flat</option>
            <option value="curved" selected>Curved</option>
          </select>
        </div>
      </div>
 
      <div class="form-actions" data-testid="qp-form-actions">
        <button type="button" id="create-new-toggle" data-testid="create-new-toggle-button" class="secondary">Create New Session</button>
        <button type="submit" id="generate-qp-btn" data-testid="generate-qp-button" class="hidden">Generate Preview</button>
      </div>
    </form>
  </section>
 
  <!-- Existing Sessions Card -->
  <section id="qp-sessions-card" data-testid="qp-sessions-card" class="card">
    <h2>Sessions Today</h2>
    <div id="qp-sessions-list" data-testid="qp-sessions-list">
      <!-- Existing sessions matching the filters will appear here -->
    </div>
  </section>
 
  <!-- Preview Section (Populated after Generation) -->
  <section id="qp-preview-section" data-testid="qp-preview-section" class="card hidden">
  <h2 data-testid="preview-section-title">Review Lineup & Targets</h2>
  <div id="qp-matchups-preview" data-testid="qp-matchups-preview" class="mb-20 hidden"></div>
  <div id="qp-frames-list" data-testid="qp-frames-list" class="mb-20"></div>
    <div class="form-actions" data-testid="qp-preview-actions">
      <button id="finalize-qp-btn" data-testid="finalize-qp-button" class="primary">Create Session</button>
    </div>
  </section>
</main>