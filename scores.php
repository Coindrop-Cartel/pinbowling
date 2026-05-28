<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PinBowling - Scores</title>
  <link rel="stylesheet" href="styles.css" />
  <link rel="icon" type="image/png" href="images/logo.png" />
</head>
<body>
  <?php include 'includes/header.php'; ?>

  <main class="page-container">
    <section class="card">
      <h2>LEAGUE SELECTION</h2>
      <div class="tournament-selector-container"></div>
    </section>

    <header id="scoring-header" class="hidden">
      <h1>Player Score Tracker</h1>
      <button id="print-sheet-btn" class="secondary" style="margin-top: 1rem;">Print Blank Score Sheet</button>
    </header>

    <section id="player-selection-card" class="card hidden">
      <h2>Player Selection</h2>
      <div class="form-row">
        <label for="player-select">Player</label>
        <select id="player-select"></select>
      </div>
    </section>

    <section id="scoring-card" class="card hidden">
      <h2>Enter Frame Scores</h2>
      <p class="hint">Enter the cumulative pinbowling score after each ball. We will do the rest.</p>
      <div id="player-warning" class="notice hidden"></div>
      <form id="player-form">
        <div id="frames-input"></div>
      </form>
    </section>

    <section id="results-card" class="card hidden">
      <h2>Results</h2>
      <div id="results-empty" class="notice hidden"></div>
      <div id="results-panel" class="hidden">
        <table class="data-table">
          <thead>
            <tr>
              <th>Frame</th>
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
  <script src="js-config.php"></script>
  <script type="module" src="scripts/main.js"></script>
</body>
</html>