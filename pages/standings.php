<?php $pageTitle = 'Standings'; ?>
  <main class="page-container standings-page">
    <header>
      <div class="flex-between gap-10 wrap">
        <h1>Standings</h1>
        <button id="tv-mode-btn" class="btn-standard secondary no-print">TV Mode</button>
      </div>
      <p class="no-print">See the current rankings and frame-by-frame scores.</p>
    </header>

    <div id="tournament-context-area" class="no-print">
      <div id="tournament-selector-ui" class="tournament-selector-container"></div>
      <div id="player-filter-container" class="hidden mb-10"></div>
      <div id="tournament-summary" class="card hidden no-tv summary-box mb-5">
        <span id="tournament-summary-text" class="summary-text"></span>
        <div class="flex gap-8">
          <button id="change-tournament-btn" class="secondary btn-small">Change</button>
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
