<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PinBowling - Manage Machines</title>
  <link rel="stylesheet" href="styles.css" />
  <link rel="icon" type="image/png" href="images/logo.png" />
</head>
<body>
  <?php include 'includes/header.php'; ?>

  <main class="page-container">
    <header>
      <h1>Manage Machines</h1>
      <p>Add or remove pinball machines from the global database.</p>
    </header>

    <section class="card">
      <h2>Add New Machine</h2>
      <form id="machine-form">
        <div class="form-row">
          <label for="machine-name">Machine Name</label>
          <input id="machine-name" type="text" placeholder="Filter registry or enter new name..." required autocomplete="off" />
        </div>
        <div class="form-actions">
          <button type="submit" id="add-machine-btn" disabled>Add Machine</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Machine Registry</h2>
      <div id="machines-list-empty" class="notice">No machines registered yet.</div>
      <div id="machines-list"></div>
    </section>
  </main>

  <script src="js-config.php"></script>
  <script type="module" src="scripts/main.js"></script>
</body>
</html>