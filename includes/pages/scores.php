<?php $pageTitle = 'Scores'; ?>
  <main class="page-container">
    <header>
      <h1>Scores</h1>
    </header>
    <div id="tournament-context-area" data-testid="tournament-context-area">
      <div id="tournament-selector-ui" data-testid="tournament-selector-ui" class="tournament-selector-container"></div>
      <div id="tournament-summary" data-testid="tournament-summary" class="card hidden summary-box mb-5 card-pad">
        <span id="tournament-summary-text" data-testid="tournament-summary-text" class="summary-text"></span>
        <div class="flex gap-8">
          <button id="print-sheet-btn" data-testid="print-sheet-button" class="secondary btn-small">Print Blank Score Sheet</button>
          <button id="change-tournament-btn" data-testid="change-tournament-button" class="secondary btn-small">Change</button>
        </div>
      </div>
    </div>
 
    <section id="player-selection-card" data-testid="player-selection-card" class="card hidden mb-5 overflow-hidden">
      <div id="player-selector-ui" data-testid="player-selector-ui" class="card-pad">
        <h2>Player Selection</h2>
        <div class="form-row">
          <input id="player-search" data-testid="player-search-input" type="text" placeholder="Type to search player..." class="search-input-full" />
          <label for="player-select">Player</label>
          <select id="player-select" data-testid="player-select-dropdown"></select>
        </div>
      </div>
      <div id="player-summary" data-testid="player-summary" class="hidden summary-box card-pad">
        <span id="player-summary-text" data-testid="player-summary-text" class="summary-text"></span>
        <button id="change-player-btn" data-testid="change-player-button" class="secondary btn-small">Change</button>
      </div>
    </section>
    <div id="player-warning" data-testid="player-warning-notice" class="notice hidden"></div>
    <section id="matchups-schedule-container" class="card hidden mb-5 card-pad">
      <h2 class="mt-0" style="color: #1976d2;">Weekly Matchups</h2>
      <ul class="week-matchups-list list-unstyled" style="margin-top: 10px; padding: 0;"></ul>
    </section>
    <section id="scoring-card" data-testid="scoring-card" class="card hidden mb-5 card-pad">
      <h2 class="mt-0">Enter Scores</h2>
      <div id="scoring-instruction-notice" data-testid="scoring-instruction-notice" class="hint hidden small-hint"></div>
      <p id="scoring-hint" data-testid="scoring-hint-text" class="hint">Enter the cumulative score after each ball. We will do the rest.</p>
      <form id="player-form" data-testid="score-entry-form">
        <div id="rounds-input" data-testid="rounds-input-container"></div>
      </form>
    </section>
 
    <section id="results-card" data-testid="results-card" class="card hidden mb-5 card-pad">
      <h2 class="mt-0">Results</h2>
      <div id="results-empty" data-testid="results-empty-notice" class="notice hidden"></div>
      <div id="results-panel" data-testid="results-panel" class="hidden">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Machine</th>
              <th>Score</th>
              <th>Total</th> 
            </tr>
          </thead>
          <tbody id="results-body"></tbody>
        </table>
        <div class="total-score">Total Score: <strong id="total-score" data-testid="total-score-display">0</strong></div>
      </div>
    </section>
  </main>