<?php $pageTitle = 'Standings'; ?>
  <main class="page-container standings-page">
    <header>
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <h1>Standings</h1>
        <button id="tv-mode-btn" class="btn-standard secondary no-print">TV Mode</button>
      </div>
      <p class="no-print">See the current player rankings and frame-by-frame scores.</p>
    </header>

    <div id="tournament-context-area" class="no-print">
      <div id="tournament-selector-ui" class="tournament-selector-container"></div>
      <div id="tournament-summary" class="card hidden no-tv" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; margin-bottom: 5px;">
        <span id="tournament-summary-text" style="font-weight: bold; font-size: 1.1rem;"></span>
        <div style="display: flex; gap: 8px;">
          <button id="change-tournament-btn" class="secondary" style="padding: 4px 10px; font-size: 0.85rem;">Change</button>
        </div>
      </div>
    </div>

    <section class="card">
      <h2 id="tv-title" class="hidden"></h2>
      <h2 class="no-tv">Current Standings</h2>
      <p id="standings-empty" class="hint">View specific event results or select <b>Season Summary</b> to see total bowling points accumulated across all events in the league.</p>
      <div id="standings-wrapper">
        <table class="data-table standings-table">
          <thead id="standings-header">
          </thead>
          <tbody id="standings-body"></tbody>
        </table>
      </div>
    </section>
  </main>
