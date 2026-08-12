<?php $pageTitle = 'WPPR Points Estimator'; ?>
<main id="wppr-calculator" class="page-container wppr-page">
  <header>
    <h1>WPPR Points Estimator</h1>
    <p>Estimate WPPR point values and distribution for a tournament using official IFPA v6.2 calculations.</p>
  </header>

  <div class="wppr-disclaimer alert alert-info mb-15">
    <strong>Disclaimer:</strong> This estimator calculates approximate IFPA WPPR point distributions based on IFPA v6.2 formulas. Official IFPA values may vary based on exact tie-breaker rulings, player activity status, and final IFPA verification.
  </div>

  <div class="wppr-grid">
    <!-- Tournament & Event Import Card -->
    <section class="card wppr-params-card mb-20">
      <h2>Tournament Setup & Event Import</h2>
      
      <div class="form-group mb-15">
        <label for="wppr-event-select">Import Completed Pin-Golf / Pin-Bowling Event</label>
        <select id="wppr-event-select" class="form-control">
          <option value="">-- Select Completed Event --</option>
        </select>
        <small class="hint">Imports players in finishing order and auto-calculates TGP % based on PGM rules (holes played & average score).</small>
      </div>

      <div id="wppr-pgm-banner" class="alert alert-info hidden mb-15">
        <strong>Pin-Golf PGM Calculation:</strong> <span id="wppr-pgm-text"></span>
      </div>

      <form id="wppr-params-form" class="wppr-form">
        <div class="form-grid">
          <div class="form-group">
            <label for="wppr-tgp-input">TGP Percentage (%)</label>
            <input type="number" id="wppr-tgp-input" min="0" max="200" step="0.1" value="100" class="form-control" required />
            <small class="hint">Tournament Grading Percentage (up to 200%).</small>
          </div>
          <div class="form-group">
            <label for="wppr-booster-select">Event Booster</label>
            <select id="wppr-booster-select" class="form-control">
              <option value="1.0">None (100%)</option>
              <option value="1.25">Certified (125%)</option>
              <option value="1.5">Championship / Certified+ (150%)</option>
              <option value="2.0">Major Championship (200%)</option>
            </select>
            <small class="hint">IFPA event classification weight.</small>
          </div>
        </div>
      </form>
    </section>

    <!-- Players Input Card -->
    <section class="card wppr-players-card mb-20">
      <div class="flex-between gap-10 align-center mb-10">
        <div>
          <h2>Players (<span id="wppr-player-count-badge">0</span>)</h2>
          <p class="hint margin-0">Player finishing order imported from event. Edit IFPA ID, Rank, or Rating and click Save to update database and recalculate.</p>
        </div>
      </div>

      <div class="table-responsive">
        <table id="wppr-players-input-table" class="data-table input-table">
          <thead>
            <tr>
              <th style="width: 40px;">#</th>
              <th>Name</th>
              <th style="width: 120px;">IFPA ID</th>
              <th style="width: 120px;">IFPA Rank</th>
              <th style="width: 140px;">Match Play Rating</th>
              <th style="width: 60px;" class="text-center col-save">Save</th>
            </tr>
          </thead>
          <tbody id="wppr-players-tbody">
            <!-- Dynamic player input rows -->
          </tbody>
        </table>
      </div>
    </section>

    <!-- Results Section (Initially Hidden or empty until calculation) -->
    <div id="wppr-results-section" class="hidden">
      <!-- Summary Cards -->
      <section class="card mb-20">
        <div class="flex-between align-center mb-15">
          <h2 class="m-0">Calculated Tournament Values</h2>
          <button type="button" id="wppr-print-btn" class="btn-standard secondary flex-align-center gap-5">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            <span>Print Report</span>
          </button>
        </div>
        <div class="stats-grid">
          <div class="stat-card primary">
            <span class="stat-label">1st Place WPPR Value</span>
            <span id="wppr-val-1st" class="stat-value">0.00</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Base Value</span>
            <span id="wppr-val-base" class="stat-value">0.00</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Rating TVA</span>
            <span id="wppr-val-rating-tva" class="stat-value">0.00</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Ranking TVA</span>
            <span id="wppr-val-ranking-tva" class="stat-value">0.00</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">TGP %</span>
            <span id="wppr-val-tgp" class="stat-value">100%</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Event Booster</span>
            <span id="wppr-val-booster" class="stat-value">100%</span>
          </div>
        </div>
      </section>

      <!-- Event Performance & PGM Breakdown Table (shown when an event is imported) -->
      <section id="wppr-event-stats-card" class="card mb-20 hidden">
        <h2>Imported Event Performance & PGM Stats</h2>
        <p class="hint">Detailed breakdown of player scores, balls/strokes played, and average per frame used for PGM calculation.</p>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 60px;">Pos.</th>
                <th>Name</th>
                <th>Total Score</th>
                <th>Balls/Strokes Played</th>
                <th>Avg / Frame</th>
                <th>Strikes (Ball 1)</th>
                <th>Spares (Ball 2)</th>
                <th>Opens (Misses)</th>
              </tr>
            </thead>
            <tbody id="wppr-event-stats-tbody">
              <!-- Rendered event stats rows -->
            </tbody>
          </table>
        </div>
      </section>

      <!-- WPPR Distribution Table -->
      <section class="card mb-20">
        <h2>WPPR Distribution (Open)</h2>
        <p class="hint">Breakdown of points awarded per finishing position (Linear + Dynamic).</p>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 60px;">Pos.</th>
                <th>Name</th>
                <th>Lin.</th>
                <th>Dyn.</th>
                <th>Total WPPR</th>
              </tr>
            </thead>
            <tbody id="wppr-distribution-tbody">
              <!-- Rendered distribution rows -->
            </tbody>
          </table>
        </div>
      </section>

      <!-- Player Contributions Table -->
      <section class="card mb-20">
        <h2>Player Contributions (Open)</h2>
        <p class="hint">How each player contributes to the tournament's base value and TVA strength of field.</p>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>IFPA ID</th>
                <th>IFPA Rank</th>
                <th>Match Play Rating</th>
                <th>Base Contrib.</th>
                <th>Rating TVA</th>
                <th>Ranking TVA</th>
                <th>Total Contrib.</th>
              </tr>
            </thead>
            <tbody id="wppr-contributions-tbody">
              <!-- Rendered contribution rows -->
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</main>
