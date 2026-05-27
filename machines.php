<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PinBowling - Machines</title>
  <link rel="stylesheet" href="styles.css" />
  <link rel="icon" type="image/png" href="images/logo.png" />
</head>
<body>
  <?php include 'includes/header.php'; ?>

  <main class="page-container">
    <div class="tournament-selector-container"></div>

    <header>
      <h1>Frame Configuration</h1>
      <p>Define the frame mapping and score values for your game.</p>
      <button id="print-machines-btn" class="secondary" style="margin-top: 1rem;">Print Machine Scores</button>
    </header>

    <section class="card">
      <h2>Update Frame</h2>
      <form id="frame-form">
        <div class="form-row">
          <label for="frame-number">Frame Number</label>
          <select id="frame-number" required>
            <option value="">Select frame</option>
          </select>
        </div>
        <div class="form-row">
          <label for="machine-name">PinBowling Machine Name</label>
          <input id="machine-name" type="text" placeholder="Machine name" required />
        </div>

        <fieldset>
          <legend>Score values for this frame</legend>
          <p class="hint">Enter a score for the 10 or the 1. Values for 9–2 will calculate automatically as percentages.</p>
          <div class="grid-values">
            <label><span>10:</span><input name="value-10" id="value-10" type="number" min="0" placeholder="Score for 10" /></label>
            <label><span>1:</span><input name="value-1" id="value-1" type="number" min="0" placeholder="Score for 1" /></label>
          </div>
          <div id="preview-values" class="preview-grid"></div>
        </fieldset>

        <div class="form-actions">
          <button type="submit" disabled>Update</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Configured Frames</h2>
      <div id="list-empty" class="notice">No frames configured yet. Add one to get started.</div>
      <table id="frames-table" class="data-table hidden">
        <thead>
          <tr>
            <th>Frame</th>
            <th>Machine</th>
            <th>Scores</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </section>
  </main>
  <script src="js-config.php"></script>
  <script src="scripts/api.js"></script>
  <script src="scripts/engine.js"></script>
  <script src="scripts/script.js"></script>
</body>
</html>