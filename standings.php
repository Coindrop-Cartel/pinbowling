<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PinBowling Standings</title>
  <link rel="stylesheet" href="styles.css" />
  <link rel="icon" type="image/png" href="images/logo.png" />
</head>
<body>
  <?php include 'includes/header.php'; ?>

  <main class="page-container standings-page">
    <div class="tournament-selector-container no-print"></div>

    <header>
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <h1>Standings</h1>
        <button id="tv-mode-btn" class="btn-standard secondary no-print">📺 TV Mode</button>
      </div>
      <p class="no-print">See the current player rankings and frame-by-frame scores.</p>
    </header>

    <section class="card">
      <h2>Current Standings</h2>
      <p class="hint">View specific event results or select <b>Season Summary</b> to see total bowling points accumulated across all events in the league.</p>
      <div id="standings-empty" class="notice hidden">No players or scores are available yet. Add a player and update scores first.</div>
      <div id="standings-wrapper">
        <table class="data-table standings-table">
          <thead id="standings-header">
          </thead>
          <tbody id="standings-body"></tbody>
        </table>
      </div>
    </section>
  </main>
  <script src="js-config.php"></script>
  <script type="module" src="scripts/main.js"></script>
</body>
</html>
