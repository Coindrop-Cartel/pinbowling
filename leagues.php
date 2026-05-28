<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PinBowling - Leagues & Events</title>
  <link rel="stylesheet" href="styles.css" />
  <link rel="icon" type="image/png" href="images/logo.png" />
</head>
<body>
  <?php include 'includes/header.php'; ?>

  <main class="page-container">
    <header>
      <h1>Leagues & Events Management</h1>
    </header>

    <section class="card">
      <form id="league-form" autocomplete="off">
        <div class="form-row">
          <label for="league-name">League Name</label>
          <input id="league-name" type="text" placeholder="e.g., Summer 2024 League" required />
        </div>
        <div class="form-row">
          <label for="league-start-date">Start Date</label>
          <input id="league-start-date" type="date" />
        </div>
        <div class="form-actions">
          <button type="submit" id="create-league-btn" disabled>Create League</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Existing Leagues</h2>
      <div id="leagues-list-empty" class="notice">No leagues created yet.</div>
      <div id="leagues-list">
        <!-- Leagues will be rendered here -->
      </div>
    </section>

    <!-- Event Form (hidden by default, shown when adding/editing an event) -->
    <section id="event-form-card" class="card hidden">
      <h2 id="event-form-title">Add Event to League: <span id="event-form-league-name"></span></h2>
      <form id="event-form">
        <input type="hidden" id="event-league-id" />
        <input type="hidden" id="event-id" />
        <div class="form-row">
          <label for="event-name">Event Name</label>
          <input id="event-name" type="text" placeholder="e.g., Week 1" required />
        </div>
        <div class="form-row">
          <label for="event-date">Event Date</label>
          <input id="event-date" type="date" />
        </div>
        <div class="form-row">
          <label for="event-location">Location</label>
          <select id="event-location">
            <option value="">Select Location (Optional)</option>
            <!-- Locations will be loaded here -->
          </select>
        </div>
        <div class="form-actions">
          <button type="submit">Save Event</button>
          <button type="button" id="cancel-event-edit" class="secondary">Cancel</button>
        </div>
      </form>
    </section>
  </main>

  <script src="js-config.php"></script>
  <script type="module" src="scripts/main.js"></script>
</body>
</html>