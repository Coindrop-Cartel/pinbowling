<?php $pageTitle = 'Scores'; ?>
  <main class="page-container">
    <header>
      <h1>Scores</h1>
    </header>
    <div id="tournament-context-area">
      <div id="tournament-selector-ui" class="tournament-selector-container"></div>
      <div id="tournament-summary" class="card hidden" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; margin-bottom: 5px;">
        <span id="tournament-summary-text" style="font-weight: bold; font-size: 1.1rem;"></span>
        <div style="display: flex; gap: 8px;">
          <button id="print-sheet-btn" class="secondary" style="padding: 4px 10px; font-size: 0.85rem;">Print Blank Score Sheet</button>
          <button id="change-tournament-btn" class="secondary" style="padding: 4px 10px; font-size: 0.85rem;">Change</button>
        </div>
      </div>
    </div>

    <section id="player-selection-card" class="card hidden" style="margin-bottom: 5px; overflow: hidden;">
      <div id="player-selector-ui" style="padding: 12px 15px;">
        <h2>Player Selection</h2>
        <div class="form-row">
          <label for="player-select">Player</label>
          <select id="player-select"></select>
        </div>
      </div>
      <div id="player-summary" class="hidden" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; background: #f9f9f9;">
        <span id="player-summary-text" style="font-weight: bold; font-size: 1.1rem;"></span>
        <button id="change-player-btn" class="secondary" style="padding: 4px 10px; font-size: 0.85rem;">Change</button>
      </div>
    </section>

    <section id="scoring-card" class="card hidden" style="margin-bottom: 5px; padding: 12px 15px;">
      <h2 style="margin-top: 0;">Enter Round Scores</h2>
      <p class="hint">Enter the cumulative pinbowling score after each ball. We will do the rest.</p>
      <div id="player-warning" class="notice hidden"></div>
      <form id="player-form">
        <div id="rounds-input"></div>
      </form>
    </section>

    <section id="results-card" class="card hidden" style="margin-bottom: 5px; padding: 12px 15px;">
      <h2 style="margin-top: 0;">Results</h2>
      <div id="results-empty" class="notice hidden"></div>
      <div id="results-panel" class="hidden">
        <table class="data-table">
          <thead>
            <tr>
              <th>Round</th>
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