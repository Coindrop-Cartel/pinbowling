<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PinBowling - Manage Locations</title>
  <link rel="stylesheet" href="styles.css" />
  <link rel="icon" type="image/png" href="images/logo.png" />
</head>
<body>
  <?php include 'includes/header.php'; ?>

  <main class="page-container">
    <header>
      <h1>Manage Locations</h1>
      <p>Define the venues where your leagues and events take place.</p>
    </header>

    <section class="card">
      <h2>Add New Location</h2>
      <form id="location-form">
        <div class="form-row">
          <label for="location-name">Location Name</label>
          <input id="location-name" type="text" placeholder="e.g. The Silver Ballroom" required />
        </div>
        <div class="form-actions">
          <button type="submit">Add Location</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Registered Venues</h2>
      <div id="locations-list-empty" class="notice">No locations registered yet.</div>
      <div id="locations-list"></div>
    </section>
  </main>

  <script src="js-config.php"></script>
  <script type="module" src="scripts/main.js"></script>
</body>
</html>