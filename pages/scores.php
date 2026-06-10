<?php $pageTitle = 'Scores'; ?>
  <main class="page-container">
    <header>
      <h1>Scores</h1>
    </header>
    <div id="tournament-context-area">
      <div id="tournament-selector-ui" class="tournament-selector-container"></div>
      <div id="tournament-summary" class="card hidden summary-box mb-5 card-pad">
        <span id="tournament-summary-text" class="summary-text"></span>
        <div class="flex gap-8">
          <button id="print-sheet-btn" class="secondary btn-small">Print Blank Score Sheet</button>
          <button id="change-tournament-btn" class="secondary btn-small">Change</button>
        </div>
      </div>
    </div>

    <section id="player-selection-card" class="card hidden mb-5 overflow-hidden">
      <div id="player-selector-ui" class="card-pad">
        <h2>Player Selection</h2>
        <div class="form-row">
          <label for="player-select">Player</label>
          <select id="player-select"></select>
        </div>
      </div>
      <div id="player-summary" class="hidden summary-box card-pad">
        <span id="player-summary-text" class="summary-text"></span>
        <button id="change-player-btn" class="secondary btn-small">Change</button>
      </div>
    </section>
    <div id="player-warning" class="notice hidden"></div>
    <section id="scoring-card" class="card hidden mb-5 card-pad">
      <h2 class="mt-0">Enter Scores</h2>
      <div id="scoring-instruction-notice" class="hint hidden small-hint"></div>
      <p id="scoring-hint" class="hint">Enter the cumulative score after each ball. We will do the rest.</p>
      <form id="player-form">
        <div id="rounds-input"></div>
      </form>
    </section>

    <section id="results-card" class="card hidden mb-5 card-pad">
      <h2 class="mt-0">Results</h2>
      <div id="results-empty" class="notice hidden"></div>
      <div id="results-panel" class="hidden">
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
        <div class="total-score">Total Score: <strong id="total-score">0</strong></div>
      </div>
    </section>
  </main>