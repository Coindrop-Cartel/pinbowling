<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PinBowling Player Score Tracker</title>
  <link rel="stylesheet" href="styles.css" />
  <link rel="icon" type="image/png" href="images/logo.png" />
</head>
<body>
  <?php include 'includes/header.php'; ?>

  <main class="page-container">
    <header>
      <h1>Manage Players</h1>
      <p>Add or remove players from the system.</p>
    </header>

    <section class="card">
      <h2 id="player-form-title">Add New Player</h2>
      <form id="player-form" autocomplete="off">
        <input type="hidden" id="editing-player-id" value="" />
        <div class="form-row">
          <label for="player-name">Player Name</label>
          <input id="player-name" type="text" placeholder="Enter player name" required />
        </div>
        <div class="form-row">
          <label for="ifpa-id">IFPA ID (Optional)</label>
          <input id="ifpa-id" type="text" placeholder="e.g., 12345" />
        </div>
        <div class="form-row">
          <label for="matchplay-id">Matchplay ID (Optional)</label>
          <input id="matchplay-id" type="text" placeholder="e.g., 67890" />
        </div>
        <div class="form-actions">
          <button type="submit" id="save-player-button">Save Player</button>
          <button type="button" id="cancel-edit-button" class="secondary hidden">Cancel Edit</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Registered Players</h2>
      <div id="player-list-container">
        <ul id="player-list" class="notice" style="list-style: none; padding: 14px 16px; margin: 0;">
          <li>Loading players...</li>
        </ul>
      </div>
    </section>
  </main>
  <script src="js-config.php"></script>
  <script type="module" src="scripts/main.js"></script>
</body>
</html>
