<?php
/**
 * Management interface for physical pinball venues.
 * 
 * This page provides UI for:
 * 1. Registering and editing Locations (Venues) where events take place.
 * 2. Mapping global Machines to specific Locations.
 * 3. Defining "baseline" target scores for machines at a venue to simplify event setup.
 */
?>
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
    </header>

    <section class="card">
      <form id="location-form" autocomplete="off">
        <input type="hidden" id="editing-location-id" value="" />
        <div class="form-row">
          <label for="location-name">Location Name</label>
          <input id="location-name" type="text" placeholder="e.g. The Silver Ballroom" required />
        </div>
        <div class="form-row">
          <label for="location-city">City</label>
          <input id="location-city" type="text" placeholder="e.g. St. Louis" />
        </div>
        <div class="form-row">
          <label for="location-state">State</label>
          <input id="location-state" type="text" placeholder="e.g. MO" />
        </div>
        <div class="form-actions">
          <button type="submit" id="save-location-button">Add Location</button>
          <button type="button" id="cancel-loc-edit-button" class="secondary hidden">Cancel Edit</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Registered Venues</h2>
      <div id="locations-list-empty" class="notice">No locations registered yet.</div>
      <div id="locations-list"></div>
    </section>

    <!-- Dynamic form for adding machines to a location -->
    <section id="location-machine-form-card" class="card hidden"></section>
  </main>

  <script src="js-config.php"></script>
  <script type="module" src="scripts/main.js"></script>
</body>
</html>