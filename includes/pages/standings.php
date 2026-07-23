<?php $pageTitle = 'Standings'; ?>
  <main class="page-container standings-page">
    <header>
      <div class="flex-between gap-10 wrap">
        <h1>Standings</h1>
        <button id="tv-mode-btn" data-testid="tv-mode-button" class="btn-standard secondary no-print">TV Mode</button>
      </div>
      <p class="no-print">See the current rankings and frame-by-frame scores.</p>
    </header>
 
    <div id="tournament-context-area" data-testid="tournament-context-area" class="no-print">
      <div id="tournament-selector-ui" data-testid="tournament-selector-ui" class="tournament-selector-container"></div>
      <div id="player-filter-container" data-testid="player-filter-container" class="hidden mb-10"></div>
      <div id="tournament-summary" data-testid="tournament-summary" class="card hidden no-tv summary-box mb-5">
        <span id="tournament-summary-text" data-testid="tournament-summary-text" class="summary-text"></span>
        <div class="flex gap-8">
          <button id="change-tournament-btn" data-testid="change-tournament-button" class="secondary btn-small">Change</button>
        </div>
      </div>
    </div>
 
    <section class="card" data-testid="standings-card">
      <h2 id="tv-title" data-testid="tv-title" class="hidden"></h2>
      <h2 class="no-tv">Current Standings</h2>
      <p id="standings-empty" data-testid="standings-empty-notice" class="hint">View specific event results or select <b>Season Summary</b> to see total bowling points accumulated across all events in the league.</p>
      <div id="standings-wrapper" data-testid="standings-wrapper">
        <table id="standings-table" class="data-table standings-table">
          <thead id="standings-header" data-testid="standings-table-header">
          </thead>
          <tbody id="standings-body" data-testid="standings-table-body"></tbody>
        </table>
        <div id="playoff-bracket-container" class="hidden"></div>
      </div>
    </section>
  </main>
