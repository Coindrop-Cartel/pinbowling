<?php $pageTitle = 'Leagues & Events'; ?>
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
          <input id="league-start-date" type="date" required />
        </div>
        <div class="form-actions">
          <button type="submit" id="create-league-btn" disabled>Create League</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Leagues</h2>
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