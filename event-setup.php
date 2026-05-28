<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PinBowling - Event Setup</title>
  <link rel="stylesheet" href="styles.css" />
  <link rel="icon" type="image/png" href="images/logo.png" />
</head>
<body>
  <?php include 'includes/header.php'; ?>

  <main class="page-container">
    <!-- Tournament selector (League & Event pickers) -->
    <div class="tournament-selector-container"></div>

    <header>
      <h1>Event Configuration</h1>
      <p>Assign machines to frames 1-10 and set the target scores for the selected event.</p>
    </header>

    <section class="card">
      <h2>Configure Frame</h2>
      <form id="frame-form">
        <div class="form-row">
          <label for="frame-number">Select Frame</label>
          <select id="frame-number" required>
            <option value="">Choose Frame...</option>
          </select>
        </div>
        <div class="form-row">
          <label for="machine-name">Machine Name</label>
          <input type="text" id="machine-name" placeholder="Start typing machine name..." required autocomplete="off" />
          <small class="hint">Type to search existing machines or enter a new one to override.</small>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div class="form-row">
            <label for="value-10">Target for a 10 (Strike)</label>
            <input type="text" id="value-10" placeholder="e.g. 50,000,000" />
          </div>
          <div class="form-row">
            <label for="value-1">Target for a 1</label>
            <input type="text" id="value-1" placeholder="e.g. 5,000,000" />
          </div>
        </div>
        <div id="preview-container" style="margin-top: 10px;">
          <label>Calculated Thresholds Preview:</label>
          <div id="preview-values" class="notice">
            Enter a 10 score or a 1 score to preview values for 9–2.
          </div>
        </div>
        <div class="form-actions" style="margin-top: 20px;">
          <button type="submit" id="save-frame-btn" disabled>Save Frame Configuration</button>
          <button type="button" id="print-machines-btn" class="secondary">Print Machine Signs</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Event Layout</h2>
      <div id="list-empty" class="notice">Select a league and event to manage target scores.</div>
      <table id="frames-table" class="data-table hidden">
        <thead>
          <tr>
            <th style="width: 80px;">Frame</th>
            <th>Machine</th>
            <th>Target Scores</th>
            <th style="width: 100px;">Actions</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </section>
  </main>

  <script src="js-config.php"></script>
  <script type="module" src="scripts/main.js"></script>
</body>
</html>