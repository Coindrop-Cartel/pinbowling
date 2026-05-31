<?php $pageTitle = 'Quick Play'; ?>
<main class="page-container">
  <header>
    <h1>Quick Play</h1>
    <p>Find an existing session for today or create a new custom lineup.</p>
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
          <label for="qp-event-name">Session Name</label>
          <input type="text" id="qp-event-name" placeholder="e.g. Casual Friday Pinball">
        </div>
      </div>

      <div id="qp-setup-summary" class="hidden" style="display: flex; justify-content: space-between; align-items: center; background: #f9f9f9; padding: 10px 15px; border-radius: 4px; margin-bottom: 15px; border: 1px solid #eee;">
        <div id="qp-summary-text" style="font-weight: bold;"></div>
        <button type="button" id="qp-change-setup-btn" class="secondary" style="padding: 4px 10px; font-size: 0.8rem;">Change</button>
      </div>

      <div id="qp-generator-options" class="form-row hidden" style="display: flex; gap: 15px; border-top: 1px solid #eee; padding-top: 20px; margin-top: 20px;">
        <div style="flex: 1;">
          <label for="qp-frames">Number of Frames</label>
          <select id="qp-frames">
            <option value="3">3 Frames</option>
            <option value="5">5 Frames</option>
            <option value="10" selected>10 Frames</option>
          </select>
        </div>
        <div style="flex: 1;">
          <label for="qp-difficulty">Target Difficulty</label>
          <select id="qp-difficulty">
            <option value="easy">Easy</option>
            <option value="med" selected>Medium</option>
            <option value="hard">Hard</option>
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
    <h2>Review Lineup</h2>
    <div id="qp-frames-list" style="margin-bottom: 20px;"></div>
    <div class="form-actions">
      <button id="finalize-qp-btn" class="primary">Create Session</button>
    </div>
  </section>
</main>