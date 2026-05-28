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
    <!-- Current Selection Display -->
    <section class="card">
      <h2>Selection</h2>
      <div class="tournament-selector-container"></div>
    </section>

    <header>
      <h1>Event Configuration</h1>
      <p>Define the machine sequence and target scores for this event.</p>
    </header>

    <section id="config-card" class="card hidden">
      <h2 id="config-title">Add New Target</h2>
      <form id="round-form" autocomplete="off">
        <input type="hidden" id="order-number" />
        <div class="form-row">
          <label>Sequence Order</label>
          <div id="display-order" style="font-weight: bold; font-size: 1.2rem;"></div>
        </div>
        <div class="form-row">
          <label for="machine-name">Machine Name</label>
          <input type="text" id="machine-name" placeholder="Start typing machine name..." required />
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
        <div class="form-row" id="quick-fill-row" style="margin-top: -10px; margin-bottom: 20px;">
          <label>Quick Fill Strike Target (Venue Defaults)</label>
          <div style="display: flex; gap: 10px;">
            <button type="button" id="fill-easy" class="secondary" style="flex: 1; padding: 8px; font-size: 0.8rem;" disabled>Easy</button>
            <button type="button" id="fill-med" class="secondary" style="flex: 1; padding: 8px; font-size: 0.8rem;" disabled>Medium</button>
            <button type="button" id="fill-hard" class="secondary" style="flex: 1; padding: 8px; font-size: 0.8rem;" disabled>Hard</button>
          </div>
        </div>
        <div id="preview-container" style="margin-top: 10px;">
          <label>Calculated Thresholds Preview:</label>
          <div id="preview-values" class="notice">
            Enter a 10 score or a 1 score to preview values for 9–2.
          </div>
        </div>
        <div class="form-actions" style="margin-top: 20px;">
          <button type="submit" id="save-round-btn" disabled>Save</button>
          <button type="button" id="cancel-config-btn" class="secondary">Cancel</button>
        </div>
      </form>
    </section>

    <section class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h2>Event Layout</h2>
        <button type="button" id="add-target-btn" class="btn-standard">+ Add New Target</button>
      </div>
      <div id="list-empty" class="notice">Select a league and event to manage target scores.</div>
      <table id="rounds-table" class="data-table hidden">
        <thead>
          <tr>
            <th style="width: 50px;"></th>
            <th style="width: 80px;">Order</th>
            <th>Machine</th>
            <th>Target Scores</th>
            <th style="width: 100px;">Actions</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
      <div id="reorder-actions" class="form-actions hidden" style="margin-top: 1rem; justify-content: flex-end;">
        <button type="button" id="save-order-btn">Save</button>
      </div>
    </section>

    <div class="form-actions" style="margin-top: 20px; display: flex; justify-content: center;">
      <button type="button" id="done-setup-btn">DONE</button>
    </div>
  </main>

  <script src="js-config.php"></script>
  <script type="module" src="scripts/main.js"></script>
</body>
</html>