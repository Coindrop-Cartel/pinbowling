<?php $pageTitle = 'Scores'; ?>
  <main class="page-container">
    <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h1>Scores</h1>
    </header>
    <section style="margin-bottom: 5px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; background: #fff;">
      <div id="tournament-selector-ui" style="padding: 12px 15px;">
        <div class="tournament-selector-container"></div>
      </div>
      <div id="tournament-summary" class="hidden" style="display: flex; justify-content: space-between; align-items: center; padding: 6px 12px; background: #f9f9f9;">
        <span id="tournament-summary-text" style="font-weight: bold; font-size: 1.1rem;"></span>
        <div style="display: flex; gap: 8px;">
          <button id="print-sheet-btn" class="secondary" style="padding: 4px 10px; font-size: 0.85rem;">Print Blank Score Sheet</button>
          <button id="change-tournament-btn" class="secondary" style="padding: 4px 10px; font-size: 0.85rem;">Change</button>
        </div>
      </div>
    </section>

    <section id="player-selection-card" class="hidden" style="margin-bottom: 5px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; background: #fff;">
      <div id="player-selector-ui" style="padding: 12px 15px;">
        <h2>Player Selection</h2>
        <div class="form-row">
          <label for="player-select">Player</label>
          <select id="player-select"></select>
        </div>
      </div>
      <div id="player-summary" class="hidden" style="display: flex; justify-content: space-between; align-items: center; padding: 6px 12px; background: #f9f9f9;">
        <span id="player-summary-text" style="font-weight: bold; font-size: 1.1rem;"></span>
        <button id="change-player-btn" class="secondary" style="padding: 4px 10px; font-size: 0.85rem;">Change</button>
      </div>
    </section>

    <section id="scoring-card" class="hidden" style="margin-bottom: 5px; border: 1px solid #ddd; border-radius: 4px; background: #fff; padding: 12px 15px;">
      <h2 style="margin-top: 0;">Enter Round Scores</h2>
      <p class="hint">Enter the cumulative pinbowling score after each ball. We will do the rest.</p>
      <div id="player-warning" class="notice hidden"></div>
      <form id="player-form">
        <div id="rounds-input"></div>
      </form>
    </section>

    <section id="results-card" class="hidden" style="margin-bottom: 5px; border: 1px solid #ddd; border-radius: 4px; background: #fff; padding: 12px 15px;">
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